"""
Entry point — Headless Debug Mode.

Runs the FULL pipeline (Edge Node + Central Server logic) in a single
process.  No HTTP server is started.  All Firebase writes are dry-run
(printed to console).  A hardcoded dummy polygon is injected into the
Spatial Risk Engine so you can test loitering detection immediately.

Usage:
    python run_debug.py                      # live camera + cv2 window
    python run_debug.py --no-window          # live camera, terminal logs only
    python run_debug.py --no-camera          # blank frame, cv2 window
    python run_debug.py --no-camera --no-window   # pure terminal / CI mode
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from debug.cli_runner import run

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Smart Eye — Headless Debug / Test Mode"
    )
    parser.add_argument(
        "--no-window",
        action="store_true",
        help="Disable the OpenCV display window (pure terminal output).",
    )
    parser.add_argument(
        "--no-camera",
        action="store_true",
        help="Use a blank test frame instead of the RTSP camera.",
    )
    args = parser.parse_args()
    run(show_window=not args.no_window, no_camera=args.no_camera)
