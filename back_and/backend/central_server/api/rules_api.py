"""
REST API Blueprint for spatial rule management and activity log.
Implements all endpoints defined in API_CONTRACT.md Sections 3 and 6.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from shared.schemas import Rule, RuleGeometry, RuleConditions, Point

rules_bp = Blueprint("rules", __name__)

# Injected by the app factory via init_rules_api().
_store    = None
_firebase = None


def init_rules_api(store, firebase=None):
    global _store, _firebase
    _store    = store
    _firebase = firebase


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _err(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message, "http_status": status}}), status


def _parse_geometry(geo_data: dict):
    """Parse geometry dict and validate point counts."""
    geo_type = geo_data.get("type", "")
    pts_raw  = geo_data.get("points", [])

    if geo_type == "polygon" and len(pts_raw) < 3:
        return None, _err("INVALID_GEOMETRY", "Polygon requires at least 3 points.", 400)
    if geo_type == "line" and len(pts_raw) != 2:
        return None, _err("INVALID_GEOMETRY", "Tripwire line requires exactly 2 points.", 400)
    if geo_type not in ("polygon", "line"):
        return None, _err("INVALID_GEOMETRY", f"Unknown geometry type '{geo_type}'.", 400)

    geom = RuleGeometry(
        type   = geo_type,
        points = [Point(p["x"], p["y"]) for p in pts_raw],
    )
    return geom, None


# ---------------------------------------------------------------------------
# GET /api/rules
# ---------------------------------------------------------------------------

@rules_bp.get("/api/rules")
def list_rules():
    camera_id = request.args.get("camera_id")
    rules     = _store.get_rules(camera_id)
    return jsonify({"rules": [r.to_dict() for r in rules]})


# ---------------------------------------------------------------------------
# POST /api/rules
# ---------------------------------------------------------------------------

@rules_bp.post("/api/rules")
def create_rule():
    data = request.get_json(silent=True)
    if not data:
        return _err("INVALID_PAYLOAD", "Request body must be valid JSON.", 400)

    required = ["camera_id", "rule_type", "name", "alert_type", "geometry"]
    missing  = [f for f in required if f not in data]
    if missing:
        return _err("INVALID_PAYLOAD", f"Missing required fields: {missing}", 400)

    geom, err = _parse_geometry(data["geometry"])
    if err:
        return err

    cond_raw = data.get("conditions", {})
    sensitivity_raw = data.get("sensitivity_level", 3)
    try:
        sensitivity = max(1, min(5, int(sensitivity_raw)))
    except (TypeError, ValueError):
        sensitivity = 3

    rule = Rule(
        rule_id           = "",
        camera_id         = data["camera_id"],
        name              = data["name"],
        rule_type         = data["rule_type"],
        alert_type        = data["alert_type"],
        geometry          = geom,
        conditions        = RuleConditions(
            min_dwell_seconds      = cond_raw.get("min_dwell_seconds", 30),
            loitering_zone_returns = cond_raw.get("loitering_zone_returns", 3),
            crossing_direction     = cond_raw.get("crossing_direction", "any"),
        ),
        active            = data.get("active", True),
        sensitivity_level = sensitivity,
    )
    rule = _store.add_rule(rule)
    return jsonify({
        "rule_id":          rule.rule_id,
        "camera_id":        rule.camera_id,
        "sensitivity_level": rule.sensitivity_level,
        "created_at":       rule.created_at,
        "message":          "Rule created successfully",
    }), 201


# ---------------------------------------------------------------------------
# PATCH /api/rules/<rule_id>
# ---------------------------------------------------------------------------

@rules_bp.patch("/api/rules/<rule_id>")
def update_rule(rule_id: str):
    if not _store.get_rule(rule_id):
        return _err("RULE_NOT_FOUND", f"No rule with id '{rule_id}'.", 404)

    data    = request.get_json(silent=True) or {}
    allowed = {"active", "name", "sensitivity_level"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if "sensitivity_level" in updates:
        try:
            updates["sensitivity_level"] = max(1, min(5, int(updates["sensitivity_level"])))
        except (TypeError, ValueError):
            updates.pop("sensitivity_level")
    rule    = _store.update_rule(rule_id, updates)
    return jsonify({
        "rule_id":    rule.rule_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "message":    "Rule updated",
    })


# ---------------------------------------------------------------------------
# DELETE /api/rules/<rule_id>
# ---------------------------------------------------------------------------

@rules_bp.delete("/api/rules/<rule_id>")
def delete_rule(rule_id: str):
    if not _store.delete_rule(rule_id):
        return _err("RULE_NOT_FOUND", f"No rule with id '{rule_id}'.", 404)
    return jsonify({"rule_id": rule_id, "message": "Rule deleted"})


# ---------------------------------------------------------------------------
# GET /api/activity-log
# ---------------------------------------------------------------------------

@rules_bp.get("/api/activity-log")
def get_activity_log():
    date_str  = request.args.get("date", "").strip()
    camera_id = request.args.get("camera_id")

    if not date_str:
        return _err("INVALID_DATE", "Query parameter 'date' is required (YYYY-MM-DD).", 400)

    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return _err("INVALID_DATE", f"Invalid date format '{date_str}'. Expected YYYY-MM-DD.", 400)

    if _firebase:
        entries = _firebase.fetch_activity_log(date_str, camera_id)
    else:
        entries = []

    return jsonify({
        "date":          date_str,
        "camera_id":     camera_id,
        "entries":       entries,
        "total_entries": len(entries),
    })
