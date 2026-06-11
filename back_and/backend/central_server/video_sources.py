"""
File-based video sources for the merged cloud pipeline.

Both "Live" and "Demo" modes read from a local video file and loop it forever
to simulate a continuous camera feed via LoopingFileSource. Demo Mode files
live in config.DEMO_VIDEOS_DIR (assets/videos/) and are discovered dynamically
by list_demo_videos().
"""
import os

import cv2

from shared import config


class LoopingFileSource:
    """Wraps cv2.VideoCapture on a local file, looping back to frame 0 on EOF."""

    def __init__(self, path: str, target_fps: float = None):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Video file not found: {path}")

        self.path = path
        self._cap = cv2.VideoCapture(path)
        if not self._cap.isOpened():
            raise FileNotFoundError(f"Could not open video file: {path}")

        self.fps = target_fps or self._cap.get(cv2.CAP_PROP_FPS) or 25.0

    def read(self):
        """Return the next BGR frame, looping to the start on end-of-stream."""
        ok, frame = self._cap.read()
        if not ok:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._cap.read()
            if not ok:
                return None
        return frame

    def release(self):
        self._cap.release()


def list_demo_videos() -> list:
    """
    Scan config.DEMO_VIDEOS_DIR for .mp4 files (excluding the live-mode file)
    and return a sorted list of filenames. Used to populate the frontend's
    Demo Mode dropdown dynamically — dropping a new file in makes it
    selectable without any code changes.

    Returns an empty list if the directory doesn't exist.
    """
    if not os.path.isdir(config.DEMO_VIDEOS_DIR):
        return []

    live_filename = os.path.basename(config.LIVE_VIDEO_PATH)
    names = []
    for entry in os.listdir(config.DEMO_VIDEOS_DIR):
        if entry.lower().endswith(".mp4") and entry != live_filename:
            names.append(entry)
    return sorted(names)


class DemoVideoSource(LoopingFileSource):
    """Loops a local .mp4 from config.DEMO_VIDEOS_DIR, selected by filename."""

    def __init__(self, filename: str = None, target_fps: float = None):
        if filename and ("/" in filename or "\\" in filename or ".." in filename):
            raise ValueError(f"Invalid demo video filename: {filename!r}")

        if not filename:
            filename = config.DEFAULT_DEMO_VIDEO_FILENAME
        if not filename:
            available = list_demo_videos()
            if not available:
                raise FileNotFoundError(
                    f"No demo videos found in {config.DEMO_VIDEOS_DIR}"
                )
            filename = available[0]

        local_path = os.path.join(config.DEMO_VIDEOS_DIR, filename)
        super().__init__(local_path, target_fps)
        self.filename = filename
