"""
Assembles a TrackingPayload from the Detector's current tracking state.
Optionally encodes the raw frame as a base64 JPEG so the Central Server
can annotate and relay it to frontend clients via Socket.IO.
"""
import base64
import time
import cv2
import numpy as np
from typing import Optional

from shared import config
from shared.schemas import DetectedPerson, TrackingPayload
from edge_node.detector import Detector


def build_payload(
    detector:        Detector,
    camera_id:       str,
    frame:           Optional[np.ndarray] = None,
    include_frame:   bool = True,
    inside_zone_ids: set  = None,
) -> TrackingPayload:
    """
    Args:
        detector:      The Detector instance (reads its current _tracked state).
        camera_id:     Identifier for the originating camera.
        frame:         The raw BGR frame (required when include_frame is True).
        include_frame: If True and frame is provided, encode it as base64 JPEG.

    Returns:
        A TrackingPayload ready to be serialised and POSTed to /ingest.
    """
    now             = time.time()
    fw, fh          = detector.frame_size
    inside_zone_ids = inside_zone_ids or set()
    persons         = []

    for pid, data in detector.tracked.items():
        # Only include persons that were active in the most recent YOLO pass
        # and have a valid feature vector.
        if not data.get("box_active", False):
            continue
        if data["feature"] is None:
            continue

        last_pos = data["positions"][-1] if data["positions"] else (0, 0)

        persons.append(DetectedPerson(
            person_id              = pid,
            feature                = data["feature"],
            box                    = data["box"],
            last_position          = {"x": last_pos[0], "y": last_pos[1]},
            positions              = list(data["positions"]),
            zone_visits            = list(data["zone_visits"]),
            time_in_frame_seconds  = round(now - data["first_seen"], 1),
            avg_movement_pixels    = detector.calculate_movement(pid),
            area_spread_pixels     = detector.calculate_area_spread(pid),
            zone_returns           = detector.count_zone_returns(pid),
            first_seen             = data["first_seen"],
            last_seen              = data["last_seen"],
            inside_restricted_zone = pid in inside_zone_ids,
        ))

    frame_b64 = None
    if include_frame and frame is not None:
        _, buf    = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        frame_b64 = base64.b64encode(buf).decode("utf-8")

    return TrackingPayload(
        camera_id      = camera_id,
        timestamp      = now,
        frame_width    = fw,
        frame_height   = fh,
        frame_jpeg_b64 = frame_b64,
        persons        = persons,
    )
