"""
Spatial rule storage.

Rules are kept in an in-memory dictionary for fast per-frame reads by the
Spatial Engine, persisted to security_log.db (SQLite) for local durability,
and synced to Firebase Realtime Database under /rules/{camera_id}/{rule_id}
so the frontend can read and react to configuration changes in real time.

Firebase sync is optional: call set_firebase() after construction to enable it.
The store works fully without Firebase (SQLite-only mode).
"""
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Dict, List, Optional

from shared.schemas import Rule, RuleGeometry, RuleConditions, Point

if TYPE_CHECKING:
    from central_server.firebase_client import FirebaseClient

_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "security_log.db",
)


class RulesStore:

    def __init__(self):
        self._rules:    Dict[str, Rule]        = {}
        self._firebase: Optional["FirebaseClient"] = None
        self._init_db()
        self._load_from_db()

    def set_firebase(self, firebase_client: "FirebaseClient"):
        """
        Inject the FirebaseClient after construction so rules are
        synced to /rules/{camera_id}/{rule_id} on every write.
        """
        self._firebase = firebase_client

    # ------------------------------------------------------------------
    # Public CRUD
    # ------------------------------------------------------------------

    def get_rules(self, camera_id: Optional[str] = None) -> List[Rule]:
        rules = list(self._rules.values())
        if camera_id:
            rules = [r for r in rules if r.camera_id == camera_id]
        return rules

    def get_rule(self, rule_id: str) -> Optional[Rule]:
        return self._rules.get(rule_id)

    def add_rule(self, rule: Rule) -> Rule:
        if not rule.rule_id:
            rule.rule_id = f"rule_{uuid.uuid4().hex[:8]}"
        rule.created_at = datetime.now(timezone.utc).isoformat()
        self._rules[rule.rule_id] = rule
        self._persist(rule)
        if self._firebase:
            self._firebase.sync_rule(rule)
        return rule

    def update_rule(self, rule_id: str, fields: dict) -> Optional[Rule]:
        rule = self._rules.get(rule_id)
        if not rule:
            return None
        for k, v in fields.items():
            if hasattr(rule, k):
                setattr(rule, k, v)
        self._persist(rule)
        if self._firebase:
            self._firebase.sync_rule(rule)
        return rule

    def delete_rule(self, rule_id: str) -> bool:
        rule = self._rules.get(rule_id)
        if not rule:
            return False
        camera_id = rule.camera_id
        del self._rules[rule_id]
        self._delete(rule_id)
        if self._firebase:
            self._firebase.remove_rule(camera_id, rule_id)
        return True

    def load_from_firebase(self) -> int:
        """
        Fetch all rules stored in Firebase and merge them into the local
        store + SQLite.  Rules that already exist locally are overwritten
        with the Firebase version (Firebase is the source of truth for
        operator-configured rules).

        Returns the number of rules imported from Firebase.
        """
        if not self._firebase:
            return 0

        remote_rules = self._firebase.fetch_all_rules()
        imported     = 0

        for raw in remote_rules:
            try:
                rule = _deserialize(raw)
                # Skip debug zones even if they somehow end up in Firebase.
                if rule.rule_id.startswith("debug_"):
                    continue
                self._rules[rule.rule_id] = rule
                self._persist(rule)
                imported += 1
            except Exception as exc:
                print(f"[WARNING] RulesStore: could not import Firebase rule — {exc}")

        if imported:
            print(f"[INFO] RulesStore: imported {imported} rule(s) from Firebase.")
        else:
            print("[INFO] RulesStore: no remote rules to import — starting with local state.")

        return imported

    # ------------------------------------------------------------------
    # SQLite persistence
    # ------------------------------------------------------------------

    def _init_db(self):
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS rules (
                    rule_id   TEXT PRIMARY KEY,
                    camera_id TEXT NOT NULL,
                    data      TEXT NOT NULL
                )
            """)
            conn.commit()

    def _load_from_db(self):
        with sqlite3.connect(_DB_PATH) as conn:
            for (data_json,) in conn.execute("SELECT data FROM rules"):
                try:
                    rule = _deserialize(json.loads(data_json))
                    self._rules[rule.rule_id] = rule
                except Exception as exc:
                    print(f"[WARNING] RulesStore: skipping malformed DB row — {exc}")

        count = len(self._rules)
        if count:
            print(f"[INFO] RulesStore: loaded {count} rule(s) from local database.")

    def _persist(self, rule: Rule):
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO rules (rule_id, camera_id, data) VALUES (?,?,?)",
                (rule.rule_id, rule.camera_id, json.dumps(rule.to_dict())),
            )
            conn.commit()

    def _delete(self, rule_id: str):
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute("DELETE FROM rules WHERE rule_id = ?", (rule_id,))
            conn.commit()


# ---------------------------------------------------------------------------
# Deserialisation helper  (used by both _load_from_db and load_from_firebase)
# ---------------------------------------------------------------------------

def _deserialize(d: dict) -> Rule:
    geom = RuleGeometry(
        type   = d["geometry"]["type"],
        points = [Point(**p) for p in d["geometry"]["points"]],
    )
    cond_raw = d.get("conditions", {})
    cond = RuleConditions(
        min_dwell_seconds      = cond_raw.get("min_dwell_seconds", 30),
        loitering_zone_returns = cond_raw.get("loitering_zone_returns", 3),
        crossing_direction     = cond_raw.get("crossing_direction", "any"),
    )
    return Rule(
        rule_id           = d["rule_id"],
        camera_id         = d["camera_id"],
        name              = d["name"],
        rule_type         = d["rule_type"],
        alert_type        = d["alert_type"],
        geometry          = geom,
        conditions        = cond,
        active            = d.get("active", True),
        created_at        = d.get("created_at", ""),
        sensitivity_level = int(d.get("sensitivity_level", 3)),
    )
