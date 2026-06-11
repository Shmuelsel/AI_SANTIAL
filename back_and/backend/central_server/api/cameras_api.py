"""
REST API Blueprint for dynamic camera configuration.
Implements POST/GET/DELETE /api/cameras as defined in API_CONTRACT.md §7.

The relay_fn injected here is responsible for pushing the config to the
Edge Node.  It receives (camera_id, config) and returns "sent" or "queued".
"""
from flask import Blueprint, jsonify, request

cameras_bp = Blueprint("cameras", __name__)

_camera_store = None
_relay_fn     = None   # callable(camera_id: str, config: dict) → str


def init_cameras_api(camera_store, relay_fn):
    global _camera_store, _relay_fn
    _camera_store = camera_store
    _relay_fn     = relay_fn


def _err(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message, "http_status": status}}), status


# ---------------------------------------------------------------------------
# GET /api/cameras
# ---------------------------------------------------------------------------

@cameras_bp.get("/api/cameras")
def list_cameras():
    return jsonify({"cameras": _camera_store.get_all()})


# ---------------------------------------------------------------------------
# POST /api/cameras
# ---------------------------------------------------------------------------

@cameras_bp.post("/api/cameras")
def register_camera():
    data = request.get_json(silent=True)
    if not data:
        return _err("INVALID_PAYLOAD", "Request body must be valid JSON.", 400)

    camera_id = (data.get("camera_id") or "").strip()
    rtsp_url  = (data.get("rtsp_url")  or "").strip()
    if not camera_id or not rtsp_url:
        return _err("INVALID_PAYLOAD", "camera_id and rtsp_url are required.", 400)

    config = {
        "camera_id":     camera_id,
        "rtsp_url":      rtsp_url,
        "rtsp_username": data.get("rtsp_username") or None,
        "rtsp_password": data.get("rtsp_password") or None,
        "resolution":    data.get("resolution")    or None,
        "fps_cap":       data.get("fps_cap")       or None,
    }
    saved         = _camera_store.save(config)
    relay_status  = _relay_fn(camera_id, saved)

    return jsonify({
        "camera_id":     camera_id,
        "registered_at": saved["registered_at"],
        "relay_status":  relay_status,
        "message":       "Camera config registered and relayed to edge node",
    }), 201


# ---------------------------------------------------------------------------
# DELETE /api/cameras/<camera_id>
# ---------------------------------------------------------------------------

@cameras_bp.delete("/api/cameras/<camera_id>")
def delete_camera(camera_id: str):
    if not _camera_store.delete(camera_id):
        return _err("CAMERA_CONFIG_NOT_FOUND",
                    f"No camera config found for '{camera_id}'.", 404)
    return jsonify({"camera_id": camera_id, "message": "Camera config removed"})
