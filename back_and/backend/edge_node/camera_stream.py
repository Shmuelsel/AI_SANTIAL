"""
RTSP camera capture with automatic reconnection.
Runs a background daemon thread so the caller always gets the latest frame
without blocking on I/O.
"""
import cv2
import time
import threading

from shared import config


class CameraStream:
    """
    Captures frames from an RTSP source in a background thread.
    Thread-safe: get_frame() can be called from any thread.
    Reconnects automatically and indefinitely on connection loss.
    """

    def __init__(self, source):
        self.source    = source
        self.connected = False
        self._frame    = None
        self._running  = False
        self._lock     = threading.Lock()
        self._cap      = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> bool:
        """Open the stream and start the background reader.
        Returns False only when a source is configured but fails to open.
        If source is None, starts the thread in waiting mode and returns True."""
        self._running = True
        if self.source:
            self._cap = self._open()
            if not self._cap.isOpened():
                self._running = False
                return False
            self.connected = True
        threading.Thread(target=self._read_loop, daemon=True).start()
        return True

    def get_frame(self):
        """Return a copy of the most recent frame, or None if no frame yet."""
        with self._lock:
            return self._frame.copy() if self._frame is not None else None

    def stop(self):
        """Signal the background thread to stop and release resources."""
        self._running = False
        if self._cap:
            self._cap.release()

    def reconfigure(self, source) -> bool:
        """
        Hot-swap the camera source without stopping the background thread.
        The reader loop will pick up the new capture on its next iteration.
        Returns True if the new capture opened successfully.
        """
        new_cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG) if isinstance(source, str) \
                  else cv2.VideoCapture(source)
        new_cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not new_cap.isOpened():
            print(f"[WARNING] CameraStream.reconfigure: could not open new source '{source}'")
            new_cap.release()
            return False
        old_cap    = self._cap
        self.source = source
        self._cap   = new_cap
        self.connected = True
        if old_cap:
            old_cap.release()
        print(f"[INFO] CameraStream: reconfigured → {source}")
        return True

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _open(self) -> cv2.VideoCapture:
        """Open the capture source. Uses CAP_FFMPEG for all string sources
        (RTSP/HTTP) so MSMF is never invoked for network streams.
        Never called when self.source is None."""
        if isinstance(self.source, int):
            cap = cv2.VideoCapture(self.source)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  config.CAPTURE_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAPTURE_HEIGHT)
        else:
            cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _read_loop(self):
        while self._running:
            if self._cap is None or not self._cap.isOpened():
                time.sleep(1)   # waiting for reconfigure() to supply a valid source
                continue
            success, frame = self._cap.read()
            if success:
                with self._lock:
                    self._frame = frame
                self.connected = True
            else:
                self.connected = False
                print("[WARNING] CameraStream: connection lost — retrying in 3 s …")
                self._cap.release()
                time.sleep(3)
                if self.source:
                    self._cap = self._open()
