"""Dummy detector for Phase 3: stable fake detections for testing.

This detector generates consistent, deterministic detections based on:
- source_id (different junctions have different traffic patterns)
- frame size (derived from byte length)

No randomness, no ML models. Detections are stable and repeatable.
"""
from typing import Dict, Any, List
from .base import Detector


class DummyDetector(Detector):
    """Generates stable fake detections for validation."""

    # Vehicle class definitions
    CLASSES = ["car", "bike", "bus", "truck"]

    # Predefined patterns per junction
    JUNCTION_PATTERNS = {
        "J1": {"car": 8, "bike": 3, "bus": 1, "truck": 2},  # Y Junction - heavy traffic
        "J2": {"car": 5, "bike": 2, "bus": 2, "truck": 1},  # KPHB - moderate
        "J3": {"car": 6, "bike": 1, "bus": 1, "truck": 1},  # JNTU - medium traffic
        "J4": {"car": 4, "bike": 2, "bus": 3, "truck": 1},  # Bus Depot - more buses
        "J5": {"car": 7, "bike": 4, "bus": 0, "truck": 1},  # Balanagar - bikes + cars
        "unknown": {"car": 3, "bike": 1, "bus": 1, "truck": 1},  # Default pattern
    }

    def __init__(self):
        """Initialize dummy detector."""
        pass

    def detect(self, frame_data: bytes, source_id: str, timestamp: float) -> Dict[str, Any]:
        """
        Generate stable fake detections based on source_id.

        Uses predefined traffic patterns per junction to create
        consistent, repeatable detection results.
        """
        # Get pattern for this junction (or default)
        pattern = self.JUNCTION_PATTERNS.get(source_id, self.JUNCTION_PATTERNS["unknown"])

        # Generate stable bounding boxes using source_id hash
        detections = []
        seed = abs(hash(source_id)) % 1000

        y_offset = 50
        for vehicle_class, count in pattern.items():
            for i in range(count):
                # Generate stable bbox coordinates
                x = (seed + i * 100 + ord(vehicle_class[0])) % 800
                y = y_offset + (i * 80)
                w = 60 + (seed % 40)
                h = 40 + (seed % 30)

                # Score varies slightly by class but stays stable
                base_score = 0.75 + (ord(vehicle_class[0]) % 20) / 100.0
                score = min(0.99, base_score)

                detections.append({
                    "bbox": [x, y, w, h],
                    "class": vehicle_class,
                    "score": round(score, 2)
                })

            y_offset += 100

        return {
            "source_id": source_id,
            "timestamp": timestamp,
            "detections": detections,
            "detector_type": "dummy",
            "note": "Phase 3 stub: stable fake detections for validation"
        }

    def get_class_counts(self, detections: List[Dict[str, Any]]) -> Dict[str, int]:
        """Count detections by class."""
        counts = {cls: 0 for cls in self.CLASSES}
        for det in detections:
            cls = det.get("class", "unknown")
            if cls in counts:
                counts[cls] += 1
        return counts

    def clear_cache(self):
        """Stub method for interface compatibility. DummyDetector has no cache."""
        pass
