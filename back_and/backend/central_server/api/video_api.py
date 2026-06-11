"""
REST API Blueprint for the Video Source toggle (Live / Demo).

GET  /api/video-source                       → current status
POST /api/video-source {"mode", "filename"}  → switch to "live" or "demo"
                                                ("filename" selects a Demo
                                                Mode video; ignored for "live")
GET  /api/available-videos                   → .mp4 filenames found in
                                                assets/videos/ on disk
                                                (dynamic — no code changes
                                                needed to add videos)
"""
from flask import Blueprint, jsonify, request

from central_server.video_sources import list_demo_videos

video_bp = Blueprint("video_source", __name__)

_manager = None   # VideoWorkerManager, injected by init_video_api()


def init_video_api(manager):
    global _manager
    _manager = manager


def _err(code: str, message: str, status: int):
    return jsonify({"error": {"code": code, "message": message, "http_status": status}}), status


@video_bp.get("/api/video-source")
def get_video_source():
    return jsonify(_manager.status())


@video_bp.post("/api/video-source")
def set_video_source():
    data = request.get_json(silent=True)
    if not data:
        return _err("INVALID_PAYLOAD", "Request body must be valid JSON.", 400)

    mode = (data.get("mode") or "").strip().lower()
    if mode not in ("live", "demo"):
        return _err("INVALID_PAYLOAD", "mode must be 'live' or 'demo'.", 400)

    filename = data.get("filename")
    if filename is not None:
        filename = str(filename).strip() or None

    try:
        _manager.switch(mode, filename=filename)
    except FileNotFoundError as exc:
        return _err("VIDEO_SOURCE_NOT_FOUND", str(exc), 404)
    except ValueError as exc:
        return _err("INVALID_PAYLOAD", str(exc), 400)

    return jsonify(_manager.status())


@video_bp.get("/api/available-videos")
def get_available_videos():
    return jsonify({"videos": list_demo_videos()})
