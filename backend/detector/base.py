"""Base detector interface for Phase 3: Vehicle Detection.

This abstract class defines the contract for all detection implementations.
Phase 3: DummyDetector (stable fake detections)
Phase 4+: YOLODetector (real AI model)
"""
from abc import ABC, abstractmethod
from typing import Dict, Any


class Detector(ABC):
    """Abstract base class for vehicle detectors."""

    @abstractmethod
    def detect(self, frame_data: bytes, source_id: str, timestamp: float) -> Dict[str, Any]:
        """
        Run detection on a frame.

        Args:
            frame_data: Raw frame bytes (image/video frame)
            source_id: Junction/camera identifier
            timestamp: Frame timestamp

        Returns:
            Detection result dictionary with schema:
            {
                "source_id": str,
                "timestamp": float,
                "detections": [
                    {
                        "bbox": [x, y, w, h],
                        "class": str (car, bike, bus, truck),
                        "score": float (0.0–1.0)
                    },
                    ...
                ]
            }
        """
        pass
