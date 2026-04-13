"""YOLOv9 detector for Phase 3.5: Real vehicle detection.

Uses ultralytics YOLOv9 for accurate vehicle detection in traffic scenarios.
Supports COCO vehicle classes: car, motorcycle, bus, truck.
"""
import io
import os
from typing import Dict, Any, List
import numpy as np
from PIL import Image
from .base import Detector


class YoloV9Detector(Detector):
    """Real-time vehicle detector using YOLOv9."""

    # COCO dataset class IDs for vehicles
    VEHICLE_CLASS_MAP = {
        2: "car",
        3: "bike",      # motorcycle in COCO
        5: "bus",
        7: "truck"
    }

    # Higher input resolution catches small/distant vehicles in surveillance footage.
    # 1280 doubles the feature map vs default 640, significantly improving recall
    # at the cost of ~4x inference time (acceptable with detection stride).
    DEFAULT_IMGSZ = 1280

    def __init__(self, model_name: str = "yolov9c.pt", conf_threshold: float = 0.05):
        """
        Initialize YOLOv9 detector.
        
        Args:
            model_name: YOLOv9 model variant
                - yolov9t.pt (tiny, fastest)
                - yolov9s.pt (small, balanced)
                - yolov9m.pt (medium)
                - yolov9c.pt (compact, best accuracy/speed trade-off)
                - yolov9e.pt (extended, highest accuracy)
            conf_threshold: Minimum confidence score (0.0-1.0)
        """
        from ultralytics import YOLO
        import torch

        # Throughput tuning for CPU inference in desktop environments.
        cpu_count = max(1, os.cpu_count() or 1)
        torch_threads = max(1, cpu_count - 1)
        torch.set_num_threads(torch_threads)
        if hasattr(torch, "set_num_interop_threads"):
            torch.set_num_interop_threads(2)
        
        self.model_name = model_name
        self.conf_threshold = conf_threshold
        
        # Load pretrained YOLOv9 model (auto-downloads on first run)
        print(f"[YOLOv9] Loading model: {model_name}...")
        self.model = YOLO(model_name)
        self.model.to("cpu")
        
        # Optimize model for inference (15-20% speedup, no accuracy loss)
        # Set model to eval mode and disable gradients
        self.model.model.eval()
        for param in self.model.model.parameters():
            param.requires_grad = False

        # One-time warm-up to reduce first-request latency variance.
        try:
            warmup_frame = np.zeros((640, 640, 3), dtype=np.uint8)
            with torch.inference_mode():
                self.model(
                    warmup_frame,
                    conf=self.conf_threshold,
                    imgsz=self.DEFAULT_IMGSZ,
                    max_det=1,
                    iou=0.65,
                    agnostic_nms=True,
                    verbose=False
                )
        except Exception:
            pass
        
        print(
            f"[YOLOv9] Model loaded successfully. Inference optimizations enabled. "
            f"CPU threads={torch_threads}"
        )

    def detect(self, frame_data: bytes, source_id: str, timestamp: float) -> Dict[str, Any]:
        """
        Run YOLOv9 detection on a frame.
        
        Args:
            frame_data: Raw image bytes (JPEG/PNG)
            source_id: Junction/camera identifier
            timestamp: Frame capture timestamp
            
        Returns:
            Detection result with schema:
            {
                "source_id": str,
                "timestamp": float,
                "detections": [{"bbox": [x,y,w,h], "class": str, "score": float}],
                "detector_type": "yolov9",
                "model": str
            }
        """
        # Prepare model input (prefer raw numpy frames to avoid conversion overhead).
        model_input = frame_data
        try:
            if isinstance(frame_data, (bytes, bytearray)):
                image = Image.open(io.BytesIO(frame_data))
                if image.mode != 'RGB':
                    image = image.convert('RGB')
                model_input = np.asarray(image)
            else:
                if np is None or not hasattr(frame_data, "shape"):
                    raise ValueError("Unsupported frame_data type")

                # Keep OpenCV numpy input path (BGR) for best throughput.
                model_input = frame_data
        except Exception as e:
            # Provide detailed error for debugging
            error_msg = str(e)

            # Check if bytes look like video data
            if isinstance(frame_data, (bytes, bytearray)):
                if frame_data[:4] == b'\x00\x00\x00\x20' or frame_data[:3] == b'ftyp':
                    return {
                        "source_id": source_id,
                        "timestamp": timestamp,
                        "detections": [],
                        "detector_type": "yolov9",
                        "error": f"Video file detected: {error_msg}",
                        "hint": "Frame ingestion expects JPEG/PNG images only. For video files, use /api/v1/detect/video endpoint (Phase 3.7)",
                        "note": "Phase 3.7 provides video_detection with frame extraction"
                    }

            return {
                "source_id": source_id,
                "timestamp": timestamp,
                "detections": [],
                "detector_type": "yolov9",
                "error": f"Image decode failed: {error_msg}",
                "hint": "Ensure frame_base64 contains valid JPEG or PNG image data"
            }

        # Run YOLOv9 inference with optimizations
        # Use torch.inference_mode for faster inference (10-15% speedup)
        import torch
        with torch.inference_mode():
            # - imgsz=1280: Higher resolution for small/distant vehicle detection
            # - max_det=100: Limit max detections (traffic scenes rarely exceed this)
            # - iou=0.65: Relaxed NMS preserves close but separate vehicles in
            #   dense traffic while still merging near-identical boxes
            # - agnostic_nms=True: Class-agnostic NMS suppresses cross-class
            #   duplicates (same vehicle detected as both car AND truck)
            results = self.model(
                model_input,
                conf=self.conf_threshold,
                imgsz=self.DEFAULT_IMGSZ,
                max_det=100,
                iou=0.65,
                agnostic_nms=True,
                verbose=False
            )
        
        # Parse detections
        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is None or len(boxes) == 0:
                continue

            cls_ids = boxes.cls.cpu().numpy().astype(int)
            confs = boxes.conf.cpu().numpy()
            xyxy_all = boxes.xyxy.cpu().numpy()

            for class_id, confidence, xyxy in zip(cls_ids, confs, xyxy_all):
                
                # Filter: keep only vehicle classes
                if class_id not in self.VEHICLE_CLASS_MAP:
                    continue
                
                # Extract bounding box (xyxy format -> xywh)
                x1, y1, x2, y2 = xyxy
                x, y = int(x1), int(y1)
                w, h = int(x2 - x1), int(y2 - y1)
                
                # Map COCO class to traffic class
                vehicle_class = self.VEHICLE_CLASS_MAP[class_id]
                
                detections.append({
                    "bbox": [x, y, w, h],
                    "class": vehicle_class,
                    "score": round(float(confidence), 2)
                })
        
        return {
            "source_id": source_id,
            "timestamp": timestamp,
            "detections": detections,
            "detector_type": "yolov9",
            "model": self.model_name,
            "note": f"YOLOv9 real-time detection (conf >= {self.conf_threshold})"
        }

    def get_class_counts(self, detections: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        Count detected vehicles by class.
        
        Args:
            detections: List of detection dictionaries
            
        Returns:
            Dictionary with counts: {"car": N, "bike": N, "bus": N, "truck": N}
        """
        counts = {"car": 0, "bike": 0, "bus": 0, "truck": 0}
        for detection in detections:
            vehicle_class = detection.get("class", "unknown")
            if vehicle_class in counts:
                counts[vehicle_class] += 1
        return counts

    def clear_cache(self):
        """Clear model inference cache and free GPU/CPU memory.
        
        Call this after processing completes to prevent memory accumulation
        between video runs. Essential for maintaining consistent inference speed.
        """
        try:
            import torch
            
            # Clear model gradient buffers (even though we're in eval mode)
            if hasattr(self.model, 'model'):
                for param in self.model.model.parameters():
                    if param.grad is not None:
                        param.grad.zero_()
            
            # Clear model prediction cache if it exists
            if hasattr(self.model, 'predictor'):
                if hasattr(self.model.predictor, 'results'):
                    self.model.predictor.results = None
            
            # Clear any buffered results
            if hasattr(self.model, 'results'):
                self.model.results = None
            
            # Aggressively clear PyTorch internal state
            torch.cuda.empty_cache()
            if hasattr(torch.cpu, '_empty_cache'):
                torch.cpu._empty_cache()
            
            # Force garbage collection at torch level
            import gc as gc_module
            gc_module.collect()
        except Exception:
            pass  # Gracefully handle if torch operations fail
