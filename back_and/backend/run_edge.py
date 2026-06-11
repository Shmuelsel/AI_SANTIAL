"""
Entry point — Edge Node only.

Requires run_server.py to already be running (or reachable at config.INGEST_URL).
Connects to the camera, runs AI detection in a background thread, and uses two
separate channels to communicate with the Central Server:

  Channel 1 — POST /ingest        AI data only (Re-ID features, tracking state)
                                  Rate: SEND_INTERVAL_SECONDS (1/sec)
                                  No frame — keeps payload small and fast.

  Channel 2 — POST /stream_frame  Raw JPEG frame only, no AI data.
                                  Rate: STREAM_FPS (10/sec default)
                                  Uses a persistent HTTP Session (keep-alive)
                                  so there is no per-frame TCP handshake.

Decoupling these two channels is what makes the frontend video smooth:
the frame rate is no longer capped by the AI pipeline or alert-processing cycle.

Thread layout
─────────────
  CameraStream      — background reader, always holds the latest frame
  _detection_worker — runs YOLO on frames from _frame_queue (maxsize=1),
                      enqueues AI-only payloads for the network worker
  _network_worker   — POSTs AI payloads from _payload_queue (maxsize=1)
  _stream_worker    — POSTs raw JPEG frames from _stream_frame_queue (maxsize=1)
  main loop         — reads camera + draws; never blocks on AI or network

Usage:
    python run_edge.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import time
import queue
import threading
import urllib.parse
import requests
import cv2
import numpy as np

from shared import config
from edge_node.camera_stream   import CameraStream
from edge_node.detector        import Detector
from edge_node.payload_builder import build_payload


# ---------------------------------------------------------------------------
# Shared state — written by background threads, read by the display loop
# ---------------------------------------------------------------------------

# Minimal per-track snapshot needed for on-screen drawing.
# Keys: pid (int) → {box, box_active, first_seen}
_tracked_snapshot: dict = {}
_snapshot_lock = threading.Lock()

# Latest enrichment from the Central Server.
_server_state: dict = {
    "global_ids":      {},
    "effective_times": {},
    "alert_ids":       set(),
    "alert_types_map": {},
}
_server_lock = threading.Lock()

# maxsize=1 means: if the consumer is busy the producer's put_nowait() raises
# Full and the stale frame/payload is simply dropped — we always want fresh data.
_frame_queue        = queue.Queue(maxsize=1)   # display loop  → detection thread
_payload_queue      = queue.Queue(maxsize=1)   # detection thread → network thread (AI data)
_stream_frame_queue = queue.Queue(maxsize=1)   # display loop  → stream thread (raw JPEG)

# Module-level reference to the live CameraStream, set by main() before threads
# start.  The network worker calls reconfigure() on this object when the Central
# Server pushes a new camera config via the /ingest response.
_camera_stream: "CameraStream | None" = None

# ---------------------------------------------------------------------------
# Restricted zone — fetched from the server at startup, read by every thread
# ---------------------------------------------------------------------------

# List of (x, y) tuples in normalised [0, 1] coordinates.
# Written once at startup by _fetch_restricted_zone(); treated as read-only
# after that, so no lock is needed for concurrent reads.
_restricted_zone: list = []


# ---------------------------------------------------------------------------
# Restricted zone helpers
# ---------------------------------------------------------------------------

def _fetch_restricted_zone() -> None:
    """Fetch the current restricted zone from the server and cache it locally.
    Called once in main() before any threads start — blocking is fine here."""
    global _restricted_zone
    url = config.SERVER_BASE_URL.rstrip("/") + "/api/restricted_zone"
    try:
        resp = requests.get(url, timeout=5)
        points = resp.json().get("zone", [])
        _restricted_zone = [(p["x"], p["y"]) for p in points]
        if _restricted_zone:
            print(f"[INFO] Restricted zone loaded: {len(_restricted_zone)} points.")
        else:
            print("[INFO] Restricted zone: none defined on server.")
    except Exception as exc:
        print(f"[WARNING] Could not fetch restricted zone ({exc}) — proceeding without one.")


def _point_in_polygon(cx: float, cy: float, poly: list) -> bool:
    """Ray-casting point-in-polygon test (pixel coordinates)."""
    n, inside, j = len(poly), False, len(poly) - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > cy) != (yj > cy)) and (cx < (xj - xi) * (cy - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


# ---------------------------------------------------------------------------
# Background workers
# ---------------------------------------------------------------------------

def _detection_worker(detector: Detector, stop: threading.Event) -> None:
    """
    Pulls frames from _frame_queue, runs YOLO + feature extraction, updates
    the display snapshot, then enqueues the built payload for the network
    thread (rate-limited to SEND_INTERVAL_SECONDS).
    """
    last_sent = 0.0

    while not stop.is_set():
        try:
            frame = _frame_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        detector.process_frame(frame)

        # Determine which tracked persons are inside the restricted zone.
        inside_zone_ids: set = set()
        if _restricted_zone:
            fw, fh = detector.frame_size
            # Scale normalised zone coordinates to pixel space once per frame.
            zone_px = [(x * fw, y * fh) for x, y in _restricted_zone]
            for pid, data in detector.tracked.items():
                if not data.get("box_active"):
                    continue
                x1, y1, x2, y2 = data["box"]
                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                if _point_in_polygon(cx, cy, zone_px):
                    inside_zone_ids.add(pid)

        # Build a minimal snapshot for the display loop.
        snapshot = {
            pid: {
                "box":        list(data["box"]),
                "box_active": data["box_active"],
                "first_seen": data["first_seen"],
                "inside_zone": pid in inside_zone_ids,
            }
            for pid, data in detector.tracked.items()
        }
        with _snapshot_lock:
            _tracked_snapshot.clear()
            _tracked_snapshot.update(snapshot)

        # Rate-limit payloads to avoid hammering the server.
        now = time.time()
        if now - last_sent < config.SEND_INTERVAL_SECONDS:
            continue

        payload = build_payload(
            detector        = detector,
            camera_id       = config.CAMERA_ID,
            frame           = None,
            include_frame   = False,
            inside_zone_ids = inside_zone_ids,
        )
        if payload.persons:
            try:
                _payload_queue.put_nowait(payload)
                last_sent = now
            except queue.Full:
                pass  # network thread still busy — drop this payload


def _apply_camera_config(cfg: dict) -> None:
    """Reconfigure the live CameraStream with credentials received from the server."""
    global _camera_stream
    if not _camera_stream:
        return

    rtsp_url = cfg.get("rtsp_url", "")
    username = cfg.get("rtsp_username")
    password = cfg.get("rtsp_password")

    if username and password and rtsp_url:
        parsed   = urllib.parse.urlparse(rtsp_url)
        rtsp_url = parsed._replace(
            netloc=f"{urllib.parse.quote(username, safe='')}:"
                   f"{urllib.parse.quote(password, safe='')}@"
                   f"{parsed.hostname}:{parsed.port or 554}"
        ).geturl()

    cam_id = cfg.get("camera_id", "unknown")
    print(f"[Edge] Reconfiguring camera '{cam_id}' from server push …")
    _camera_stream.reconfigure(rtsp_url)


def _network_worker(stop: threading.Event) -> None:
    """
    POSTs payloads to the Central Server and writes enriched responses
    (global IDs, dwell times, alert types) back into _server_state.
    Applies any camera_config delivered in the response payload.
    """
    while not stop.is_set():
        try:
            payload = _payload_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        try:
            resp = requests.post(
                config.INGEST_URL,
                json    = payload.to_dict(),
                timeout = 5,
            )
            data = resp.json()
            with _server_lock:
                _server_state["global_ids"].update(data.get("global_ids", {}))
                _server_state["effective_times"].update(data.get("effective_times", {}))
                for aid in data.get("alerts", []):
                    _server_state["alert_ids"].add(aid)
                for pid_s, types in data.get("alert_types", {}).items():
                    existing = _server_state["alert_types_map"].setdefault(pid_s, [])
                    for t in types:
                        if t not in existing:
                            existing.append(t)

            if "camera_config" in data:
                _apply_camera_config(data["camera_config"])

        except requests.exceptions.ConnectionError:
            print("[WARNING] Edge Node: cannot reach Central Server — is it running?")
        except Exception as exc:
            print(f"[WARNING] Edge Node: ingest request failed — {exc}")


def _stream_worker(stop: threading.Event) -> None:
    """
    Pushes raw JPEG frames to POST /stream_frame at STREAM_FPS.

    Uses a persistent requests.Session so the TCP connection to the server
    is reused across frames — no handshake overhead per frame.
    The server decodes the JPEG, overlays the latest annotation state
    (cached from the most recent /ingest response), and emits processed_frame
    to the frontend via Socket.IO.
    """
    session  = requests.Session()
    url      = (config.SERVER_BASE_URL.rstrip("/")
                + f"/stream_frame?camera_id={config.CAMERA_ID}")
    interval = 1.0 / config.STREAM_FPS

    while not stop.is_set():
        try:
            frame = _stream_frame_queue.get(timeout=interval)
        except queue.Empty:
            continue

        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
        try:
            session.post(
                url,
                data    = buf.tobytes(),
                headers = {"Content-Type": "image/jpeg"},
                timeout = 2,
            )
        except requests.exceptions.ConnectionError:
            pass  # server unreachable — will retry on next frame
        except Exception as exc:
            print(f"[WARNING] Stream worker: {exc}")


# ---------------------------------------------------------------------------
# Main — display loop only; never blocks on AI or network
# ---------------------------------------------------------------------------

def main() -> None:
    print("[INFO] Smart Eye Edge Node starting …")
    print(f"[INFO] Camera   : {config.VIDEO_SOURCE}")
    print(f"[INFO] Server   : {config.INGEST_URL}")

    global _camera_stream
    detector = Detector()
    stream   = CameraStream(config.VIDEO_SOURCE)
    _camera_stream = stream   # expose to network worker for dynamic reconfiguration

    if not stream.start():
        print("[ERROR] Failed to connect to camera. Exiting.")
        sys.exit(1)

    print("[INFO] Camera connected. Fetching restricted zone …")
    _fetch_restricted_zone()
    time.sleep(1)

    stop = threading.Event()
    for target, name in (
        (_detection_worker, "detection"),
        (_network_worker,   "network"),
        (_stream_worker,    "stream"),
    ):
        args = (detector, stop) if name == "detection" else (stop,)
        threading.Thread(target=target, args=args, daemon=True, name=name).start()

    cv2.namedWindow("Smart Eye — Edge Node", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Smart Eye — Edge Node", 960, 540)

    frame_count        = 0
    prev_time          = time.time()
    last_stream_submit = 0.0
    stream_interval    = 1.0 / config.STREAM_FPS

    try:
        while True:
            frame = stream.get_frame()
            if frame is None:
                time.sleep(0.005)
                continue

            frame_count += 1
            now       = time.time()
            fps       = 1.0 / max(now - prev_time, 0.001)
            prev_time = now

            # Submit every Nth frame to the detection thread; drop if it's busy.
            if frame_count % config.DETECT_EVERY_N_FRAMES == 0:
                try:
                    _frame_queue.put_nowait(frame.copy())
                except queue.Full:
                    pass

            # Submit frames to the stream worker at STREAM_FPS; drop if busy.
            if now - last_stream_submit >= stream_interval:
                last_stream_submit = now
                try:
                    _stream_frame_queue.put_nowait(frame.copy())
                except queue.Full:
                    pass

            # Read shared state — shallow copies under brief locks.
            with _snapshot_lock:
                snapshot = dict(_tracked_snapshot)
            with _server_lock:
                global_ids      = dict(_server_state["global_ids"])
                effective_times = dict(_server_state["effective_times"])
                alert_ids       = set(_server_state["alert_ids"])
                alert_types_map = dict(_server_state["alert_types_map"])

            display = _annotate_local(frame, snapshot, global_ids, effective_times,
                                      alert_ids, alert_types_map, fps)
            cv2.imshow("Smart Eye — Edge Node", display)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        stream.stop()
        cv2.destroyAllWindows()
        print("[INFO] Edge Node stopped.")


# ---------------------------------------------------------------------------
# Annotation helper
# ---------------------------------------------------------------------------

_COLOR_ZONE_INTRUDER = (0, 0, 255)     # red   — person inside restricted zone
_COLOR_ZONE_OUTLINE  = (0, 255, 255)   # yellow — restricted zone polygon border


def _annotate_local(frame, snapshot, global_ids, effective_times,
                    alert_ids, alert_types_map, fps):
    annotated = frame.copy()
    now       = time.time()
    fh, fw    = annotated.shape[:2]

    # Draw the restricted zone polygon (if defined).
    if _restricted_zone and len(_restricted_zone) >= 3:
        zone_px = np.array(
            [(int(x * fw), int(y * fh)) for x, y in _restricted_zone],
            dtype=np.int32,
        )
        cv2.polylines(annotated, [zone_px], isClosed=True,
                      color=_COLOR_ZONE_OUTLINE, thickness=2)

    for pid, data in snapshot.items():
        if not data.get("box_active"):
            continue
        x1, y1, x2, y2 = data["box"]
        gid       = global_ids.get(str(pid), str(pid))
        eff_time  = effective_times.get(str(pid), int(now - data["first_seen"]))
        types     = alert_types_map.get(str(pid), [])
        in_zone   = data.get("inside_zone", False)

        # Zone intrusion takes priority over other alert colours.
        if in_zone:
            color = _COLOR_ZONE_INTRUDER
        elif "climbing" in types:
            color = config.COLOR_CLIMBING
        elif types:
            color = config.COLOR_LOITERING
        else:
            color = config.COLOR_NORMAL

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"ID:{gid} | {eff_time}s"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(annotated, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
        cv2.putText(annotated, label, (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        alert_label = "ZONE INTRUSION" if in_zone else (" | ".join(types).upper() if types else "")
        if alert_label:
            cv2.putText(annotated, alert_label,
                        (x1, y2 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    cv2.putText(annotated, f"FPS: {fps:.1f}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
    return annotated


if __name__ == "__main__":
    main()
