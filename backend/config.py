"""Configuration for Traffic Flow Analysis backend.

Phase 3.5: Detector selection and model configuration.
"""

# Detector mode: "dummy" or "yolov9"
# - "dummy": Uses fake stable detections for testing (no ML dependencies)
# - "yolov9": Uses real YOLOv9 detection (requires ultralytics, torch)
DETECTOR_MODE = "yolov9"

# YOLOv9 model configuration
YOLOV9_MODEL = "yolov9c.pt"  # Options: yolov9t (fastest), yolov9s, yolov9m, yolov9c (best balance), yolov9e
YOLOV9_CONFIDENCE = 0.25     # Minimum confidence threshold (0.0-1.0)

# Tracking performance mode
# False = fast motion/IoU tracking (recommended for CPU)
# True  = full DeepSORT appearance embedding (slower, potentially more ID-stable)
TRACKER_USE_APPEARANCE = False

# Frame storage
MAX_FRAMES = 50  # Maximum frames to keep in memory per source

# Autonomous signal optimization
SIGNAL_REOPTIMIZE_INTERVAL_SECONDS = 90
SIGNAL_SCHEDULER_POLL_SECONDS = 5
DEFAULT_SIGNAL_CYCLE_SECONDS = 90
DEFAULT_GREEN_SIGNAL_SECONDS = 60
MIN_GREEN_SIGNAL_SECONDS = 15
MAX_GREEN_SIGNAL_SECONDS = 90
SIGNAL_REFERENCE_PCU = 30.0
