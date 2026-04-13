"""
Multi-Object Tracking Module - Phase 4
==============================================
Uses DeepSORT algorithm to maintain consistent vehicle IDs across frames.

Academic Purpose:
- Assign unique track_id to each vehicle
- Maintain ID persistence across video frames
- Foundation for vehicle counting and dwell time analysis

Key Constraint:
- Does NOT modify detection results (YOLOv9 bboxes, classes, scores remain unchanged)
- Only adds track_id to each detection
"""

import numpy as np
import logging
from deep_sort_realtime.deepsort_tracker import DeepSort

logger = logging.getLogger(__name__)


class VehicleTracker:
    """
    Multi-object tracker using DeepSORT algorithm.
    
    Academic Explanation:
    DeepSORT (Deep learning-based SORT) extends the SORT (Simple Online and 
    Realtime Tracking) algorithm by incorporating appearance features from a 
    deep neural network. This allows robust tracking even when vehicles are 
    temporarily occluded or move between frames.
    
    Input per frame:
    - detections: List[{bbox, class, score}] from YOLOv9
    - frame: numpy array (BGR image for appearance embedding)
    
    Output per frame:
    - tracks: List[{track_id, bbox, class, score}]
    """
    
    def __init__(self, max_age=30, n_init=3, nn_budget=100, use_appearance: bool = False):
        """
        Initialize DeepSORT tracker.
        
        Args:
            max_age (int): Maximum frames to keep track if detection is missed.
                          Helps recover from temporary occlusions.
                          Default: 30 frames (~1 second at 30 FPS)
            
            n_init (int): Minimum detections before confirming a track.
                         Reduces false tracks from noise.
                         Default: 3 consecutive detections
            
            nn_budget (int): Maximum size of appearance embedding buffer per track.
                            Balances memory usage and tracking robustness.
                            Default: 100 embeddings
        
        Academic Note:
        These hyperparameters control the trade-off between:
        - Sensitivity to new objects (lower n_init) vs robustness to noise
        - Memory usage (lower nn_budget) vs tracking accuracy (higher values)
        """
        self.default_use_appearance = bool(use_appearance)
        self.use_appearance = self.default_use_appearance
        self._auto_switched_to_appearance = False
        self.deepsort = self._build_deepsort(max_age=max_age, n_init=n_init, nn_budget=nn_budget)
        
        self.track_history = {}  # Store historical info per track_id
        self.max_age = max_age
        self.n_init = n_init
        self.nn_budget = nn_budget
        logger.info(f"[Tracker] Initialized (max_age={max_age}, n_init={n_init})")
    
    def reset(self):
        """
        Reset tracker state. Call this before processing a new video
        to prevent track ID carryover between videos.
        """
        self.use_appearance = self.default_use_appearance
        self.deepsort = self._build_deepsort(max_age=self.max_age, n_init=self.n_init, nn_budget=self.nn_budget)
        self.track_history.clear()
        self._auto_switched_to_appearance = False
        logger.info(f"[Tracker] Reset for new video")

    def _build_deepsort(self, max_age: int, n_init: int, nn_budget: int):
        if self.use_appearance:
            return DeepSort(max_age=max_age, n_init=n_init, nn_budget=nn_budget)

        # Fast mode: disable appearance embedding and use motion/IoU association.
        # Keep compatibility with different deep_sort_realtime versions.
        try:
            return DeepSort(
                max_age=max_age,
                n_init=n_init,
                nn_budget=nn_budget,
                embedder=None
            )
        except TypeError:
            return DeepSort(max_age=max_age, n_init=n_init, nn_budget=nn_budget)
    
    def set_frame_interval(self, frame_interval: int):
        """
        Adjust tracker hyperparameters based on detection stride from VideoProcessor.
        
        With detection stride, YOLO runs every Nth frame while the tracker sees
        every frame.  We must adjust max_age and n_init so the tracker can
        confirm and retain tracks despite sparse detections.
        
        - max_age scales UP  so tracks survive the gap between detections.
        - n_init  scales DOWN so tracks can confirm with fewer detections.
        
        Args:
            frame_interval (int): Detection stride (gap between YOLO frames)
        """
        adjusted_max_age = self.max_age * frame_interval
        adjusted_n_init = max(1, int(self.n_init / frame_interval))
        
        # Rebuild DeepSort with adjusted params — the library does NOT
        # propagate attribute changes to its internal Tracker after init.
        self.deepsort = self._build_deepsort(
            max_age=adjusted_max_age,
            n_init=adjusted_n_init,
            nn_budget=self.nn_budget
        )
        
        logger.info(f"[Tracker] Detection stride: {frame_interval} → "
                   f"Rebuilt with max_age={adjusted_max_age} (base {self.max_age}), "
                   f"n_init={adjusted_n_init} (base {self.n_init})")
    
    def update(self, detections, frame, source_id=None):
        """
        Update tracker with new detections from current frame.
        
        Args:
            detections (list): List of detections from YOLO
                              Each detection: {bbox, class, score, ...}
            
            frame (np.ndarray): Current video frame (BGR format)
                               Used for appearance feature extraction
            
            source_id (str): Camera/source identifier for logging
        
        Returns:
            list: Tracked objects with assigned IDs
                  [{track_id, bbox, class, score, confidence}, ...]
        
        Academic Explanation of the Process:
        
        1. DETECTION PREPARATION
           - Extract bounding boxes in format [x1, y1, x2, y2] (top-left, bottom-right)
           - Normalize confidence scores as detection_confidence
           
        2. APPEARANCE EMBEDDING
           - DeepSORT extracts deep features from cropped vehicle images
           - These features are invariant to pose, lighting, viewing angle
           - Enables re-identification if vehicle leaves and returns
           
        3. KALMAN FILTER PREDICTION
           - Predicts where each tracked object should be next
           - Uses motion model (constant velocity assumption)
           - Helps handle temporary occlusions
           
        4. ASSOCIATION (Hungarian Algorithm)
           - Matches new detections to predicted track positions
           - Uses IoU (Intersection over Union) for spatial distance
           - Uses cosine similarity on appearance features
           - Greedy assignment minimizes total cost
           
        5. TRACK MANAGEMENT
           - New detection without match → new track (if passes n_init threshold)
           - Detection matches track → update track position
           - No detection for track → tentative state
           - If no detection for max_age frames → remove track
        """
        
        # Prepare detections for DeepSORT
        detections_input = []
        
        if detections:
            for det in detections:
                # Extract bounding box [x, y, w, h] from detection
                bbox = det.get('bbox', None)
                
                # Handle different bbox formats
                if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
                    x, y, w, h = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
                    
                    # Confidence score (detection reliability from YOLO)
                    conf = float(det.get('score', 0.5))
                    
                    # Class name
                    class_name = str(det.get('class', 'vehicle'))
                    
                    # DeepSORT expects: [bbox, confidence, class_name]
                    # where bbox = [x, y, w, h] (center coordinates + width/height)
                    detection_entry = [[x, y, w, h], conf, class_name]
                    detections_input.append(detection_entry)
                else:
                    # Skip detections with invalid bbox format
                    continue
        
        # Update DeepSORT tracker with current frame detections
        # Returns: list of Track objects with confirmed and tentative tracks
        try:
            # DeepSORT.update_tracks() expects list of [bbox, conf, class] entries.
            # With embedder=None we must supply explicit embeds; passing identical
            # unit vectors for EVERY detection makes cosine distance = 0 everywhere,
            # so DeepSORT falls back to pure IoU/Kalman matching — exactly what we
            # want for stable track IDs regardless of class label.
            tracker_frame = frame if self.use_appearance else None
            uniform_embeds = None
            if not self.use_appearance:
                uniform_embeds = [[1.0, 0.0, 0.0, 0.0]] * len(detections_input) if detections_input else []
            tracks = self.deepsort.update_tracks(
                detections_input,  # Format: [[[x,y,w,h], conf, class], ...]
                embeds=uniform_embeds,
                frame=tracker_frame  # Frame only needed when appearance embedding is enabled
            )
        except Exception as e:
            # Keep runtime stable: do NOT auto-switch to appearance mode,
            # because that can make the entire remaining video much slower.
            # Rebuild fast tracker once and fall back for this frame if needed.
            if not self.use_appearance:
                logger.warning(f"[Tracker] Fast mode update failed ({e}); staying in fast mode")
                try:
                    self.deepsort = self._build_deepsort(
                        max_age=self.max_age,
                        n_init=self.n_init,
                        nn_budget=self.nn_budget
                    )
                except Exception:
                    pass
            return self._fallback_tracking(detections)
        
        # Convert DeepSORT Track objects to our output format
        tracked_objects = []
        
        # With detection stride, tracks may never reach "confirmed" status
        # because detections are sparse.  On frames where YOLO actually ran
        # (detections_input is non-empty), include any track that was just
        # created or matched (time_since_update == 0) even if still tentative.
        # On prediction-only frames (no detections), only include confirmed
        # tracks that were recently matched.
        has_detections = len(detections_input) > 0
        
        for i, track in enumerate(tracks):
            time_since = getattr(track, "time_since_update", 1)
            confirmed = track.is_confirmed()
            
            # Include track if:
            # 1. Confirmed AND matched this frame (original strict filter), OR
            # 2. Detection frame AND track was just created/matched this frame
            #    (allows tentative tracks from fresh YOLO detections)
            if time_since > 0:
                continue  # Skip stale/predicted tracks regardless
            
            if not confirmed and not has_detections:
                continue  # Skip tentative tracks on prediction-only frames
            
            track_id = track.track_id
            
            # Get bounding box from track using to_ltrb() which returns [x1, y1, x2, y2]
            bbox_ltrb = track.to_ltrb()
            
            # Get class and confidence from track (preserved from detection)
            vehicle_class = track.det_class if track.det_class else 'unknown'
            confidence = float(track.det_conf) if track.det_conf is not None else 0.5
            
            # Create output track object
            # Maintains original detection schema while adding track_id
            tracked_obj = {
                'track_id': track_id,
                'bbox': [int(bbox_ltrb[0]), int(bbox_ltrb[1]), int(bbox_ltrb[2] - bbox_ltrb[0]), int(bbox_ltrb[3] - bbox_ltrb[1])],  # Convert to [x, y, w, h]
                'class': vehicle_class,
                'score': confidence,
                'confirmed': track.is_confirmed()
            }
            
            tracked_objects.append(tracked_obj)
        
        return tracked_objects
    
    def _bbox_distance(self, bbox1, bbox2):
        """
        Calculate distance between two bboxes using Intersection over Union (IoU).
        
        IoU = Area(Intersection) / Area(Union)
        
        Academic Note: IoU is invariant to image size and is commonly used in
        object detection for non-maximum suppression and track association.
        
        Args:
            bbox1, bbox2: [x1, y1, x2, y2] format
        
        Returns:
            float: 1 - IoU (distance, lower is better match)
        """
        x1_min, y1_min, x1_max, y1_max = bbox1
        x2_min, y2_min, x2_max, y2_max = bbox2
        
        # Calculate intersection
        inter_xmin = max(x1_min, x2_min)
        inter_ymin = max(y1_min, y2_min)
        inter_xmax = min(x1_max, x2_max)
        inter_ymax = min(y1_max, y2_max)
        
        if inter_xmax < inter_xmin or inter_ymax < inter_ymin:
            return 1.0  # No intersection
        
        inter_area = (inter_xmax - inter_xmin) * (inter_ymax - inter_ymin)
        
        # Calculate union
        bbox1_area = (x1_max - x1_min) * (y1_max - y1_min)
        bbox2_area = (x2_max - x2_min) * (y2_max - y2_min)
        union_area = bbox1_area + bbox2_area - inter_area
        
        if union_area == 0:
            return 1.0
        
        iou = inter_area / union_area
        return 1.0 - iou  # Distance: 1 - IoU
    
    def _fallback_tracking(self, detections):
        """
        Fallback when DeepSORT update fails.
        Returns detections without tracking IDs (preserves detection data).
        
        This ensures system continues even if tracker fails.
        """
        tracked_objects = []
        for det in detections:
            obj = dict(det)
            obj['track_id'] = -1  # Untracked indicator
            obj['confirmed'] = False
            tracked_objects.append(obj)
        return tracked_objects
    
