"""
Camera configuration store.

Persists camera RTSP configs to a JSON file so they survive server restarts.
Credentials are stored server-side only and never sent to the frontend in GET
responses (password is masked as "***").

Firebase is intentionally not used here — configs contain credentials.
"""
import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "camera_configs.json",
)


class CameraStore:

    def __init__(self):
        self._cameras: Dict[str, dict] = {}
        self._load()

    def get_all(self) -> List[dict]:
        """Return all configs with passwords masked."""
        result = []
        for cam in self._cameras.values():
            masked = dict(cam)
            if masked.get("rtsp_password"):
                masked["rtsp_password"] = "***"
            result.append(masked)
        return result

    def get(self, camera_id: str) -> Optional[dict]:
        """Return the full config (including password) for internal use."""
        return self._cameras.get(camera_id)

    def save(self, config: dict) -> dict:
        camera_id = config["camera_id"]
        config.setdefault("registered_at", datetime.now(timezone.utc).isoformat())
        self._cameras[camera_id] = config
        self._persist()
        return config

    def delete(self, camera_id: str) -> bool:
        if camera_id not in self._cameras:
            return False
        del self._cameras[camera_id]
        self._persist()
        return True

    # ------------------------------------------------------------------

    def _load(self):
        if not os.path.exists(_CONFIG_PATH):
            return
        try:
            with open(_CONFIG_PATH, "r") as f:
                self._cameras = json.load(f)
            print(f"[INFO] CameraStore: loaded {len(self._cameras)} config(s) from disk.")
        except Exception as exc:
            print(f"[WARNING] CameraStore: could not load camera configs — {exc}")

    def _persist(self):
        try:
            with open(_CONFIG_PATH, "w") as f:
                json.dump(self._cameras, f, indent=2)
        except Exception as exc:
            print(f"[ERROR] CameraStore: could not persist camera configs — {exc}")
