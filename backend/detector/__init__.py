"""Detector module for Phase 3: Vehicle Detection."""
from .base import Detector
from .dummy_detector import DummyDetector
from .yolo_v9_detector import YoloV9Detector

__all__ = ["Detector", "DummyDetector", "YoloV9Detector"]
