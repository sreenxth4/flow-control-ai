"""FrameStore: simple in-memory queue for ingested frames (Phase 2 stub)."""
from typing import List, Dict, Any, Optional
import time
import itertools


class FrameStore:
    def __init__(self, max_frames: int = 50):
        self.max_frames = max_frames
        self._frames: List[Dict[str, Any]] = []
        self._frame_data: Dict[int, bytes] = {}  # Store actual frame bytes
        self._id_counter = itertools.count(1)

    def add_frame(self, data: bytes, source: str = "upload", source_id: str = "unknown", timestamp: float = None) -> Dict[str, Any]:
        """Store frame metadata and raw image data."""
        ts = timestamp or time.time()
        frame_id = next(self._id_counter)
        metadata = {
            "id": frame_id,
            "source": source,
            "source_id": source_id,
            "received_at": ts,
            "size_bytes": len(data),
            "note": "Frame stored with data for detection"
        }
        self._frames.append(metadata)
        self._frame_data[frame_id] = data  # Store raw bytes for YOLOv9
        
        # Trim old frames
        if len(self._frames) > self.max_frames:
            removed_frame = self._frames.pop(0)
            self._frame_data.pop(removed_frame["id"], None)
        
        return metadata

    def get_frames(self) -> List[Dict[str, Any]]:
        return list(self._frames)

    def get_latest(self) -> Optional[Dict[str, Any]]:
        return self._frames[-1] if self._frames else None

    def get_frame_data(self, frame_id: int) -> Optional[bytes]:
        """Retrieve raw frame bytes by frame ID."""
        return self._frame_data.get(frame_id)

    def clear(self, source_id: Optional[str] = None) -> Dict[str, int]:
        """Clear all frames or those for a specific source_id."""
        if source_id is None:
            removed = len(self._frames)
            self._frames = []
            return {"removed": removed}

        before = len(self._frames)
        self._frames = [f for f in self._frames if f.get("source_id") != source_id]
        removed = before - len(self._frames)
        return {"removed": removed}

    def get_metrics(self) -> Dict[str, Any]:
        """Return last timestamp and approximate FPS per source_id using recent frames."""
        metrics: Dict[str, Dict[str, Any]] = {}
        # Group frames by source_id (from newest to oldest)
        for frame in reversed(self._frames):
            sid = frame.get("source_id", "unknown")
            if sid not in metrics:
                metrics[sid] = {
                    "last_timestamp": frame.get("received_at"),
                    "frame_count": 0,
                    "timestamps": []
                }
            metrics[sid]["frame_count"] += 1
            metrics[sid]["timestamps"].append(frame.get("received_at"))

        # Compute FPS using min/max timestamps for each source
        for sid, data in metrics.items():
            times = data["timestamps"]
            if len(times) >= 2:
                span = max(times) - min(times)
                fps = (len(times) - 1) / span if span > 0 else 0.0
            else:
                fps = 0.0
            data["fps"] = round(fps, 2)
            # Remove raw timestamps to keep payload small
            data.pop("timestamps", None)
        return {"sources": metrics}
