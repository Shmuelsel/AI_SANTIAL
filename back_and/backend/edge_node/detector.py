"""
YOLOv8n + ByteTrack detection pipeline.

Responsibilities:
  - Run YOLOv8 inference every N frames on a downscaled copy of the frame.
  - Maintain per-person tracking state (positions, zone visits, timing).
  - Compute behavioral metrics (movement velocity, area spread, zone returns).
  - Extract appearance features via FeatureExtractor.

This module has NO knowledge of networking, display, or Flask.
It receives frames and returns the current tracking state dictionary.
"""
import math
import time
import cv2
import numpy as np
from typing import Dict, List, Tuple

from ultralytics import YOLO

from shared import config
from edge_node.feature_extractor import FeatureExtractor


class Detector:
    """
    Stateful detector — call process_frame() on every incoming frame.
    Read tracking results via the `tracked` property or pass the instance
    to payload_builder.build_payload().
    """

    def __init__(self):
        print(f"[INFO] Detector: loading YOLO model from {config.YOLO_MODEL_PATH} …")
        self._model      = YOLO(config.YOLO_MODEL_PATH)
        self._extractor  = FeatureExtractor()
        self._tracked: Dict[int, dict] = {}
        self._frame_count = 0
        self._frame_w     = 1280
        self._frame_h     = 720
        print("[INFO] Detector: ready.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_frame(self, frame: np.ndarray) -> Dict[int, dict]:
        """
        Process a single BGR frame.  YOLO runs every YOLO_EVERY_N_FRAMES;
        stale tracks are purged automatically.

        Returns the current `_tracked` dict for inspection (same object,
        not a copy — do not mutate).
        """
        self._frame_count += 1
        self._frame_h, self._frame_w = frame.shape[:2]

        if self._frame_count % config.YOLO_EVERY_N_FRAMES == 0:
            self._run_yolo(frame)

        self._cleanup()
        return self._tracked

    @property
    def tracked(self) -> Dict[int, dict]:
        return self._tracked

    @property
    def frame_size(self) -> Tuple[int, int]:
        """Returns (width, height) of the last processed frame."""
        return self._frame_w, self._frame_h

    # ------------------------------------------------------------------
    # Behavioral metric calculations (called by payload_builder)
    # ------------------------------------------------------------------

    def calculate_movement(self, pid: int) -> float:
        """Average inter-frame displacement in pixels over the position history."""
        positions = self._tracked[pid]["positions"]
        if len(positions) < 2:
            return 0.0
        total = sum(
            self._dist(positions[i], positions[i - 1])
            for i in range(1, len(positions))
        )
        return round(total / len(positions), 2)

    def calculate_area_spread(self, pid: int) -> float:
        """Diagonal extent of the bounding box of all recorded positions."""
        positions = self._tracked[pid]["positions"]
        if len(positions) < 5:
            return 999.0
        xs = [p[0] for p in positions]
        ys = [p[1] for p in positions]
        return round(math.hypot(max(xs) - min(xs), max(ys) - min(ys)), 2)

    def count_zone_returns(self, pid: int) -> int:
        """
        Count how many times the person revisited a previously occupied
        spatial cluster (indicates loitering / pacing behaviour).
        """
        visits = self._tracked[pid]["zone_visits"]
        if len(visits) < 3:
            return 0
        returns = 0
        for i in range(2, len(visits)):
            for j in range(i - 2):
                if self._dist(visits[i], visits[j]) < 100:
                    returns += 1
                    break
        return returns

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run_yolo(self, frame: np.ndarray):
        small   = cv2.resize(frame, (config.YOLO_INPUT_SIZE, config.YOLO_INPUT_SIZE))
        scale_x = self._frame_w / config.YOLO_INPUT_SIZE
        scale_y = self._frame_h / config.YOLO_INPUT_SIZE

        results = self._model.track(
            small,
            persist   = True,
            verbose   = False,
            conf      = config.YOLO_CONF_THRESHOLD,
            imgsz     = config.YOLO_INPUT_SIZE,
            classes   = [0],                      # persons only
            tracker   = config.TRACKER_CONFIG_PATH,
        )

        detected_ids: set        = set()
        crops:        List       = []
        pids:         List[int]  = []

        for result in results:
            if result.boxes.id is None:
                continue
            for obj_id, box in zip(
                result.boxes.id.int().cpu().numpy(),
                result.boxes.xyxy.cpu().numpy(),
            ):
                x1 = max(0, int(box[0] * scale_x))
                y1 = max(0, int(box[1] * scale_y))
                x2 = min(self._frame_w, int(box[2] * scale_x))
                y2 = min(self._frame_h, int(box[3] * scale_y))
                tid = int(obj_id)

                detected_ids.add(tid)
                self._update_track(tid, [x1, y1, x2, y2])

                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    crops.append(crop)
                    pids.append(tid)

        # Mark persons no longer in this detection frame as inactive.
        for pid in self._tracked:
            if pid not in detected_ids:
                self._tracked[pid]["box_active"] = False

        # Batch feature extraction.
        if crops:
            features = self._extractor.extract(crops)
            for pid, feat in zip(pids, features):
                if pid in self._tracked:
                    self._tracked[pid]["feature"]    = feat
                    self._tracked[pid]["box_active"] = True

    def _update_track(self, pid: int, box: List[int]):
        now = time.time()
        x1, y1, x2, y2 = box
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

        if pid not in self._tracked:
            self._tracked[pid] = {
                "first_seen":  now,
                "last_seen":   now,
                "positions":   [(cx, cy)],
                "zone_visits": [(cx, cy)],
                "box":         box,
                "box_active":  True,
                "feature":     None,
            }
        else:
            d               = self._tracked[pid]
            d["last_seen"]  = now
            d["box"]        = box
            d["box_active"] = True
            d["positions"].append((cx, cy))
            d["positions"] = d["positions"][-config.POSITION_HISTORY_LEN:]

            if self._dist(d["zone_visits"][-1], (cx, cy)) > config.ZONE_CLUSTER_RADIUS:
                d["zone_visits"].append((cx, cy))
                d["zone_visits"] = d["zone_visits"][-config.ZONE_VISIT_HISTORY_LEN:]

    def _cleanup(self):
        now   = time.time()
        stale = [
            pid for pid, d in self._tracked.items()
            if now - d["last_seen"] > config.PERSON_MEMORY_SECONDS
        ]
        for pid in stale:
            del self._tracked[pid]

    @staticmethod
    def _dist(p1: Tuple, p2: Tuple) -> float:
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])
