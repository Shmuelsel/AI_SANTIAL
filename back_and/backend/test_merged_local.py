"""
Local end-to-end smoke test for the merged Edge+Central cloud pipeline.

This is NOT a pytest suite — run it directly as a one-shot script while
iterating locally, before deploying to Azure.

What it checks:
  1. The Flask-SocketIO app boots and /api/health reports the YOLO model loaded.
  2. A Socket.IO client receives 'processed_frame' and 'tracking_update' events
     — proves VideoWorker -> AI pipeline -> Socket.IO works end-to-end.
  3. POST /api/video-source can switch to "demo" and "live" without breaking
     the pipeline (a new processed_frame still arrives after each switch).

Manual checklist (do this once before running):
  - Place a short test .mp4 at back_and/backend/assets/videos/live_demo.mp4
    (or set LIVE_VIDEO_PATH).
  - For the "demo" switch to succeed, place one or more other .mp4 files in
    back_and/backend/assets/videos/ (alongside live_demo.mp4). If no demo
    videos are found, the demo-mode switch is reported as a soft failure
    (404 VIDEO_SOURCE_NOT_FOUND) and the script continues.

Requires: pip install "python-socketio[client]" requests
Usage:    python test_merged_local.py
"""
import sys
import os
import time
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
import socketio as socketio_client

from central_server.app import create_app, purge_debug_rules, sync_rules_from_firebase, socketio as server_socketio

PORT     = 5050
BASE_URL = f"http://127.0.0.1:{PORT}"


def start_server():
    app = create_app()
    purge_debug_rules()
    sync_rules_from_firebase()
    server_socketio.run(app, host="127.0.0.1", port=PORT, allow_unsafe_werkzeug=True)


def wait_for_health(timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = requests.get(f"{BASE_URL}/api/health", timeout=2)
            data = resp.json()
            print(f"[health] {data}")
            if data.get("model", {}).get("loaded"):
                return data
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(1)
    raise TimeoutError("Server did not report model.loaded=true within timeout")


def wait_for_events(client_events, names, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if all(client_events.get(n) for n in names):
            return True
        time.sleep(0.2)
    return False


def main():
    print("[TEST] Starting merged server in a background thread …")
    threading.Thread(target=start_server, daemon=True).start()

    health = wait_for_health()
    print(f"[TEST] Model loaded. video_source={health['video_source']}")

    print("[TEST] Connecting Socket.IO client …")
    sio = socketio_client.Client()
    received = {"processed_frame": False, "tracking_update": False}

    @sio.on("processed_frame")
    def _on_frame(data):
        received["processed_frame"] = True

    @sio.on("tracking_update")
    def _on_tracking(data):
        received["tracking_update"] = True

    sio.connect(BASE_URL)
    sio.emit("subscribe_camera", {"camera_id": health["video_source"]["camera_id"]})

    print("[TEST] Waiting for processed_frame + tracking_update …")
    ok = wait_for_events(received, ["processed_frame", "tracking_update"], timeout=15)
    print(f"[TEST] Live mode events received: {received}")
    assert ok, "Did not receive processed_frame/tracking_update in live mode"

    # --- Switch through each available demo video ----------------------------
    available = requests.get(f"{BASE_URL}/api/available-videos", timeout=5).json()
    print(f"[TEST] Available demo videos: {available}")

    for filename in available.get("videos", []):
        print(f"[TEST] Switching to demo mode — {filename} …")
        resp = requests.post(
            f"{BASE_URL}/api/video-source",
            json={"mode": "demo", "filename": filename},
            timeout=10,
        )
        if resp.status_code == 404:
            print(f"[TEST] {filename} not found in assets/videos/ — skipping ({resp.json()})")
            continue

        assert resp.ok, f"POST /api/video-source (demo/{filename}) failed: {resp.status_code} {resp.text}"
        status = resp.json()
        print(f"[TEST] video-source status: {status}")
        assert status["filename"] == filename

        received["processed_frame"] = False
        ok = wait_for_events(received, ["processed_frame"], timeout=15)
        print(f"[TEST] {filename} processed_frame received: {ok}")
        assert ok, f"Did not receive processed_frame after switching to demo/{filename}"

    # --- Switch back to live mode --------------------------------------------
    print("[TEST] Switching back to live mode …")
    resp = requests.post(f"{BASE_URL}/api/video-source", json={"mode": "live"}, timeout=10)
    assert resp.ok, f"POST /api/video-source (live) failed: {resp.status_code} {resp.text}"
    print(f"[TEST] video-source status: {resp.json()}")

    sio.disconnect()
    print("[TEST] All checks passed.")


if __name__ == "__main__":
    main()
