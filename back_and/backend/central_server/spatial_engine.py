"""
Spatial Logic Engine — the core false-alarm filter.

For each detected person the engine evaluates all active spatial rules
and computes an Accumulated Risk Score (0–100).  An alert is triggered
only when the score reaches RISK_ALERT_THRESHOLD, which requires multiple
independent evidence signals to coincide, preventing single-cause false alarms.

Score composition (see config.py for point values):
  +30  centroid is inside a restricted zone
  +20  dwell time >= rule.min_dwell_seconds
  +20  zone return count >= rule.loitering_zone_returns
  +15  area spread < LOITERING_AREA_MAX  (person barely moved)
  +15  avg movement < LOITERING_VELOCITY_MAX  (slow / stationary)

Tripwire rules are binary: a crossing immediately returns score = 100.

All rule geometry is stored in normalised [0,1] space and converted to
pixel coordinates per-frame using the payload's frame dimensions.
"""
import math
from typing import List, Optional, Tuple

from shared import config
from shared.schemas import Rule, RuleGeometry, DetectedPerson, RiskResult


# ---------------------------------------------------------------------------
# Pure geometry helpers  (no external dependencies)
# ---------------------------------------------------------------------------

def _point_in_polygon(px: float, py: float, poly: List[Tuple[float, float]]) -> bool:
    """Ray-casting algorithm — O(n) where n = number of polygon vertices."""
    n      = len(poly)
    inside = False
    j      = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > py) != (yj > py)) and (
            px < (xj - xi) * (py - yi) / (yj - yi) + xi
        ):
            inside = not inside
        j = i
    return inside


def _segments_cross(p1, p2, p3, p4) -> bool:
    """
    Returns True if segment p1→p2 crosses segment p3→p4.
    Used for tripwire crossing detection.
    """
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    d1 = cross(p3, p4, p1)
    d2 = cross(p3, p4, p2)
    d3 = cross(p1, p2, p3)
    d4 = cross(p1, p2, p4)
    return (
        ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and
        ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0))
    )


def _to_pixels(
    geometry: RuleGeometry, fw: int, fh: int
) -> List[Tuple[float, float]]:
    """Convert normalised rule geometry points → pixel coordinates."""
    return [(p.x * fw, p.y * fh) for p in geometry.points]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class SpatialEngine:
    """
    Stateless evaluator — create once, call evaluate() on every ingest cycle.
    """

    def evaluate(
        self,
        persons:         List[DetectedPerson],
        rules:           List[Rule],
        frame_width:     int,
        frame_height:    int,
        global_ids:      dict,   # {str(local_id): "G-N"}
        effective_times: dict,   # {str(local_id): seconds}
    ) -> List[RiskResult]:
        """
        Evaluate every person against every active rule.

        Returns one RiskResult per person, ordered the same as `persons`.
        """
        active_rules = [r for r in rules if r.active]

        # Pre-convert all rule geometries to pixel space (done once per call).
        px_geoms = {
            r.rule_id: _to_pixels(r.geometry, frame_width, frame_height)
            for r in active_rules
        }

        results = []
        for person in persons:
            local_key = str(person.person_id)
            gid       = global_ids.get(local_key, f"L-{person.person_id}")
            eff_time  = effective_times.get(local_key, int(person.time_in_frame_seconds))

            cx = float(person.last_position["x"])
            cy = float(person.last_position["y"])

            best_score = 0
            best_rule: Optional[Rule] = None

            for rule in active_rules:
                score = self._score(person, rule, px_geoms[rule.rule_id], cx, cy, eff_time)
                if score > best_score:
                    best_score = score
                    best_rule  = rule

            in_zone     = best_score >= config.RISK_ALERT_THRESHOLD
            alert_types = [best_rule.alert_type] if (in_zone and best_rule) else []

            results.append(RiskResult(
                global_id           = gid,
                local_id            = person.person_id,
                risk_score          = min(best_score, 100),
                alert_types         = alert_types,
                triggered_rule_id   = best_rule.rule_id   if best_rule else None,
                triggered_rule_name = best_rule.name      if best_rule else None,
                in_zone             = in_zone,
                zone_sensitivity    = (best_rule.sensitivity_level
                                       if (best_rule and best_rule.rule_type == "zone")
                                       else 0),
                min_dwell_seconds   = (best_rule.conditions.min_dwell_seconds
                                       if best_rule else 30),
            ))

        return results

    # ------------------------------------------------------------------
    # Internal scoring
    # ------------------------------------------------------------------

    def _score(
        self,
        person:       DetectedPerson,
        rule:         Rule,
        pixel_pts:    List[Tuple],
        cx:           float,
        cy:           float,
        eff_time:     int,
    ) -> int:
        if rule.rule_type == "zone":
            return self._score_zone(person, rule, pixel_pts, cx, cy, eff_time)
        elif rule.rule_type == "tripwire":
            return self._score_tripwire(person, pixel_pts)
        return 0

    def _score_zone(self, person, rule, pixel_pts, cx, cy, eff_time) -> int:
        if not _point_in_polygon(cx, cy, pixel_pts):
            return 0

        score = config.RISK_IN_ZONE_POINTS

        if eff_time >= rule.conditions.min_dwell_seconds:
            score += config.RISK_DWELL_POINTS

        if person.zone_returns >= rule.conditions.loitering_zone_returns:
            score += config.RISK_ZONE_RETURNS_POINTS

        if person.area_spread_pixels < config.LOITERING_AREA_MAX:
            score += config.RISK_CONFINED_POINTS

        if person.avg_movement_pixels < config.LOITERING_VELOCITY_MAX:
            score += config.RISK_SLOW_POINTS

        return score

    @staticmethod
    def _score_tripwire(person, pixel_pts) -> int:
        if len(pixel_pts) < 2 or len(person.positions) < 2:
            return 0
        prev = person.positions[-2]
        curr = person.positions[-1]
        if _segments_cross(prev, curr, pixel_pts[0], pixel_pts[1]):
            return 100   # Tripwire crossing is always a full alert
        return 0
