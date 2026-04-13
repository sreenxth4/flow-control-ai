"""
Traffic Density Analysis Module - Phase 5
==========================================
Analyzes vehicle tracking data to compute road-level traffic metrics.

Design: Per-road analysis only (one video = one road)
Context: Indian traffic systems with all vehicle types
Output: Road-level metrics (vehicle count, type distribution, density, dwell time)

Academic Explanation:
- Uses unique track_ids from Phase 4 (DeepSORT) as proxy for vehicles
- Vehicle type classification normalizes YOLO class names
- Density thresholds based on Indian road traffic patterns
- Dwell time = average frames vehicle remains visible (proxy for time spent on road)
"""

import logging
import re
from typing import Dict, List, Any, Tuple
from modules.density import TrafficDensityClassifier

logger = logging.getLogger(__name__)


class RoadDensityAnalyzer:
    """
    Analyzes traffic density for a single road approach.
    
    Metrics computed:
    - Total unique vehicle count (using track IDs from DeepSORT)
    - Vehicle type distribution (cars, bikes, autos, buses, trucks, cycles)
    - Traffic density classification (LOW/MEDIUM/HIGH)
    - Average dwell time (frames vehicle visible in frame)
    
    Design: One video = one road approach (no multi-road or lane-wise logic)
    """
    
    # Indian traffic density thresholds (vehicles per road)
    DENSITY_THRESHOLDS = {
        'LOW': (0, 10),           # Light traffic (0-10 vehicles)
        'MEDIUM': (10, 25),       # Moderate traffic (10-25 vehicles)
        'HIGH': (25, float('inf'))  # Heavy/congested (25+ vehicles)
    }
    
    # Vehicle type normalization (YOLO class names → standardized types)
    VEHICLE_TYPES = {
        'car': 'car',
        'motorcycle': 'bike',
        'motorbike': 'bike',
        'bike': 'bike',
        'bicycle': 'cycle',
        'bus': 'bus',
        'truck': 'truck',
        'auto': 'auto',
        'auto-rickshaw': 'auto',
        'person': 'unknown',
        'dog': 'unknown'
    }

    # Indian PCU (Passenger Car Unit) weights
    # Based on IRC (Indian Roads Congress) SP:41 guidelines
    # PCU normalizes all vehicle types to car-equivalents for density calculation
    PCU_WEIGHTS = {
        'car': 1.0,        # Reference unit
        'bike': 0.5,       # Two-wheelers occupy less space but reduce capacity
        'auto': 1.0,       # Three-wheelers ≈ car in Indian traffic
        'bus': 3.0,         # Large, slow, frequent stops
        'truck': 3.0,       # Large, slow, blocks lane
        'cycle': 0.3,       # Slow moving, occupies partial lane
        'unknown': 1.0      # Default to car-equivalent
    }

    TRACK_STITCH_MAX_GAP_SECONDS = 0.3
    TRACK_STITCH_MAX_CENTER_DISTANCE_FACTOR = 1.2
    TRACK_STITCH_MIN_IOU = 0.3
    TRACK_STITCH_STRICT_IOU = 0.6
    OVERLAP_DUPLICATE_MIN_IOU = 0.60
    OVERLAP_DUPLICATE_MIN_RATIO = 0.5
    OVERLAP_DUPLICATE_MIN_SECONDS = 0.2
    
    # Conservative anti-noise filtering after stitching.
    # Require at least two analyzed frames for non-stitched tracks to remove
    # one-frame ghosts without dropping stable vehicles.
    MIN_TRACK_DURATION_SECONDS = 0.12
    TRACK_DEBUG_MAX_ITEMS = 60
    
    def __init__(self):
        """Initialize road density analyzer."""
        self.density_classifier = TrafficDensityClassifier(smoothing_window=10)
        logger.info("[DensityAnalyzer] Road Density Analyzer initialized")
    
    def analyze(self, 
                detections_per_frame: List[Dict[str, Any]], 
                road_id: str = "R1",
                analyzed_fps: float = 5.0) -> Dict[str, Any]:
        """
        Analyze vehicle tracking data across all frames of a road.
        
        Academic Explanation:
        1. Collects all unique track_ids from confirmed tracks across frames
           - Confirmed tracks = vehicles seen in n_init consecutive frames
           - track_id is unique identifier for each vehicle instance
        
        2. Classifies each vehicle by type
           - Normalizes YOLO class names to standard categories
           - Handles class name variations (e.g., motorcycle, motorbike → bike)
        
        3. Calculates dwell time statistics
           - Dwell time (per vehicle) = number of frames vehicle visible
           - Average dwell time = sum of all dwell times / number of vehicles
           - Proxy for actual time: frame_count ≈ (frame_count / FPS) seconds
        
        4. Classifies traffic density
           - Uses Indian road thresholds (LOW/MEDIUM/HIGH)
           - Threshold based: vehicle_count in road
        
        Args:
            detections_per_frame: List of frame data from video_processor
                Each frame dict contains:
                {
                    "frame_number": int,
                    "timestamp": float (seconds),
                    "detections": list,
                    "tracks": [
                        {
                            "track_id": int,
                            "bbox": [x, y, w, h],
                            "class": str,
                            "score": float,
                            "confirmed": bool
                        },
                        ...
                    ]
                }
            
            road_id: Unique identifier for road (e.g., "R1_North_Approach")
        
        Returns:
            Dict with road-level traffic metrics:
            {
                "road_id": str,
                "total_vehicles": int (unique track_ids),
                "vehicle_type_distribution": {
                    "car": int,
                    "bike": int,
                    "auto": int,
                    "bus": int,
                    "truck": int,
                    "cycle": int
                },
                "traffic_density": "LOW" | "MEDIUM" | "HIGH",
                "average_dwell_time_seconds": float,
                "peak_vehicles_in_frame": int,
                "frames_analyzed": int,
                "tracking_enabled": bool
            }
        """
        
        if not detections_per_frame:
            logger.warning(f"[DensityAnalyzer] Road {road_id}: No frames to analyze")
            return self._empty_result(road_id)
        
        # ===== STEP 1: COLLECT ALL UNIQUE VEHICLES =====
        # Dictionary: track_id -> vehicle metadata
        unique_vehicles = {}  # {track_id: {class, frames_visible, entry_frame, exit_frame}}
        max_vehicles_in_frame = 0
        
        first_analyzed_frame = detections_per_frame[0].get("frame_number", 0)
        last_analyzed_frame = detections_per_frame[-1].get("frame_number", first_analyzed_frame)
        
        per_frame_counts = []

        for frame_data in detections_per_frame:
            frame_num = frame_data.get("frame_number", 0)
            frame_timestamp = float(frame_data.get("timestamp", 0.0))
            tracks = frame_data.get("tracks", [])
            
            # Count all tracks emitted by tracker (pre-filtered there)
            valid_tracks = tracks
            max_vehicles_in_frame = max(max_vehicles_in_frame, len(valid_tracks))
            per_frame_counts.append(len(valid_tracks))
            
            # Record each vehicle's appearance
            for track in valid_tracks:
                track_id = track.get("track_id")
                vehicle_class = track.get("class", "unknown")
                
                # Skip invalid track IDs (None or empty)
                if track_id is None or track_id == "":
                    continue
                
                if track_id not in unique_vehicles:
                    # First appearance of this vehicle
                    unique_vehicles[track_id] = {
                        "class": vehicle_class,
                        "frames": [],
                        "entry_frame": frame_num,
                        "exit_frame": frame_num,
                        "entry_timestamp": frame_timestamp,
                        "exit_timestamp": frame_timestamp,
                        "entry_bbox": track.get("bbox"),
                        "exit_bbox": track.get("bbox")
                    }
                
                # Add this frame to vehicle's frame list (avoid duplicates)
                if frame_num not in unique_vehicles[track_id]["frames"]:
                    unique_vehicles[track_id]["frames"].append(frame_num)
                unique_vehicles[track_id]["exit_frame"] = frame_num
                unique_vehicles[track_id]["exit_timestamp"] = frame_timestamp
                unique_vehicles[track_id]["exit_bbox"] = track.get("bbox")

        raw_track_count = len(unique_vehicles)
        unique_vehicles, stitch_events = self._stitch_fragmented_tracks(unique_vehicles, analyzed_fps)
        pre_overlap_count = len(unique_vehicles)
        unique_vehicles, overlap_merge_events = self._deduplicate_overlapping_tracks(unique_vehicles)
        overlap_merged_count = max(0, pre_overlap_count - len(unique_vehicles))
        stitched_track_count = len(unique_vehicles)
        
        # Filter residual short-lived noise tracks after stitching.
        min_track_frames = max(2, int(round(analyzed_fps * self.MIN_TRACK_DURATION_SECONDS)))
        filtered_vehicles = {}
        spurious_tracks = []
        filter_events = []
        for track_id, vehicle_data in unique_vehicles.items():
            frames_visible = len(vehicle_data.get("frames", []))
            track_ids = vehicle_data.get("track_ids", [track_id])
            was_merged = len(track_ids) > 1
            raw_class = vehicle_data.get("class", "unknown")
            norm_class = self.VEHICLE_TYPES.get(self._normalize_class_name(raw_class), "car")

            # Heavier classes should persist longer; this suppresses short
            # bus/truck ghost tracks that can inflate totals by +1.
            required_track_frames = min_track_frames
            if norm_class in {"bus", "truck"}:
                required_track_frames = max(required_track_frames, 3)

            if frames_visible >= required_track_frames or was_merged:
                filtered_vehicles[track_id] = vehicle_data
                if len(filter_events) < self.TRACK_DEBUG_MAX_ITEMS:
                    filter_events.append({
                        "track_id": str(track_id),
                        "decision": "kept",
                        "reason": "merged_track" if was_merged and frames_visible < required_track_frames else "min_frames_pass",
                        "frames_visible": frames_visible,
                        "min_required_frames": required_track_frames,
                        "source_track_ids": [str(tid) for tid in track_ids],
                        "class": raw_class
                    })
            else:
                spurious_tracks.append((track_id, frames_visible, vehicle_data.get("class", "unknown")))
                if len(filter_events) < self.TRACK_DEBUG_MAX_ITEMS:
                    filter_events.append({
                        "track_id": str(track_id),
                        "decision": "dropped",
                        "reason": "short_track",
                        "frames_visible": frames_visible,
                        "min_required_frames": required_track_frames,
                        "source_track_ids": [str(tid) for tid in track_ids],
                        "class": raw_class
                    })
                logger.debug(
                    f"[DensityAnalyzer] FILTERED spurious track {track_id}: "
                    f"only {frames_visible} frames (class={vehicle_data.get('class')})"
                )
        
        unique_vehicles = filtered_vehicles
        
        if spurious_tracks:
            logger.info(
                f"[DensityAnalyzer] Filtered {len(spurious_tracks)} spurious tracks "
                f"(< {min_track_frames} frames): {spurious_tracks}"
            )
        
        logger.info(
            f"[DensityAnalyzer] Identified {raw_track_count} raw tracks, "
            f"{stitched_track_count} stitched, {len(unique_vehicles)} valid vehicles on road {road_id}"
        )
        logger.debug(f"[DensityAnalyzer] Track IDs: {list(unique_vehicles.keys())}")
        
        # ===== STEP 2: CLASSIFY VEHICLES BY TYPE =====
        type_distribution = {
            "car": 0,
            "bike": 0,
            "auto": 0,
            "bus": 0,
            "truck": 0,
            "cycle": 0
        }
        
        for track_id, vehicle_data in unique_vehicles.items():
            raw_class = vehicle_data["class"]
            class_name = self._normalize_class_name(raw_class)
            
            logger.debug(f"[DensityAnalyzer] Track {track_id}: raw_class='{raw_class}' → normalized='{class_name}'")
            
            # Normalize class name using mapping
            normalized_type = self.VEHICLE_TYPES.get(class_name, "car")
            
            # Skip unknown vehicles
            if normalized_type != "unknown" and normalized_type in type_distribution:
                type_distribution[normalized_type] += 1
                logger.debug(f"[DensityAnalyzer] Track {track_id}: Classified as '{normalized_type}'")
        
        logger.debug(f"[DensityAnalyzer] Vehicle type distribution: {type_distribution}")
        
        # ===== STEP 3: CALCULATE DWELL TIMES =====
        # Dwell time = how many frames each vehicle is visible
        # Use timestamp span (inclusive) for each track to reduce sensitivity to dropped detections.
        frame_time = (1.0 / analyzed_fps) if analyzed_fps > 0 else 0.0
        observed_dwell_seconds = []
        complete_dwell_seconds = []

        for vehicle_data in unique_vehicles.values():
            entry_ts = float(vehicle_data.get("entry_timestamp", 0.0))
            exit_ts = float(vehicle_data.get("exit_timestamp", entry_ts))

            # Inclusive span: if seen in only one analyzed frame, dwell ~= one frame duration.
            dwell_s = max(0.0, (exit_ts - entry_ts) + frame_time)

            # Fallback if timestamps are unavailable/degenerate.
            if dwell_s == 0.0:
                frames_visible = len(vehicle_data.get("frames", []))
                dwell_s = (frames_visible / analyzed_fps) if analyzed_fps > 0 else float(frames_visible)

            observed_dwell_seconds.append(dwell_s)

            # "Complete" tracks are not clipped by video boundaries.
            if (vehicle_data.get("entry_frame") != first_analyzed_frame and
                vehicle_data.get("exit_frame") != last_analyzed_frame):
                complete_dwell_seconds.append(dwell_s)

        avg_observed_dwell_seconds = (
            sum(observed_dwell_seconds) / len(observed_dwell_seconds)
            if observed_dwell_seconds else 0.0
        )
        avg_complete_dwell_seconds = (
            sum(complete_dwell_seconds) / len(complete_dwell_seconds)
            if complete_dwell_seconds else 0.0
        )

        # Keep backward-compatible key but prefer complete tracks when available.
        avg_dwell_time_seconds = (
            avg_complete_dwell_seconds if complete_dwell_seconds else avg_observed_dwell_seconds
        )

        logger.debug(
            f"[DensityAnalyzer] Dwell (observed avg={avg_observed_dwell_seconds:.2f}s, "
            f"complete avg={avg_complete_dwell_seconds:.2f}s, complete_tracks={len(complete_dwell_seconds)})"
        )
        
        # ===== STEP 4: CLASSIFY TRAFFIC DENSITY (PCU-weighted) =====
        total_vehicles = len(unique_vehicles)

        # Calculate total PCU (Passenger Car Units) for Indian traffic
        total_pcu = 0.0
        for vehicle_data in unique_vehicles.values():
            raw_class = vehicle_data["class"]
            class_name = self._normalize_class_name(raw_class)
            normalized_type = self.VEHICLE_TYPES.get(class_name, "car")
            if normalized_type == "unknown":
                normalized_type = "car"
            total_pcu += self.PCU_WEIGHTS.get(normalized_type, 1.0)

        # Build PCU-weighted per-frame counts for rolling density classification
        # Only include frames with tracks (detection frames). Non-detection frames
        # have 0 tracks and would dilute the rolling average incorrectly.
        pcu_per_frame_counts = []
        for frame_data in detections_per_frame:
            tracks = frame_data.get("tracks", [])
            if not tracks:
                continue  # Skip non-detection frames to avoid diluting density
            frame_pcu = 0.0
            for track in tracks:
                raw_cls = track.get("class", "unknown")
                cls_name = self._normalize_class_name(raw_cls)
                norm_type = self.VEHICLE_TYPES.get(cls_name, "car")
                if norm_type == "unknown":
                    norm_type = "car"
                frame_pcu += self.PCU_WEIGHTS.get(norm_type, 1.0)
            pcu_per_frame_counts.append(frame_pcu)

        self.density_classifier.reset()
        smoothed_result = None
        for pcu_count in pcu_per_frame_counts:
            smoothed_result = self.density_classifier.classify_density({road_id: pcu_count})[0]

        density_level = smoothed_result["density_level"] if smoothed_result else "LOW"
        density_score = smoothed_result["density_score"] if smoothed_result else 0.0

        logger.info(
            f"[DensityAnalyzer] Road {road_id}: {total_vehicles} vehicles = {total_pcu:.1f} PCU "
            f"(e.g. 1 bus = 3 cars, 1 bike = 0.5 cars)"
        )
        
        logger.info(f"[DensityAnalyzer] Road {road_id}: {total_vehicles} unique vehicles, "
                   f"density={density_level}, peak_frame={max_vehicles_in_frame}, "
                   f"avg_dwell={avg_dwell_time_seconds:.2f}s")
        
        # ===== STEP 5: COMPILE RESULTS =====
        result = {
            "road_id": road_id,
            "total_vehicles": total_vehicles,
            "total_pcu": round(total_pcu, 1),
            "raw_track_count": raw_track_count,
            "overlap_merged_count": overlap_merged_count,
            "vehicle_type_distribution": type_distribution,
            "traffic_density": density_level,
            "density_score": round(density_score, 3),
            "average_dwell_time_seconds": round(avg_dwell_time_seconds, 2),
            "average_observed_dwell_time_seconds": round(avg_observed_dwell_seconds, 2),
            "average_complete_dwell_time_seconds": round(avg_complete_dwell_seconds, 2),
            "complete_track_count": len(complete_dwell_seconds),
            "dwell_time_reliability": "HIGH" if len(complete_dwell_seconds) > 0 else "LOW",
            "peak_vehicles_in_frame": max_vehicles_in_frame,
            "frames_analyzed": len(detections_per_frame),
            "tracking_enabled": True
        }

        final_track_debug = []
        for final_track_id, final_track in unique_vehicles.items():
            if len(final_track_debug) >= self.TRACK_DEBUG_MAX_ITEMS:
                break
            src_track_ids = final_track.get("track_ids", [final_track_id])
            final_track_debug.append({
                "track_id": str(final_track_id),
                "class": final_track.get("class", "unknown"),
                "frames_visible": len(final_track.get("frames", [])),
                "entry_timestamp": round(float(final_track.get("entry_timestamp", 0.0)), 3),
                "exit_timestamp": round(float(final_track.get("exit_timestamp", 0.0)), 3),
                "source_track_ids": [str(tid) for tid in src_track_ids]
            })

        result["track_diagnostics"] = {
            "summary": {
                "raw_track_count": raw_track_count,
                "post_stitch_track_count": pre_overlap_count,
                "post_overlap_track_count": stitched_track_count,
                "final_valid_track_count": len(unique_vehicles),
                "stitch_merge_count": len(stitch_events),
                "overlap_merge_count": len(overlap_merge_events),
                "filtered_short_track_count": len(spurious_tracks),
                "min_required_frames": min_track_frames,
                "max_items_returned": self.TRACK_DEBUG_MAX_ITEMS
            },
            "stitch_events": stitch_events[:self.TRACK_DEBUG_MAX_ITEMS],
            "overlap_merge_events": overlap_merge_events[:self.TRACK_DEBUG_MAX_ITEMS],
            "filter_events": filter_events,
            "final_tracks": final_track_debug
        }
        
        return result

    def _normalize_class_name(self, raw_class: str) -> str:
        return re.sub(r'\d+$', '', str(raw_class).lower()).strip()

    def _stitch_fragmented_tracks(
        self,
        unique_vehicles: Dict[Any, Dict[str, Any]],
        analyzed_fps: float
    ) -> Tuple[Dict[Any, Dict[str, Any]], List[Dict[str, Any]]]:
        """Stitch likely fragmented track IDs that belong to the same vehicle."""
        if not unique_vehicles:
            return unique_vehicles, []

        max_gap_seconds = self.TRACK_STITCH_MAX_GAP_SECONDS
        sorted_tracks = sorted(
            unique_vehicles.items(),
            key=lambda item: float(item[1].get("entry_timestamp", 0.0))
        )

        stitched_output: Dict[Any, Dict[str, Any]] = {}
        stitch_events: List[Dict[str, Any]] = []

        for track_id, data in sorted_tracks:
            candidate = dict(data)
            candidate_track_ids = [track_id]
            candidate_entry_ts = float(candidate.get("entry_timestamp", 0.0))
            candidate_entry_bbox = candidate.get("entry_bbox")
            candidate_class = self._normalize_class_name(candidate.get("class", "unknown"))

            best_match_key = None
            best_score = None
            best_gap = None
            best_iou = None

            for stitched_key, stitched_data in stitched_output.items():
                stitched_exit_ts = float(stitched_data.get("exit_timestamp", 0.0))
                stitched_exit_bbox = stitched_data.get("exit_bbox")
                stitched_class = self._normalize_class_name(stitched_data.get("class", "unknown"))

                # Must be forward in time and within allowable gap.
                if candidate_entry_ts < stitched_exit_ts:
                    continue

                gap = candidate_entry_ts - stitched_exit_ts
                if gap > max_gap_seconds:
                    continue

                # Spatial continuity check.
                if not self._is_spatially_continuous(stitched_exit_bbox, candidate_entry_bbox):
                    continue

                # Class compatibility: allow mismatch only when overlap is very strong,
                # because detector class may flicker between similar large vehicles.
                iou = self._bbox_iou(stitched_exit_bbox, candidate_entry_bbox)
                class_compatible = (
                    stitched_class == candidate_class
                    or stitched_class == "unknown"
                    or candidate_class == "unknown"
                    or iou >= self.TRACK_STITCH_STRICT_IOU
                )
                if not class_compatible:
                    continue

                score = (gap, -iou)
                if best_score is None or score < best_score:
                    best_score = score
                    best_match_key = stitched_key
                    best_gap = gap
                    best_iou = iou

            if best_match_key is None:
                stitch_key = f"track_{len(stitched_output) + 1}"
                candidate["track_ids"] = candidate_track_ids
                stitched_output[stitch_key] = candidate
                continue

            existing = stitched_output[best_match_key]
            existing_frames = existing.get("frames", [])
            candidate_frames = candidate.get("frames", [])
            merged_frames = sorted(set(existing_frames + candidate_frames))

            if len(candidate_frames) > len(existing_frames):
                existing["class"] = candidate.get("class", existing.get("class", "unknown"))

            existing["frames"] = merged_frames
            existing["exit_frame"] = candidate.get("exit_frame", existing.get("exit_frame"))
            existing["exit_timestamp"] = candidate.get("exit_timestamp", existing.get("exit_timestamp"))
            existing["exit_bbox"] = candidate.get("exit_bbox", existing.get("exit_bbox"))
            existing["track_ids"] = existing.get("track_ids", []) + candidate_track_ids

            if len(stitch_events) < self.TRACK_DEBUG_MAX_ITEMS:
                stitch_events.append({
                    "kept_track_key": str(best_match_key),
                    "merged_track_ids": [str(tid) for tid in candidate_track_ids],
                    "merged_into_track_ids": [str(tid) for tid in existing.get("track_ids", [])],
                    "candidate_entry_ts": round(float(candidate_entry_ts), 3),
                    "gap_seconds": round(float(best_gap), 3) if best_gap is not None else 0.0,
                    "iou": round(float(best_iou), 3) if best_iou is not None else 0.0
                })

        return stitched_output, stitch_events

    def _deduplicate_overlapping_tracks(
        self,
        stitched_tracks: Dict[Any, Dict[str, Any]]
    ) -> Tuple[Dict[Any, Dict[str, Any]], List[Dict[str, Any]]]:
        """Merge duplicate tracks that overlap in time and space (ID/class flicker)."""
        if len(stitched_tracks) < 2:
            return stitched_tracks, []

        items = list(stitched_tracks.items())
        merged_into = {}
        overlap_merge_events: List[Dict[str, Any]] = []

        for i in range(len(items)):
            key_a, track_a = items[i]
            if key_a in merged_into:
                continue

            start_a = float(track_a.get("entry_timestamp", 0.0))
            end_a = float(track_a.get("exit_timestamp", start_a))
            duration_a = max(0.0, end_a - start_a)

            for j in range(i + 1, len(items)):
                key_b, track_b = items[j]
                if key_b in merged_into or key_a in merged_into:
                    continue

                start_b = float(track_b.get("entry_timestamp", 0.0))
                end_b = float(track_b.get("exit_timestamp", start_b))
                duration_b = max(0.0, end_b - start_b)

                overlap_start = max(start_a, start_b)
                overlap_end = min(end_a, end_b)
                overlap_seconds = max(0.0, overlap_end - overlap_start)
                if overlap_seconds <= 0.0:
                    continue
                if overlap_seconds < self.OVERLAP_DUPLICATE_MIN_SECONDS:
                    continue

                smaller_duration = min(duration_a, duration_b)
                if smaller_duration <= 0.0:
                    continue

                overlap_ratio = overlap_seconds / smaller_duration
                if overlap_ratio < self.OVERLAP_DUPLICATE_MIN_RATIO:
                    continue

                entry_bbox_a = track_a.get("entry_bbox")
                entry_bbox_b = track_b.get("entry_bbox")
                exit_bbox_a = track_a.get("exit_bbox")
                exit_bbox_b = track_b.get("exit_bbox")

                entry_iou = (
                    self._bbox_iou(entry_bbox_a, entry_bbox_b)
                    if self._valid_bbox(entry_bbox_a) and self._valid_bbox(entry_bbox_b)
                    else 0.0
                )
                exit_iou = (
                    self._bbox_iou(exit_bbox_a, exit_bbox_b)
                    if self._valid_bbox(exit_bbox_a) and self._valid_bbox(exit_bbox_b)
                    else 0.0
                )
                spatial_similarity = max(entry_iou, exit_iou)
                if spatial_similarity < self.OVERLAP_DUPLICATE_MIN_IOU:
                    continue

                keep_key, keep_track = (key_a, track_a) if len(track_a.get("frames", [])) >= len(track_b.get("frames", [])) else (key_b, track_b)
                drop_key, drop_track = (key_b, track_b) if keep_key == key_a else (key_a, track_a)

                keep_frames = keep_track.get("frames", [])
                drop_frames = drop_track.get("frames", [])
                keep_track["frames"] = sorted(set(keep_frames + drop_frames))

                keep_track["entry_frame"] = min(
                    keep_track.get("entry_frame", 0),
                    drop_track.get("entry_frame", 0)
                )
                keep_track["exit_frame"] = max(
                    keep_track.get("exit_frame", 0),
                    drop_track.get("exit_frame", 0)
                )
                keep_track["entry_timestamp"] = min(
                    float(keep_track.get("entry_timestamp", 0.0)),
                    float(drop_track.get("entry_timestamp", 0.0))
                )
                keep_track["exit_timestamp"] = max(
                    float(keep_track.get("exit_timestamp", 0.0)),
                    float(drop_track.get("exit_timestamp", 0.0))
                )

                keep_track_ids = keep_track.get("track_ids", [])
                drop_track_ids = drop_track.get("track_ids", [])
                keep_track["track_ids"] = keep_track_ids + drop_track_ids

                merged_into[drop_key] = keep_key

                if len(overlap_merge_events) < self.TRACK_DEBUG_MAX_ITEMS:
                    overlap_merge_events.append({
                        "kept_track_key": str(keep_key),
                        "dropped_track_key": str(drop_key),
                        "kept_source_track_ids": [str(tid) for tid in keep_track.get("track_ids", [])],
                        "dropped_source_track_ids": [str(tid) for tid in drop_track_ids],
                        "overlap_seconds": round(float(overlap_seconds), 3),
                        "overlap_ratio": round(float(overlap_ratio), 3),
                        "entry_iou": round(float(entry_iou), 3),
                        "exit_iou": round(float(exit_iou), 3),
                        "spatial_similarity": round(float(spatial_similarity), 3)
                    })

        if not merged_into:
            return stitched_tracks, overlap_merge_events

        deduped = {k: v for k, v in stitched_tracks.items() if k not in merged_into}
        logger.info(
            f"[DensityAnalyzer] Overlap dedup merged {len(merged_into)} duplicate tracks"
        )
        return deduped, overlap_merge_events

    def _is_spatially_continuous(self, bbox_a: Any, bbox_b: Any) -> bool:
        if not self._valid_bbox(bbox_a) or not self._valid_bbox(bbox_b):
            return False

        iou = self._bbox_iou(bbox_a, bbox_b)
        if iou >= self.TRACK_STITCH_MIN_IOU:
            return True

        center_distance = self._bbox_center_distance(bbox_a, bbox_b)
        scale = max(float(bbox_a[2]), float(bbox_a[3]), float(bbox_b[2]), float(bbox_b[3]), 1.0)
        return center_distance <= (self.TRACK_STITCH_MAX_CENTER_DISTANCE_FACTOR * scale)

    def _valid_bbox(self, bbox: Any) -> bool:
        return isinstance(bbox, (list, tuple)) and len(bbox) >= 4

    def _bbox_center_distance(self, bbox_a: List[float], bbox_b: List[float]) -> float:
        ax = float(bbox_a[0]) + float(bbox_a[2]) / 2.0
        ay = float(bbox_a[1]) + float(bbox_a[3]) / 2.0
        bx = float(bbox_b[0]) + float(bbox_b[2]) / 2.0
        by = float(bbox_b[1]) + float(bbox_b[3]) / 2.0
        dx = ax - bx
        dy = ay - by
        return (dx * dx + dy * dy) ** 0.5

    def _bbox_iou(self, bbox_a: List[float], bbox_b: List[float]) -> float:
        ax1 = float(bbox_a[0])
        ay1 = float(bbox_a[1])
        ax2 = ax1 + max(0.0, float(bbox_a[2]))
        ay2 = ay1 + max(0.0, float(bbox_a[3]))

        bx1 = float(bbox_b[0])
        by1 = float(bbox_b[1])
        bx2 = bx1 + max(0.0, float(bbox_b[2]))
        by2 = by1 + max(0.0, float(bbox_b[3]))

        inter_x1 = max(ax1, bx1)
        inter_y1 = max(ay1, by1)
        inter_x2 = min(ax2, bx2)
        inter_y2 = min(ay2, by2)

        inter_w = max(0.0, inter_x2 - inter_x1)
        inter_h = max(0.0, inter_y2 - inter_y1)
        inter_area = inter_w * inter_h

        area_a = max(0.0, (ax2 - ax1)) * max(0.0, (ay2 - ay1))
        area_b = max(0.0, (bx2 - bx1)) * max(0.0, (by2 - by1))
        union_area = area_a + area_b - inter_area

        if union_area <= 0:
            return 0.0

        return inter_area / union_area
    
    def _classify_density(self, vehicle_count: int) -> str:
        """
        Classify traffic density based on vehicle count.
        Uses Indian road traffic thresholds.
        
        Academic Rationale:
        - LOW (< 10): Light traffic, free-flowing, no congestion
        - MEDIUM (10-25): Moderate traffic, some delays expected
        - HIGH (25+): Heavy traffic, significant congestion, signal optimization needed
        
        Args:
            vehicle_count: Total unique vehicles on road
        
        Returns:
            "LOW" | "MEDIUM" | "HIGH"
        """
        for density_level, (min_vehicles, max_vehicles) in self.DENSITY_THRESHOLDS.items():
            if min_vehicles <= vehicle_count < max_vehicles:
                return density_level
        
        return "HIGH"  # Default to HIGH if exceeds all thresholds
    
    def _empty_result(self, road_id: str) -> Dict[str, Any]:
        """Return empty analysis result when no frames available."""
        return {
            "road_id": road_id,
            "total_vehicles": 0,
            "vehicle_type_distribution": {
                "car": 0,
                "bike": 0,
                "auto": 0,
                "bus": 0,
                "truck": 0,
                "cycle": 0
            },
            "traffic_density": "LOW",
            "density_score": 0.0,
            "average_dwell_time_seconds": 0.0,
            "average_observed_dwell_time_seconds": 0.0,
            "average_complete_dwell_time_seconds": 0.0,
            "complete_track_count": 0,
            "dwell_time_reliability": "LOW",
            "peak_vehicles_in_frame": 0,
            "frames_analyzed": 0,
            "tracking_enabled": False,
            "error": "No frames to analyze"
        }
