"""
Headless CLI Debug Runner.

Runs the FULL pipeline — Edge Node capture, Re-ID, Spatial Risk Engine,
Alert Manager — in a single process with no HTTP/Flask server in between.
All alert dispatches are dry-run (console only, no real Firebase writes).

A hardcoded "Dummy Restricted Zone" covers the centre 30% of the frame
so you can test risk scoring and loitering logic immediately.

Usage:
    python run_debug.py                  # camera + cv2 window
    python run_debug.py --no-window      # camera, terminal only
    python run_debug.py --no-camera      # blank frame (no camera required)
    python run_debug.py --no-camera --no-window   # pure terminal test
"""
import sys
import os
import time

import cv2
import numpy as np

# Ensure backend/ is on sys.path regardless of where the script is launched from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared import config
from shared.schemas import Rule, RuleGeometry, RuleConditions, Point

from edge_node.camera_stream  import CameraStream
from edge_node.detector       import Detector
from edge_node.payload_builder import build_payload

from central_server.reid_engine    import ReIDEngine
from central_server.spatial_engine import SpatialEngine
from central_server.rules_store    import RulesStore
from central_server.firebase_client import FirebaseClient
from central_server.alert_manager  import AlertManager


# ---------------------------------------------------------------------------
# ANSI colour codes
# ---------------------------------------------------------------------------
_GREEN  = "\033[92m"
_YELLOW = "\033[93m"
_RED    = "\033[91m"
_CYAN   = "\033[96m"
_BOLD   = "\033[1m"
_RESET  = "\033[0m"


# ---------------------------------------------------------------------------
# Hardcoded dummy restricted zone
# ---------------------------------------------------------------------------
DUMMY_ZONE = Rule(
    rule_id    = "debug_zone_001",
    camera_id  = config.CAMERA_ID,
    name       = "[DEBUG] Restricted Area — Centre Frame",
    rule_type  = "zone",
    alert_type = "loitering",
    geometry   = RuleGeometry(
        type   = "polygon",
        points = [
            Point(0.35, 0.25),  # top-left
            Point(0.65, 0.25),  # top-right
            Point(0.65, 0.75),  # bottom-right
            Point(0.35, 0.75),  # bottom-left
        ],
    ),
    conditions = RuleConditions(
        min_dwell_seconds      = 15,   # alert after 15 s inside zone
        loitering_zone_returns = 2,    # or after returning to zone 2 times
    ),
    active     = True,
    created_at = "debug",
)


# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------

def _log(level: str, msg: str):
    ts = time.strftime("%H:%M:%S")
    if level == "INFO":
        print(f"{_GREEN}[INFO]   {_RESET}{ts}  {msg}")
    elif level == "WARNING":
        print(f"{_YELLOW}[WARNING]{_RESET}{ts}  {msg}")
    elif level == "ALERT":
        print(f"{_RED}{_BOLD}[ALERT]  {_RESET}{ts}  {msg}")
    elif level == "DEBUG":
        print(f"{_CYAN}[DEBUG]  {_RESET}{ts}  {msg}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run(show_window: bool = True, no_camera: bool = False):
    _log("INFO", "=" * 62)
    _log("INFO", "  SMART EYE — Debug / Headless CLI Mode")
    _log("INFO", "=" * 62)
    _log("INFO", f"Dummy zone  : '{DUMMY_ZONE.name}'")
    _log("DEBUG", "  Covers normalised rect (0.35, 0.25) → (0.65, 0.75)")
    _log("INFO", f"Alert threshold  : risk score >= {config.RISK_ALERT_THRESHOLD}")
    _log("INFO", f"Loitering trigger: {DUMMY_ZONE.conditions.min_dwell_seconds}s dwell "
                 f"OR {DUMMY_ZONE.conditions.loitering_zone_returns} zone-returns "
                 f"(while inside zone)")
    print()

    # ---- initialise modules ----
    store    = RulesStore()
    store.delete_rule(DUMMY_ZONE.rule_id)   # remove stale debug zone if it persists
    store.add_rule(DUMMY_ZONE)
    _log("INFO", "RulesStore: dummy zone loaded.")

    reid     = ReIDEngine()
    spatial  = SpatialEngine()
    firebase = FirebaseClient(dry_run=True)   # no real Firebase writes
    alerts   = AlertManager(firebase, emit_fn=None)
    detector = Detector()
    _log("INFO", "All modules initialised.\n")

    # ---- camera ----
    if no_camera:
        _log("WARNING", "--no-camera: using a blank 640×480 test frame.")
        def _get_frame():
            return np.zeros((480, 640, 3), dtype=np.uint8)
        def _stop(): pass
    else:
        _log("INFO", f"Connecting to RTSP camera: {config.RTSP_URL}")
        stream = CameraStream(config.RTSP_URL)
        if not stream.start():
            _log("ALERT", "Failed to connect to RTSP camera.")
            _log("INFO",  "Tip: re-run with --no-camera to use a blank test frame.")
            sys.exit(1)
        _log("INFO", "Camera connected.\n")
        time.sleep(1)
        _get_frame = stream.get_frame
        _stop      = stream.stop

    if show_window:
        cv2.namedWindow("Smart Eye [DEBUG]", cv2.WINDOW_NORMAL)
        cv2.resizeWindow("Smart Eye [DEBUG]", 960, 540)

    # State persisted across the main loop
    global_ids:      dict = {}
    effective_times: dict = {}
    risk_results:    list = []
    last_payload          = None
    send_timer            = 0.0
    prev_time             = time.time()

    _log("INFO", "Entering main loop — press Q (in window) or Ctrl+C to quit.\n")

    try:
        while True:
            frame = _get_frame()
            if frame is None:
                time.sleep(0.01)
                continue

            now  = time.time()
            fps  = 1.0 / max(now - prev_time, 0.001)
            prev_time = now

            # Always run detection (YOLO fires every N frames internally)
            detector.process_frame(frame)

            # Build payload cheaply (no JPEG encoding in debug mode)
            payload      = build_payload(detector, config.CAMERA_ID, frame=None, include_frame=False)
            last_payload = payload

            # --- Run logic at the configured send interval ---
            if now - send_timer >= config.SEND_INTERVAL_SECONDS and payload.persons:
                send_timer = now

                _log("INFO",
                     f"Frame analysis | "
                     f"{len(payload.persons)} person(s) tracked | "
                     f"FPS: {fps:.1f}")

                # Re-ID
                global_ids, effective_times = reid.process(payload.persons)

                # Spatial risk
                rules        = store.get_rules(config.CAMERA_ID)
                risk_results = spatial.evaluate(
                    payload.persons, rules,
                    payload.frame_width, payload.frame_height,
                    global_ids, effective_times,
                )

                # Per-person console output
                person_map = {p.person_id: p for p in payload.persons}
                box_map    = {p.person_id: p.box for p in payload.persons}

                for result in risk_results:
                    eff_t  = effective_times.get(str(result.local_id), 0)
                    person = person_map.get(result.local_id)
                    pos    = (
                        f"({person.last_position['x']},{person.last_position['y']})"
                        if person else "(?)"
                    )
                    base = (
                        f"Person {result.global_id:<6} | "
                        f"pos={pos:<14} | "
                        f"time={eff_t:>3}s | "
                        f"risk={result.risk_score:>3}"
                    )

                    if result.in_zone and result.risk_score >= config.RISK_ALERT_THRESHOLD:
                        label = " | ".join(result.alert_types).upper()
                        _log("ALERT",
                             f"{base} — {label} DETECTED in '{result.triggered_rule_name}'")
                    elif result.risk_score >= 40:
                        extra = ""
                        if person:
                            extra = (
                                f" | spread={person.area_spread_pixels:.0f}px"
                                f" | vel={person.avg_movement_pixels:.1f}px/f"
                                f" | returns={person.zone_returns}"
                            )
                        _log("WARNING", f"{base} — Approaching threshold{extra}")
                    else:
                        _log("INFO", base)

                # Fire alerts (dry-run Firebase, no Socket.IO emit)
                alerts.process(risk_results, config.CAMERA_ID, person_map, box_map)
                print()

            # --- Optional cv2 display ---
            if show_window:
                display = _draw_overlay(
                    frame, last_payload,
                    global_ids, effective_times, risk_results, fps,
                )
                cv2.imshow("Smart Eye [DEBUG]", display)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    _log("INFO", "Quit signal received.")
                    break

    except KeyboardInterrupt:
        _log("INFO", "Interrupted by user.")

    finally:
        # Always remove the dummy zone from the DB so run_server.py
        # starts with a clean, empty ruleset.
        store.delete_rule(DUMMY_ZONE.rule_id)
        _log("INFO", "Dummy zone removed from database — production ruleset is clean.")
        _stop()
        if show_window:
            cv2.destroyAllWindows()
        _log("INFO", "Debug session ended.")


# ---------------------------------------------------------------------------
# OpenCV overlay drawing
# ---------------------------------------------------------------------------

def _draw_overlay(frame, payload, global_ids, effective_times, risk_results, fps):
    annotated  = frame.copy()
    fh, fw     = frame.shape[:2]
    result_map = {r.local_id: r for r in risk_results}

    # Draw the dummy zone boundary.
    pts = DUMMY_ZONE.geometry.points
    poly = np.array([[int(p.x * fw), int(p.y * fh)] for p in pts], dtype=np.int32)
    cv2.polylines(annotated, [poly], isClosed=True, color=(0, 255, 100), thickness=2)
    cv2.putText(
        annotated, DUMMY_ZONE.name,
        (poly[0][0], poly[0][1] - 8),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 100), 1,
    )

    if payload:
        for person in payload.persons:
            lid    = person.person_id
            result = result_map.get(lid)
            gid    = global_ids.get(str(lid), f"L-{lid}")
            eff_t  = effective_times.get(str(lid), int(person.time_in_frame_seconds))
            score  = result.risk_score  if result else 0
            alts   = result.alert_types if result else []

            x1, y1, x2, y2 = person.box

            if "climbing" in alts:
                color = config.COLOR_CLIMBING
            elif alts:
                color = config.COLOR_LOITERING
            elif score >= 40:
                color = config.COLOR_WARNING
            else:
                color = config.COLOR_NORMAL

            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            label = f"{gid} | {eff_t}s | R:{score}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(annotated, (x1, y1 - th - 10), (x1 + tw, y1), color, -1)
            cv2.putText(annotated, label, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2)

            if alts:
                cv2.putText(annotated, " | ".join(alts).upper(),
                            (x1, y2 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)

    # HUD overlay
    cv2.putText(annotated, f"FPS: {fps:.1f}", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
    cv2.putText(annotated, "[DEBUG MODE]", (10, 65),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 2)

    return annotated
