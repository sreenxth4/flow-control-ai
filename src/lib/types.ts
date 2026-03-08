export type DensityLevel = "LOW" | "MEDIUM" | "HIGH";

export interface Junction {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  density?: DensityLevel;
}

export interface Road {
  id: string;
  name: string;
  from_junction: string;
  to_junction: string;
  lanes: number;
  speed_limit: number;
  length_km: number;
}

export interface SignalPhase {
  junction_id: string;
  phase_name: string;
  green_roads: string[];
  min_green: number;
  max_green: number;
}

export interface MapData {
  region_name: string;
  junctions: Junction[];
  roads: Road[];
  signal_phases: SignalPhase[];
}

export interface JunctionDetail {
  junction: Junction;
  incoming_roads: Road[];
  outgoing_roads: Road[];
  signal_phases: SignalPhase[];
}

export interface DetectionResult {
  source_id: string;
  total_frames_processed: number;
  processing_time_seconds: number;
  average_processing_fps: number;
  detections_per_frame: { frame: number; vehicle_count: number; vehicles: Record<string, number> }[];
  performance_profile: {
    detect_time: number;
    track_time: number;
    analyze_time: number;
    total_time: number;
  };
}

export interface PerformanceData {
  summary: {
    total_frames: number;
    average_fps: number;
    total_time: number;
  };
  performance_profile: {
    detect_time: number;
    track_time: number;
    analyze_time: number;
    total_time: number;
  };
}

export interface HealthStatus {
  status: string;
  phase: string;
  detector: string;
  model: string;
  video_support: boolean;
}
