export type DensityLevel = "LOW" | "MEDIUM" | "HIGH";

export interface VehicleDistribution {
  car: number;
  bike: number;
  auto: number;
  bus: number;
  truck: number;
  cycle: number;
}

export interface Junction {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  density?: DensityLevel;
  vehicle_count?: number;
  total_pcu?: number;
  vehicle_type_distribution?: VehicleDistribution;
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

// Signal Optimization
export interface LaneAnalysis {
  approach: string;
  vehicle_count: number;
  density: DensityLevel;
}

export interface SignalOptimizationRequest {
  junction_id: string;
  lane_analysis: LaneAnalysis[];
}

export interface SignalTiming {
  phase: string;
  green_duration: number;
}

export interface SignalOptimizationResult {
  junction_id: string;
  signal_timings: SignalTiming[];
  cycle_time: number;
  density_level: DensityLevel;
  traffic_delay: number;
  signal_wait: number;
}

// Network Status
export interface JunctionCost {
  junction_id: string;
  traffic_delay: number;
  signal_wait: number;
}

export interface NetworkStatus {
  network: {
    num_junctions: number;
    num_roads: number;
    junction_costs: JunctionCost[];
    last_update: string;
  };
}

// Route Finding
export interface RouteRequest {
  source: number;
  destination: number;
}

export interface RouteSegment {
  from_junction: string;
  to_junction: string;
  road_name: string;
  cost: number;
}

export interface CongestedJunction {
  id: string;
  delay: number;
  density: DensityLevel;
}

export interface RouteResult {
  success: boolean;
  path: string[];
  segments: RouteSegment[];
  total_cost: number;
  num_junctions: number;
  congestion_delay?: number;
  congested_junctions?: CongestedJunction[];
  color?: string;
  rank?: number;
}

export interface MultiRouteResult {
  routes: RouteResult[];
}

export interface TurnRestriction {
  junction_id: string;
  from_road: string;
  to_road: string;
  restriction_type: "no_left" | "no_right" | "no_uturn";
}

export interface MapData {
  region_name: string;
  junctions: Junction[];
  roads: Road[];
  signal_phases: SignalPhase[];
  turn_restrictions?: TurnRestriction[];
}
