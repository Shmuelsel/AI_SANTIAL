"""
Singleton YOLO model loader.

Loading YOLOv8 weights (and the underlying torch model) is expensive — both in
time and memory. In the merged cloud architecture, the same weights must be
shared by every VideoWorker created over the lifetime of the process (e.g. when
the user toggles between Live and Demo video sources), instead of being
reloaded from disk on every switch.
"""
import threading

from ultralytics import YOLO

from shared import config

_lock  = threading.Lock()
_model = None


def get_model() -> YOLO:
    """Return the process-wide YOLO model, loading it on first use."""
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                print(f"[INFO] ModelManager: loading {config.YOLO_MODEL_PATH} …")
                _model = YOLO(config.YOLO_MODEL_PATH)
                print("[INFO] ModelManager: model ready.")
    return _model


def is_loaded() -> bool:
    return _model is not None
