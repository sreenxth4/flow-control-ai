"""Video processing module for Phase 4-5: Video frame extraction, detection, tracking, and density analysis.

Phase 3.7: Extracts frames from video files and runs detection on each frame.
Phase 4:   Adds vehicle tracking to maintain consistent IDs across frames using DeepSORT.
Phase 5:   Analyzes road-level traffic density metrics from tracked vehicles.
Phase 6:   Detection stride optimization — run YOLO every Nth frame, tracker predicts on others.

Works with any detector implementation (Dummy or YOLOv9).
Integrates DeepSORT tracker for multi-object tracking.
Integrates density analyzer for road-level traffic metrics.
"""
import gc
import cv2
import time
from typing import Dict, Any, List, Optional
from detector.base import Detector
from modules.tracker import VehicleTracker
from modules.density_analyzer import RoadDensityAnalyzer


class VideoProcessor:
    """Process video files frame-by-frame for vehicle detection, tracking, and density analysis."""
    
    def __init__(self, detector: Detector, enable_tracking: bool = True, tracker_use_appearance: bool = False):
        """
        Initialize video processor with detector, tracker, and density analyzer.
        
        Args:
            detector: Detector instance (YoloV9Detector or DummyDetector)
                     Model is already loaded, will be reused for all frames
            enable_tracking: If True, enables DeepSORT vehicle tracking (Phase 4)
            tracker_use_appearance: If True, enables DeepSORT appearance embeddings (slower)
        """
        self.detector = detector
        self.enable_tracking = enable_tracking
        self.tracker = VehicleTracker(use_appearance=tracker_use_appearance) if enable_tracking else None
        self.density_analyzer = RoadDensityAnalyzer()  # Phase 5: Density analysis
    
    def process_video(
        self,
        video_path: str,
        source_id: str,
        target_fps: float = 10.0,
        max_frames: Optional[int] = None,
        detection_stride: object = "auto"
    ) -> Dict[str, Any]:
        """
        Process video file frame-by-frame with vehicle detection and tracking.
        
        Phase 3.7: Detection using YOLOv9
        Phase 4:   Tracking using DeepSORT to maintain vehicle IDs
        Phase 6:   Auto-stride — YOLO frequency controlled by target_fps,
                   tracker always sees every frame for accurate counting.
        
        Args:
            video_path: Path to video file (.mp4, .avi, .mov, etc.)
            source_id: Camera/source identifier
            target_fps: Controls how many YOLO detections run per second of video.
                       Default 10fps — proven optimal for accuracy/performance balance.
                       Example: target_fps=10 on a 30fps video → stride=3 → 10 YOLO runs/sec.
                       Tracker always processes every frame regardless.
            max_frames: Maximum frames to process (None = entire video)
            detection_stride: "auto" (default) = compute from target_fps.
                             Integer = fixed stride (1 = detect every frame).
            
        Returns:
            Summary dict with detection, tracking, and density analysis results.
        """
        # Open video file
        video = cv2.VideoCapture(video_path)
        
        if not video.isOpened():
            return {
                "error": f"Failed to open video: {video_path}",
                "source_id": source_id
            }
        
        try:  # ← Ensure video.release() is ALWAYS called
            # Get video properties
            video_fps = video.get(cv2.CAP_PROP_FPS)
            total_video_frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
            video_duration = total_video_frames / video_fps if video_fps > 0 else 0
            
            # ── LOCK 10 FPS: Calculate frame skip interval ──
            # Read only 1 out of every N frames where N = video_fps / target_fps
            # Example: 30fps video, 10fps target → N = 3 → read frames 0, 3, 6, 9...
            # Analyzer must use the normalized processing FPS, not native source FPS.
            analyzed_fps = target_fps
            frame_skip = max(1, int(video_fps / target_fps)) if video_fps > 0 else 1
            
            # Ceil division so 61 @ skip=3 reports 21 frames (0,3,6,...,60).
            expected_frames = max(1, (total_video_frames + frame_skip - 1) // frame_skip)
            print(f"[Video] LOCKED {target_fps:.1f}fps | "
                f"Processing stream: {expected_frames} frames @ {target_fps:.1f}FPS | "
                  f"Tracking: {'ON' if self.enable_tracking else 'OFF'}")
            
            # Reset tracker for new video to prevent track ID carryover
            if self.enable_tracking and self.tracker:
                self.tracker.reset()
            
            # Process video frames
            all_frames_for_analyzer = []    # Lightweight: frame_number, timestamp, tracks
            sampled_detections = []         # Full: detections + tracks (for API output)
            frame_count = 0
            processed_count = 0
            detection_count = 0             # Frames that ran detection
            start_time = time.time()
            last_detection_result = None
            detect_time_total = 0.0
            track_time_total = 0.0
            
            while True:
                ret, frame = video.read()
                
                if not ret:
                    break  # End of video
                
                # ── LOCK 10 FPS: Skip frames at source level ──
                # If we're targeting 10fps on a 30fps video, skip 2 out of 3 frames
                # This ensures we ONLY READ the frames we need (not all 61)
                if frame_count % frame_skip != 0:
                    frame_count += 1
                    continue  # Skip this frame completely - don't even process it
                
                # Check max frames limit
                if max_frames and processed_count >= max_frames:
                    print(f"Reached max_frames limit: {max_frames}")
                    break
                
                # Now process this frame (which we've already filtered to 10fps cadence)
                frame_timestamp = frame_count / video_fps if video_fps > 0 else processed_count
                
                # Run detection on every frame at target_fps (no further stride needed)
                # since we've already subsampled at capture level
                detect_start = time.time()
                detection_result = self.detector.detect(
                    frame_data=frame,
                    source_id=source_id,
                    timestamp=frame_timestamp
                )
                detect_time_total += (time.time() - detect_start)
                detections = detection_result.get("detections", [])
                detection_count += 1
                
                # === PHASE 4: Vehicle Tracking ===
                # Update tracker on this frame
                tracks = []
                if self.enable_tracking and self.tracker:
                    try:
                        track_start = time.time()
                        tracks = self.tracker.update(
                            detections=detections,
                            frame=frame,  # Original frame for appearance embedding
                            source_id=source_id
                        )
                        track_time_total += (time.time() - track_start)
                    except Exception as e:
                        print(f"Warning: Tracking failed on frame {frame_count}: {e}")
                        # Continue without tracking on this frame
                        tracks = []
                
                # Calculate class counts from detections
                if detections:
                    class_counts = self.detector.get_class_counts(detections)
                else:
                    class_counts = {}
                    for t in tracks:
                        cls = t.get("class", "vehicle")
                        class_counts[cls] = class_counts.get(cls, 0) + 1
                
                # Store metadata for analyzer
                lightweight_metadata = {
                    "frame_number": frame_count,
                    "timestamp": frame_timestamp,
                    "class_counts": class_counts,
                    "total_vehicles": sum(class_counts.values()),
                    "tracking_enabled": self.enable_tracking,
                    "tracks": tracks  # Phase 4: Add tracking data
                }
                all_frames_for_analyzer.append(lightweight_metadata)
                
                # Full metadata for API output
                full_metadata = {
                    "frame_number": frame_count,
                    "timestamp": frame_timestamp,
                    "detections": detections,
                    "class_counts": class_counts,
                    "total_vehicles": sum(class_counts.values()),
                    "tracking_enabled": self.enable_tracking,
                    "tracks": tracks
                }
                sampled_detections.append(full_metadata)
                last_detection_result = full_metadata
                processed_count += 1
                
                # Progress logging (every 5 frames)
                if processed_count % 5 == 0:
                    elapsed = time.time() - start_time
                    fps = processed_count / elapsed if elapsed > 0 else 0
                    print(f"[Progress] {processed_count} frames @ 10fps | {frame_timestamp:.1f}s | {fps:.2f} FPS")
                
                frame_count += 1
            
            # Calculate final statistics
            end_time = time.time()
            processing_time = end_time - start_time
            avg_processing_fps = processed_count / processing_time if processing_time > 0 else 0
            
            print(f"[Done] {processing_time:.2f}s processing | {avg_processing_fps:.2f} FPS | "
                  f"Frames: {len(all_frames_for_analyzer)} processed @ 10fps | "
                  f"Detections: {detection_count} (all frames, no stride)")
            
            # Phase 5: Analyze road-level traffic density
            # CRITICAL: Pass ALL processed frames to analyzer (lightweight metadata only)
            # This ensures accurate vehicle count regardless of output_frame_interval
            analyze_start = time.time()
            road_density = self.density_analyzer.analyze(
                detections_per_frame=all_frames_for_analyzer,  # ALL frames (lightweight, for analyzer)
                road_id=source_id,
                analyzed_fps=analyzed_fps
            )
            analyze_time_total = time.time() - analyze_start

            other_time_total = max(0.0, processing_time - detect_time_total - track_time_total - analyze_time_total)
            processed_frames = max(1, len(all_frames_for_analyzer))
            detection_frames = max(1, detection_count)

            performance_profile = {
                "total_seconds": round(processing_time, 2),
                "detect_seconds": round(detect_time_total, 2),
                "track_seconds": round(track_time_total, 2),
                "analyze_seconds": round(analyze_time_total, 2),
                "other_seconds": round(other_time_total, 2),
                "detect_ms_per_frame": round((detect_time_total / detection_frames) * 1000.0, 2),
                "track_ms_per_frame": round((track_time_total / processed_frames) * 1000.0, 2),
                "frames_profiled": int(processed_frames),
            "detection_frames": detection_count,
                "target_fps": target_fps,
                "frame_skip": frame_skip
            }

            print(
                f"[Profile] total={performance_profile['total_seconds']}s "
                f"detect={performance_profile['detect_seconds']}s "
                f"track={performance_profile['track_seconds']}s "
                f"analyze={performance_profile['analyze_seconds']}s "
                f"other={performance_profile['other_seconds']}s "
                f"detect_ms/frame={performance_profile['detect_ms_per_frame']} "
                f"track_ms/frame={performance_profile['track_ms_per_frame']}"
            )
            
            return {
                "source_id": source_id,
                "video_path": video_path,
                "total_frames_in_video": processed_count,
                "total_frames_processed": processed_count,  # Frames at 10fps target
                "video_fps": target_fps,
                "video_duration_seconds": video_duration,
                "processing_time_seconds": round(processing_time, 2),
                "average_processing_fps": round(avg_processing_fps, 2),
                "target_fps": target_fps,
                "frame_skip": frame_skip,
                "tracking_enabled": self.enable_tracking,  # Phase 4
                "performance_profile": performance_profile,
                "detections_per_frame": sampled_detections,  # All frames at 10fps
                "last_frame_sample": last_detection_result,
                "road_density_analysis": road_density,  # Phase 5: Road-level density metrics
                "note": f"Processed {processed_count} frames @ 10fps | Density analysis from {len(all_frames_for_analyzer)} frames"
            }
        finally:
            # Always release video file handle to prevent Windows file locking issues
            video.release()
            # Force garbage collection to free memory and release OS file locks
            gc.collect()
    
    def process_video_file_upload(
        self,
        video_bytes: bytes,
        source_id: str,
        filename: str = "uploaded_video.mp4",
        target_fps: float = 10.0,
        max_frames: Optional[int] = None,
        detection_stride: object = "auto"
    ) -> Dict[str, Any]:
        """
        Process uploaded video file from memory.
        
        Args:
            video_bytes: Raw video file bytes
            source_id: Camera/source identifier
            filename: Original filename (for logging)
            target_fps: Controls YOLO frequency (frames per second of video)
            max_frames: Maximum frames to process
            detection_stride: "auto" (default) or integer
            
        Returns:
            Same summary dict as process_video()
        """
        import tempfile
        import os
        
        # Write bytes to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp_file:
            tmp_file.write(video_bytes)
            tmp_path = tmp_file.name
        
        try:
            result = self.process_video(
                video_path=tmp_path,
                source_id=source_id,
                target_fps=target_fps,
                max_frames=max_frames,
                detection_stride=detection_stride
            )
            result["original_filename"] = filename
            return result
        finally:
            # Cleanup temporary file with retries (handles Windows file locking)
            if os.path.exists(tmp_path):
                gc.collect()  # Force garbage collection before deleting
                import time as time_module
                for attempt in range(3):  # Retry up to 3 times
                    try:
                        os.remove(tmp_path)
                        break
                    except OSError as e:
                        if attempt < 2:
                            time_module.sleep(0.1)  # Wait 100ms before retry
                        else:
                            # Last resort: don't crash if file can't be deleted
                            pass
