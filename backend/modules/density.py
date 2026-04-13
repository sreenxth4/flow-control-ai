"""
Traffic Density Classification Module - Phase 6
================================================

Purpose:
- Convert per-road vehicle counts into density levels (LOW/MEDIUM/HIGH).
- Smooth fluctuations using a rolling window.
- Provide a normalized density score (0.0 to 1.0).

Input:
- road_counts: {road_id: vehicle_count}

Output (per road):
{
  "road_id": str,
  "vehicle_count": int,
  "density_level": "LOW" | "MEDIUM" | "HIGH",
  "density_score": float (0.0 to 1.0)
}

Notes:
- This module is classification only. No signal/cost logic.
- Uses strict thresholds: LOW 0-10, MEDIUM 11-25, HIGH 26+.
- Smoothing uses rolling average over last N frames (default 10).
"""

from collections import deque
from typing import Dict, List, Tuple


DEFAULT_THRESHOLDS: Dict[str, Tuple[int, float]] = {
    "LOW": (0, 10),
    "MEDIUM": (11, 25),
    "HIGH": (26, float("inf"))
}

DEFAULT_SMOOTHING_WINDOW = 10
DEFAULT_MAX_VEHICLES_FOR_SCORE = 50


class TrafficDensityClassifier:
    """Rolling-window density classifier for per-road vehicle counts."""

    def __init__(
        self,
        thresholds: Dict[str, Tuple[int, float]] = None,
        smoothing_window: int = DEFAULT_SMOOTHING_WINDOW,
        max_vehicles_for_score: int = DEFAULT_MAX_VEHICLES_FOR_SCORE,
    ) -> None:
        self.thresholds = thresholds or DEFAULT_THRESHOLDS
        self.smoothing_window = max(1, int(smoothing_window))
        self.max_vehicles_for_score = max(1, int(max_vehicles_for_score))
        self._history: Dict[str, deque] = {}

    def reset(self) -> None:
        """Clear rolling history for all roads."""
        self._history.clear()

    def classify_density(self, road_counts: Dict[str, float]) -> List[Dict[str, object]]:
        """Classify density per road using rolling average smoothing. Accepts PCU floats."""
        results: List[Dict[str, object]] = []

        for road_id, vehicle_count in road_counts.items():
            history = self._history.setdefault(
                road_id,
                deque(maxlen=self.smoothing_window)
            )
            history.append(float(vehicle_count))

            avg_count = sum(history) / len(history) if history else 0.0
            density_level = _classify_count(avg_count, self.thresholds)
            density_score = _normalize_score(avg_count, self.max_vehicles_for_score)

            results.append({
                "road_id": road_id,
                "vehicle_count": round(float(vehicle_count), 1),
                "density_level": density_level,
                "density_score": round(density_score, 3)
            })

        return results


def classify_density(road_counts: Dict[str, float]) -> List[Dict[str, object]]:
    """
    Module-level convenience function with internal rolling history.
    Uses default thresholds and smoothing window.
    """
    return _DEFAULT_CLASSIFIER.classify_density(road_counts)


def _classify_count(value: float, thresholds: Dict[str, Tuple[int, float]]) -> str:
    for level, (min_count, max_count) in thresholds.items():
        if min_count <= value <= max_count:
            return level
    return "HIGH"


def _normalize_score(value: float, max_value: int) -> float:
    if max_value <= 0:
        return 0.0
    score = value / max_value
    if score < 0.0:
        return 0.0
    if score > 1.0:
        return 1.0
    return score


_DEFAULT_CLASSIFIER = TrafficDensityClassifier()
