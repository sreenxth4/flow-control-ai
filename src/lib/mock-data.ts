import type { MapData, JunctionDetail, PerformanceData, HealthStatus, DensityLevel, NetworkStatus, RouteResult, VehicleDistribution } from "./types";

const densities: DensityLevel[] = ["LOW", "MEDIUM", "HIGH"];
const randomDensity = (): DensityLevel => densities[Math.floor(Math.random() * 3)];

// PCU weights (Indian Roads Congress)
const PCU_WEIGHTS = { car: 1.0, bike: 0.5, auto: 1.0, bus: 3.0, truck: 3.0, cycle: 0.3 };

function computePCU(v: VehicleDistribution): number {
  return Math.round((v.car * PCU_WEIGHTS.car + v.bike * PCU_WEIGHTS.bike + v.auto * PCU_WEIGHTS.auto + v.bus * PCU_WEIGHTS.bus + v.truck * PCU_WEIGHTS.truck + v.cycle * PCU_WEIGHTS.cycle) * 10) / 10;
}

function computeVehicleCount(v: VehicleDistribution): number {
  return v.car + v.bike + v.auto + v.bus + v.truck + v.cycle;
}

// Fixed mock traffic data per junction
const junctionTrafficData: Record<string, { density: DensityLevel; vehicles: VehicleDistribution }> = {
  J1:  { density: "MEDIUM", vehicles: { car: 5, bike: 10, auto: 2, bus: 1, truck: 0, cycle: 0 } },
  J2:  { density: "LOW",    vehicles: { car: 4, bike: 3, auto: 1, bus: 0, truck: 0, cycle: 3 } },
  J3:  { density: "HIGH",   vehicles: { car: 8, bike: 6, auto: 3, bus: 3, truck: 4, cycle: 0 } },
  J4:  { density: "MEDIUM", vehicles: { car: 6, bike: 8, auto: 2, bus: 2, truck: 0, cycle: 1 } },
  J5:  { density: "HIGH",   vehicles: { car: 10, bike: 12, auto: 4, bus: 2, truck: 3, cycle: 2 } },
  J6:  { density: "LOW",    vehicles: { car: 3, bike: 5, auto: 0, bus: 0, truck: 0, cycle: 2 } },
  J7:  { density: "MEDIUM", vehicles: { car: 7, bike: 9, auto: 3, bus: 1, truck: 1, cycle: 0 } },
  J8:  { density: "LOW",    vehicles: { car: 2, bike: 4, auto: 1, bus: 0, truck: 0, cycle: 5 } },
  J9:  { density: "HIGH",   vehicles: { car: 9, bike: 5, auto: 2, bus: 4, truck: 3, cycle: 1 } },
  J10: { density: "MEDIUM", vehicles: { car: 6, bike: 7, auto: 2, bus: 1, truck: 1, cycle: 2 } },
};

export const mockJunctions = [
  { id: "J1", name: "JNTU Main Gate", type: "intersection", lat: 17.4922, lng: 78.3955 },
  { id: "J2", name: "GHMC Park Signal", type: "intersection", lat: 17.4920, lng: 78.3988 },
  { id: "J3", name: "HMT Hills Junction", type: "intersection", lat: 17.4948, lng: 78.3958 },
  { id: "J4", name: "Road No 1 Circle", type: "intersection", lat: 17.4946, lng: 78.3990 },
  { id: "J5", name: "Kukatpally Y Junction", type: "intersection", lat: 17.4963, lng: 78.3951 },
  { id: "J6", name: "Apollo Pharmacy Jn", type: "intersection", lat: 17.4918, lng: 78.4018 },
  { id: "J7", name: "KPHB Bus Stop", type: "intersection", lat: 17.4945, lng: 78.4022 },
  { id: "J8", name: "Sathavahana Nagar Gate", type: "intersection", lat: 17.4968, lng: 78.3992 },
  { id: "J9", name: "NTR Nagar Junction", type: "intersection", lat: 17.4950, lng: 78.4052 },
  { id: "J10", name: "Allwyn Colony X Roads", type: "intersection", lat: 17.4966, lng: 78.4025 },
];

export const mockRoads = [
  // === East-West roads (following KPHB colony cross-streets) ===
  // South row: J1 — J2 — J6
  { id: "R1", name: "Malaysian Twp Rd E", from_junction: "J1", to_junction: "J2", lanes: 3, speed_limit: 40, length_km: 0.36 },
  { id: "R2", name: "Malaysian Twp Rd W", from_junction: "J2", to_junction: "J1", lanes: 3, speed_limit: 40, length_km: 0.36 },
  { id: "R3", name: "Road No 5 E", from_junction: "J2", to_junction: "J6", lanes: 2, speed_limit: 30, length_km: 0.33 },
  { id: "R4", name: "Road No 5 W", from_junction: "J6", to_junction: "J2", lanes: 2, speed_limit: 30, length_km: 0.33 },
  // Middle row: J3 — J4 — J7 — J9
  { id: "R5", name: "Road No 1 E", from_junction: "J3", to_junction: "J4", lanes: 3, speed_limit: 40, length_km: 0.35 },
  { id: "R6", name: "Road No 1 W", from_junction: "J4", to_junction: "J3", lanes: 3, speed_limit: 40, length_km: 0.35 },
  { id: "R7", name: "HMT Rd E", from_junction: "J4", to_junction: "J7", lanes: 2, speed_limit: 30, length_km: 0.35 },
  { id: "R8", name: "HMT Rd W", from_junction: "J7", to_junction: "J4", lanes: 2, speed_limit: 30, length_km: 0.35 },
  { id: "R9", name: "NTR Nagar Rd E", from_junction: "J7", to_junction: "J9", lanes: 2, speed_limit: 30, length_km: 0.33 },
  { id: "R10", name: "NTR Nagar Rd W", from_junction: "J9", to_junction: "J7", lanes: 2, speed_limit: 30, length_km: 0.33 },
  // North row: J5 — J8 — J10
  { id: "R11", name: "KPHB Main Rd E", from_junction: "J5", to_junction: "J8", lanes: 4, speed_limit: 50, length_km: 0.45 },
  { id: "R12", name: "KPHB Main Rd W", from_junction: "J8", to_junction: "J5", lanes: 4, speed_limit: 50, length_km: 0.45 },
  { id: "R13", name: "Sathavahana Rd E", from_junction: "J8", to_junction: "J10", lanes: 3, speed_limit: 40, length_km: 0.36 },
  { id: "R14", name: "Sathavahana Rd W", from_junction: "J10", to_junction: "J8", lanes: 3, speed_limit: 40, length_km: 0.36 },
  // === North-South roads (following KPHB colony main roads) ===
  // West column: J1 — J3 — J5
  { id: "R15", name: "JNTU-HMT Hills Rd N", from_junction: "J1", to_junction: "J3", lanes: 2, speed_limit: 30, length_km: 0.29 },
  { id: "R16", name: "HMT Hills-JNTU Rd S", from_junction: "J3", to_junction: "J1", lanes: 2, speed_limit: 30, length_km: 0.29 },
  { id: "R17", name: "HMT Hills-Y Jn Rd N", from_junction: "J3", to_junction: "J5", lanes: 3, speed_limit: 40, length_km: 0.17 },
  { id: "R18", name: "Y Jn-HMT Hills Rd S", from_junction: "J5", to_junction: "J3", lanes: 3, speed_limit: 40, length_km: 0.17 },
  // Center column: J2 — J4 — J8
  { id: "R19", name: "Road No 2 N", from_junction: "J2", to_junction: "J4", lanes: 2, speed_limit: 30, length_km: 0.29 },
  { id: "R20", name: "Road No 2 S", from_junction: "J4", to_junction: "J2", lanes: 2, speed_limit: 30, length_km: 0.29 },
  { id: "R21", name: "Road No 2 Upper N", from_junction: "J4", to_junction: "J8", lanes: 2, speed_limit: 30, length_km: 0.24 },
  { id: "R22", name: "Road No 2 Upper S", from_junction: "J8", to_junction: "J4", lanes: 2, speed_limit: 30, length_km: 0.24 },
  // East column: J6 — J7 — J10
  { id: "R23", name: "Pragathi Rd N", from_junction: "J6", to_junction: "J7", lanes: 2, speed_limit: 30, length_km: 0.30 },
  { id: "R24", name: "Pragathi Rd S", from_junction: "J7", to_junction: "J6", lanes: 2, speed_limit: 30, length_km: 0.30 },
  { id: "R25", name: "Allwyn Access Rd N", from_junction: "J7", to_junction: "J10", lanes: 2, speed_limit: 30, length_km: 0.23 },
  { id: "R26", name: "Allwyn Access Rd S", from_junction: "J10", to_junction: "J7", lanes: 2, speed_limit: 30, length_km: 0.23 },
  // === Diagonal / connector roads ===
  { id: "R27", name: "JNTU Flyover Rd NE", from_junction: "J1", to_junction: "J4", lanes: 3, speed_limit: 40, length_km: 0.46 },
  { id: "R28", name: "JNTU Flyover Rd SW", from_junction: "J4", to_junction: "J1", lanes: 3, speed_limit: 40, length_km: 0.46 },
  { id: "R29", name: "Colony Diagonal NE", from_junction: "J4", to_junction: "J10", lanes: 2, speed_limit: 30, length_km: 0.42 },
  { id: "R30", name: "Colony Diagonal SW", from_junction: "J10", to_junction: "J4", lanes: 2, speed_limit: 30, length_km: 0.42 },
  { id: "R31", name: "High Tension Line Rd E", from_junction: "J5", to_junction: "J10", lanes: 2, speed_limit: 30, length_km: 0.81 },
  { id: "R32", name: "High Tension Line Rd W", from_junction: "J10", to_junction: "J5", lanes: 2, speed_limit: 30, length_km: 0.81 },
  // One-way service road
  { id: "R33", name: "Metro Service Rd", from_junction: "J9", to_junction: "J10", lanes: 2, speed_limit: 25, length_km: 0.33 },
];

export const mockSignalPhases: MapData["signal_phases"] = mockJunctions.flatMap((j) => [
  {
    junction_id: j.id,
    phase_name: `${j.name} Phase A`,
    green_roads: mockRoads.filter((r) => r.from_junction === j.id).slice(0, 2).map((r) => r.id),
    min_green: 15,
    max_green: 45,
  },
  {
    junction_id: j.id,
    phase_name: `${j.name} Phase B`,
    green_roads: mockRoads.filter((r) => r.from_junction === j.id).slice(2, 4).map((r) => r.id),
    min_green: 10,
    max_green: 35,
  },
]);

export function getMockMapData(): MapData {
  return {
    region_name: "Kukatpally Traffic Region",
    junctions: mockJunctions.map((j) => {
      const td = junctionTrafficData[j.id];
      return {
        ...j,
        density: td.density,
        vehicle_count: computeVehicleCount(td.vehicles),
        total_pcu: computePCU(td.vehicles),
        vehicle_type_distribution: td.vehicles,
      };
    }),
    roads: mockRoads,
    signal_phases: mockSignalPhases,
  };
}

export function getMockJunctionDetail(id: string): JunctionDetail | null {
  const junction = mockJunctions.find((j) => j.id === id);
  if (!junction) return null;
  const td = junctionTrafficData[id];
  return {
    junction: {
      ...junction,
      density: td.density,
      vehicle_count: computeVehicleCount(td.vehicles),
      total_pcu: computePCU(td.vehicles),
      vehicle_type_distribution: td.vehicles,
    },
    incoming_roads: mockRoads.filter((r) => r.to_junction === id),
    outgoing_roads: mockRoads.filter((r) => r.from_junction === id),
    signal_phases: mockSignalPhases.filter((s) => s.junction_id === id),
  };
}

export function getMockPerformance(): PerformanceData {
  return {
    summary: { total_frames: 1200, average_fps: 4.8, total_time: 250 },
    performance_profile: { detect_time: 120, track_time: 65, analyze_time: 45, total_time: 250 },
  };
}

export function getMockHealth(): HealthStatus {
  return { status: "healthy", phase: "operational", detector: "YOLOv9", model: "yolov9-c", video_support: true };
}

export function getMockNetworkStatus(): NetworkStatus {
  return {
    network: {
      num_junctions: 10,
      num_roads: 33,
      junction_costs: mockJunctions.map((j, i) => ({
        junction_id: j.id,
        traffic_delay: Math.round((5 + Math.random() * 20) * 10) / 10,
        signal_wait: Math.round((3 + Math.random() * 15) * 10) / 10,
      })),
      last_update: new Date().toISOString(),
    },
  };
}

// Simple path finding for mock - using adjacency
const adjacency: Record<string, string[]> = {
  J1: ["J2", "J3", "J4"],
  J2: ["J1", "J4", "J6"],
  J3: ["J1", "J4", "J5"],
  J4: ["J1", "J2", "J3", "J7", "J8", "J10"],
  J5: ["J3", "J8", "J10"],
  J6: ["J2", "J7"],
  J7: ["J4", "J6", "J9", "J10"],
  J8: ["J4", "J5", "J10"],
  J9: ["J7", "J10"],
  J10: ["J4", "J5", "J7", "J8", "J9"],
};

function bfs(start: string, end: string): string[] | null {
  const queue: string[][] = [[start]];
  const visited = new Set<string>([start]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    if (node === end) return path;
    for (const neighbor of adjacency[node] || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
}

export function getMockRoute(sourceIdx: number, destIdx: number): RouteResult {
  const sourceId = `J${sourceIdx + 1}`;
  const destId = `J${destIdx + 1}`;
  const path = bfs(sourceId, destId);
  
  if (!path) {
    return { success: false, path: [], segments: [], total_cost: 0, num_junctions: 0 };
  }

  const segments = [];
  let totalCost = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const road = mockRoads.find((r) => r.from_junction === path[i] && r.to_junction === path[i + 1]);
    const cost = road ? road.length_km * 10 + (60 / road.speed_limit) * 5 : 5;
    totalCost += cost;
    segments.push({
      from_junction: path[i],
      to_junction: path[i + 1],
      road_name: road?.name || "Unknown Road",
      cost: Math.round(cost * 10) / 10,
    });
  }

  return {
    success: true,
    path,
    segments,
    total_cost: Math.round(totalCost * 10) / 10,
    num_junctions: path.length,
  };
}
