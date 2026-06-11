"""
Firebase Realtime Database client.

Manages three separate paths in the database:

  /alerts/{camera_id}/{alert_id}   — full AlertDocument (cooldown-limited, pushed by AlertManager)
  /events/{camera_id}/{event_id}   — lightweight zone-entry events (pushed on every new intrusion)
  /rules/{camera_id}/{rule_id}     — spatial rule documents (synced from REST API)

Falls back to a dry-run (console-only) mode when:
  - dry_run=True is passed explicitly (used by the debug CLI runner), or
  - The credentials file is missing or the SDK fails to initialise.
"""
import json
from typing import Dict, List, Optional

from shared import config
from shared.schemas import AlertDocument, Rule


class FirebaseClient:

    def __init__(self, dry_run: bool = False):
        self._dry_run = dry_run
        self._db      = None

        if dry_run:
            print("[INFO] FirebaseClient: dry-run mode — all writes printed to console only.")
            return

        try:
            import firebase_admin
            from firebase_admin import credentials, db as rtdb

            if not firebase_admin._apps:
                if config.FIREBASE_CREDENTIALS_JSON:
                    cred = credentials.Certificate(json.loads(config.FIREBASE_CREDENTIALS_JSON))
                else:
                    cred = credentials.Certificate(config.FIREBASE_CRED_PATH)
                firebase_admin.initialize_app(cred, {
                    "databaseURL": config.FIREBASE_DB_URL,
                })

            self._db = rtdb
            print("[INFO] FirebaseClient: *** LIVE MODE *** — writing to Firebase Realtime Database.")
            print(f"[INFO] FirebaseClient: database URL → {config.FIREBASE_DB_URL}")

        except FileNotFoundError:
            print(
                "[WARNING] FirebaseClient: credentials file not found — "
                "falling back to dry-run mode."
            )
            self._dry_run = True

        except Exception as exc:
            print(f"[WARNING] FirebaseClient: initialisation failed ({exc}) — "
                  "falling back to dry-run mode.")
            self._dry_run = True

    @property
    def is_live(self) -> bool:
        return not self._dry_run

    # ------------------------------------------------------------------
    # Alerts  →  /alerts/{camera_id}/{alert_id}
    # ------------------------------------------------------------------

    def push_alert(self, alert: AlertDocument) -> bool:
        """Write an alert document. Returns True on success."""
        path = f"/alerts/{alert.camera_id}/{alert.alert_id}"

        if self._dry_run:
            print(
                f"[FIREBASE-DRY-RUN] {path}  "
                f"type={alert.alert_type}  severity={alert.severity}  "
                f"global_id={alert.global_id}"
            )
            return True

        return self._set(path, alert.to_dict(), label=f"alert {alert.alert_id}")

    # ------------------------------------------------------------------
    # Events  →  /events/{camera_id}/{event_id}
    # ------------------------------------------------------------------

    def push_event(self, event: dict) -> bool:
        """Write a lightweight zone-entry event.  Called on every new intrusion
        (transition from outside → inside a restricted zone or rule zone)."""
        path = f"/events/{event['camera_id']}/{event['event_id']}"

        if self._dry_run:
            print(
                f"[FIREBASE-DRY-RUN] {path}  "
                f"type={event.get('event_type')}  person={event.get('person_id')}"
            )
            return True

        return self._set(path, event, label=f"event {event['event_id']}")

    def fetch_all_alerts(self, limit: int = 200) -> List[dict]:
        """
        Read /alerts, flatten to a list, sort by timestamp descending, return up to
        `limit` entries.  Used at startup to pre-populate the in-memory events log so
        the dashboard shows history immediately after a server restart.
        """
        if self._dry_run:
            return []

        try:
            snapshot = self._db.reference("/alerts").get()
            if not snapshot:
                return []

            alerts: List[dict] = []
            # /alerts → {camera_id: {alert_id: alert_dict}}
            for cam_alerts in snapshot.values():
                if isinstance(cam_alerts, dict):
                    for alert in cam_alerts.values():
                        if isinstance(alert, dict):
                            alerts.append(alert)

            alerts.sort(key=lambda a: a.get("timestamp_unix", 0), reverse=True)
            print(f"[INFO] FirebaseClient: fetched {len(alerts)} alert(s) for event log seed.")
            return alerts[:limit]

        except Exception as exc:
            print(f"[WARNING] FirebaseClient: could not fetch alerts — {exc}")
            return []

    # ------------------------------------------------------------------
    # Rules  →  /rules/{camera_id}/{rule_id}
    # ------------------------------------------------------------------

    def sync_rule(self, rule: Rule) -> bool:
        """
        Write or overwrite a rule document so the frontend can read the
        current polygon/tripwire configuration in real time.
        """
        path = f"/rules/{rule.camera_id}/{rule.rule_id}"

        if self._dry_run:
            print(f"[FIREBASE-DRY-RUN] {path}  name='{rule.name}'  type={rule.rule_type}")
            return True

        return self._set(path, rule.to_dict(), label=f"rule {rule.rule_id}")

    def remove_rule(self, camera_id: str, rule_id: str) -> bool:
        """Delete a rule document from Firebase."""
        path = f"/rules/{camera_id}/{rule_id}"

        if self._dry_run:
            print(f"[FIREBASE-DRY-RUN] DELETE {path}")
            return True

        try:
            self._db.reference(path).delete()
            print(f"[INFO] FirebaseClient: rule deleted → {rule_id}")
            return True
        except Exception as exc:
            print(f"[ERROR] FirebaseClient: rule delete failed for {rule_id} — {exc}")
            return False

    def fetch_all_rules(self) -> List[dict]:
        """
        Read the entire /rules node and return a flat list of rule dicts.
        Used at server startup to hydrate the RulesStore from Firebase,
        ensuring any rules created while the server was offline are recovered.

        Returns an empty list in dry-run mode or on any error.
        """
        if self._dry_run:
            return []

        try:
            snapshot = self._db.reference("/rules").get()
            if not snapshot:
                return []

            rules = []
            # /rules is structured as {camera_id: {rule_id: rule_dict}}
            for camera_rules in snapshot.values():
                if isinstance(camera_rules, dict):
                    for rule_dict in camera_rules.values():
                        if isinstance(rule_dict, dict):
                            rules.append(rule_dict)

            print(f"[INFO] FirebaseClient: fetched {len(rules)} rule(s) from /rules.")
            return rules

        except Exception as exc:
            print(f"[WARNING] FirebaseClient: could not fetch rules from Firebase — {exc}")
            return []

    # ------------------------------------------------------------------
    # Activity Log  →  /activity_log/{YYYYMMDD}/{camera_id}/{log_id}
    # ------------------------------------------------------------------

    def upsert_activity_log(
        self,
        camera_id:            str,
        global_id:            str,
        time_in_frame_seconds: float,
        zones_visited:        list,
        alert_types:          list,
        scores:               dict,
        now_iso:              str,
        date_key:             str,   # "YYYYMMDD"
        date_str:             str,   # "YYYY-MM-DD"
    ) -> None:
        gid_clean = global_id.replace("-", "")
        cam_clean = camera_id.replace("_", "")
        log_id    = f"log_{date_key}_{gid_clean}_{cam_clean}"
        path      = f"/activity_log/{date_key}/{camera_id}/{log_id}"

        if self._dry_run:
            print(f"[FIREBASE-DRY-RUN] upsert {path}  gid={global_id}  t={int(time_in_frame_seconds)}s")
            return

        try:
            ref      = self._db.reference(path)
            existing = ref.get() or {}
            ep       = existing.get("peak_scores", {})

            ref.set({
                "log_id":             log_id,
                "date":               date_str,
                "camera_id":          camera_id,
                "global_id":          global_id,
                "first_seen_iso":     existing.get("first_seen_iso") or now_iso,
                "last_seen_iso":      now_iso,
                "total_time_seconds": int(time_in_frame_seconds),
                "alerts_triggered":   list(set(existing.get("alerts_triggered", []) + alert_types)),
                "alert_count":        existing.get("alert_count", 0) + len(alert_types),
                "peak_scores": {
                    "climbing_score":     max(ep.get("climbing_score",     0), scores.get("climbing_score",     0)),
                    "loitering_score":    max(ep.get("loitering_score",    0), scores.get("loitering_score",    0)),
                    "total_person_score": max(ep.get("total_person_score", 0), scores.get("total_person_score", 0)),
                },
                "zones_visited": list(set(existing.get("zones_visited", []) + zones_visited)),
                "snapshot_url":  existing.get("snapshot_url"),
            })
        except Exception as exc:
            print(f"[ERROR] FirebaseClient: activity log upsert failed for {log_id} — {exc}")

    def fetch_activity_log(self, date_str: str, camera_id: Optional[str] = None) -> List[dict]:
        """Return all activity log entries for a given date, optionally filtered by camera."""
        date_key = date_str.replace("-", "")
        path     = f"/activity_log/{date_key}"

        if self._dry_run:
            return []

        try:
            snapshot = self._db.reference(path).get()
            if not snapshot:
                return []

            entries: List[dict] = []
            for cam, cam_entries in snapshot.items():
                if camera_id and cam != camera_id:
                    continue
                if isinstance(cam_entries, dict):
                    for entry in cam_entries.values():
                        if isinstance(entry, dict):
                            entries.append(entry)

            return entries

        except Exception as exc:
            print(f"[WARNING] FirebaseClient: could not fetch activity log for {date_str} — {exc}")
            return []

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _set(self, path: str, data: dict, label: str) -> bool:
        try:
            self._db.reference(path).set(data)
            print(f"[INFO] FirebaseClient: written → {label}")
            return True
        except Exception as exc:
            print(f"[ERROR] FirebaseClient: write failed for {label} — {exc}")
            return False
