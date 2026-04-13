"""
Backend modules for Traffic Flow Analysis System.

Phase 3: Frame storage and metrics
Phase 3.5+: Vehicle detection (Dummy, YOLOv9)
Phase 3.7: Video processing
Phase 4: Vehicle tracking (DeepSORT)
Phase 5: Traffic density analysis (road-level metrics)
Phase 6: Route optimization + Signal optimization (merged)
"""

from modules.tracker import VehicleTracker
from modules.video_processor import VideoProcessor
from modules.density_analyzer import RoadDensityAnalyzer
from modules.density import TrafficDensityClassifier, classify_density
from modules.network_model import RoadNetwork
from modules.route_optimizer import RouteOptimizer
from modules.signal_optimizer import SignalOptimizer

__all__ = [
	"VehicleTracker",
	"VideoProcessor",
	"RoadDensityAnalyzer",
	"TrafficDensityClassifier",
	"classify_density",
	"RoadNetwork",
	"RouteOptimizer",
	"SignalOptimizer"
]
