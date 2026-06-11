"""
Gallery-based person Re-Identification.

Assigns stable global IDs (G-1, G-2, …) that survive ByteTrack local ID
changes caused by brief occlusions or camera reconnects.

Algorithm:
  - Each global ID owns a gallery of L2-normalised appearance vectors
    representing different viewing angles of that person.
  - Identification is done by cosine similarity (dot product of unit vectors).
  - When multiple gallery entries match, the oldest ID is preferred to
    prevent the tracker from jumping to a newer identity.
  - Multi-angle storage: a new vector is appended only when it differs
    sufficiently from all existing angles (similarity < NEW_ANGLE_THRESHOLD).
"""
import time
import numpy as np
from typing import Dict, List, Tuple, Optional

from shared import config
from shared.schemas import DetectedPerson


class ReIDEngine:

    def __init__(self):
        # gid (e.g. "G-1") → list of L2-normalised numpy arrays
        self._gallery:     Dict[str, List[np.ndarray]] = {}
        # gid → {"total": float seconds, "last": float unix timestamp}
        self._time_memory: Dict[str, dict]              = {}
        self._next_id = 1

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process(
        self,
        persons: List[DetectedPerson],
    ) -> Tuple[Dict[str, str], Dict[str, int]]:
        """
        Match each detected person against the gallery and update timers.

        Returns:
            global_ids:      {str(local_id): "G-N"}
            effective_times: {str(local_id): cumulative_seconds}
        """
        now             = time.time()
        global_ids:      Dict[str, str] = {}
        effective_times: Dict[str, int] = {}

        for person in persons:
            local_key = str(person.person_id)
            feat      = self._normalise(person.feature)
            if feat is None:
                continue

            gid, _ = self._identify(feat)

            if gid:
                # Possibly add a new viewing angle for this identity.
                max_sim = max(np.dot(feat, f) for f in self._gallery[gid])
                if max_sim < config.REID_NEW_ANGLE_THRESHOLD:
                    self._gallery[gid].append(feat)
            else:
                gid = f"G-{self._next_id}"
                self._next_id += 1
                self._gallery[gid] = [feat]
                print(f"[INFO] ReIDEngine: new identity assigned → {gid}")

            global_ids[local_key]      = gid
            effective_times[local_key] = self._tick(gid, now)

        return global_ids, effective_times

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _identify(self, feat: np.ndarray) -> Tuple[Optional[str], float]:
        matches = []
        for gid, angles in self._gallery.items():
            score = max(float(np.dot(feat, f)) for f in angles)
            if score > config.REID_MATCH_THRESHOLD:
                matches.append((gid, score))

        if not matches:
            return None, -1.0

        # Prefer the oldest (lowest-numbered) ID to avoid identity jumps.
        matches.sort(key=lambda x: int(x[0].split("-")[1]))
        return matches[0]

    def _tick(self, gid: str, now: float) -> int:
        if gid not in self._time_memory:
            self._time_memory[gid] = {"total": 0.0, "last": now}

        mem  = self._time_memory[gid]
        diff = now - mem["last"]
        if 0 < diff < 10:       # guard against large gaps (e.g. after reconnect)
            mem["total"] += diff
        mem["last"] = now
        return int(mem["total"])

    @staticmethod
    def _normalise(feat_list) -> Optional[np.ndarray]:
        if not feat_list:
            return None
        arr  = np.array(feat_list, dtype=np.float32)
        norm = np.linalg.norm(arr)
        return arr / norm if norm > 0 else arr
