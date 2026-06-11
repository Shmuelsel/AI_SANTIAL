"""
Restricted zone storage.

Holds a single polygon that the frontend operator can draw on the live feed.
Points are stored in normalised [0, 1] coordinates so they are
resolution-independent and scale correctly to any camera or display size.

Example payload from the frontend:
    {"zone": [{"x": 0.1, "y": 0.2}, {"x": 0.5, "y": 0.2}, {"x": 0.4, "y": 0.8}]}

The JSON file persists across server restarts.
"""
import json
import os

_ZONE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "restricted_zone.json")

# In-memory cache — a list of {"x": float, "y": float} dicts in [0, 1] space.
_zone: list = []


def load() -> list:
    """Load the persisted zone from disk into the in-memory cache.
    Call once at server startup."""
    global _zone
    if os.path.exists(_ZONE_FILE):
        try:
            with open(_ZONE_FILE) as f:
                _zone = json.load(f)
            print(f"[INFO] ZoneStore: loaded restricted zone ({len(_zone)} points) from disk.")
        except Exception as exc:
            print(f"[WARNING] ZoneStore: could not load zone file — {exc}")
            _zone = []
    else:
        print("[INFO] ZoneStore: no restricted zone on disk — zone is empty.")
    return _zone


def save(points: list) -> None:
    """Overwrite the zone with new points and persist to disk."""
    global _zone
    _zone = points
    try:
        with open(_ZONE_FILE, "w") as f:
            json.dump(points, f)
        print(f"[INFO] ZoneStore: saved restricted zone ({len(points)} points).")
    except Exception as exc:
        print(f"[WARNING] ZoneStore: could not save zone — {exc}")


def get() -> list:
    """Return the current zone (list of normalised {x, y} dicts)."""
    return _zone
