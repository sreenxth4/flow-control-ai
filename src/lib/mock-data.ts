import type { MapData, JunctionDetail, PerformanceData, HealthStatus, DensityLevel, NetworkStatus, RouteResult, VehicleDistribution } from "./types";

const densities: DensityLevel[] = ["LOW", "MEDIUM", "HIGH"];

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

// Kukatpally Zone Junctions (10 Total)
export const mockJunctions = [
  { id: "J1", name: "Kukatpally Y Junction", type: "signalized", lat: 17.4947, lng: 78.3872 },
  { id: "J2", name: "KPHB Colony Signal", type: "signalized", lat: 17.4935, lng: 78.3920 },
  { id: "J3", name: "JNTU Gate Junction", type: "signalized", lat: 17.4898, lng: 78.3905 },
  { id: "J4", name: "Kukatpally Bus Depot", type: "signalized", lat: 17.4962, lng: 78.3838 },
  { id: "J5", name: "Balanagar X Roads", type: "signalized", lat: 17.4855, lng: 78.3830 },
  { id: "J6", name: "Allwyn X Roads", type: "signalized", lat: 17.4978, lng: 78.3898 },
  { id: "J7", name: "Moosapet X Roads", type: "signalized", lat: 17.4885, lng: 78.3785 },
  { id: "J8", name: "Petbasheerabad Junction", type: "signalized", lat: 17.5018, lng: 78.3868 },
  { id: "J9", name: "Pragathi Nagar Junction", type: "signalized", lat: 17.4990, lng: 78.3935 },
  { id: "J10", name: "Bachupally Junction", type: "signalized", lat: 17.5042, lng: 78.3832 },
];

// Kukatpally Zone Roads (34 Directed Roads)
export const mockRoads = [
  // Major Corridors (50 km/h, 3 lanes)
  { id: "R11", name: "KPHB Main Road East", from_junction: "J1", to_junction: "J2", lanes: 3, speed_limit: 50, length_km: 0.55 },
  { id: "R12", name: "KPHB Main Road West", from_junction: "J2", to_junction: "J1", lanes: 3, speed_limit: 50, length_km: 0.55 },
  { id: "R13", name: "NH65 South", from_junction: "J1", to_junction: "J3", lanes: 3, speed_limit: 50, length_km: 0.70 },
  { id: "R31", name: "NH65 North", from_junction: "J3", to_junction: "J1", lanes: 3, speed_limit: 50, length_km: 0.70 },
  { id: "R610", name: "Bachupally Road North", from_junction: "J6", to_junction: "J10", lanes: 3, speed_limit: 50, length_km: 0.85 },
  { id: "R106", name: "Bachupally Road South", from_junction: "J10", to_junction: "J6", lanes: 3, speed_limit: 50, length_km: 0.85 },
  { id: "R710", name: "Outer Ring Road East", from_junction: "J7", to_junction: "J10", lanes: 3, speed_limit: 50, length_km: 1.70 },
  { id: "R107", name: "Outer Ring Road West", from_junction: "J10", to_junction: "J7", lanes: 3, speed_limit: 50, length_km: 1.70 },

  // Local Roads (40 km/h, 2 lanes)
  { id: "R14", name: "Kukatpally Main Road", from_junction: "J1", to_junction: "J4", lanes: 2, speed_limit: 40, length_km: 0.48 },
  { id: "R23", name: "KPHB-JNTU Connector East", from_junction: "J2", to_junction: "J3", lanes: 2, speed_limit: 40, length_km: 0.45 },
  { id: "R32", name: "KPHB-JNTU Connector West", from_junction: "J3", to_junction: "J2", lanes: 2, speed_limit: 40, length_km: 0.45 },
  { id: "R25", name: "Balanagar Road South", from_junction: "J2", to_junction: "J5", lanes: 2, speed_limit: 40, length_km: 1.40 },
  { id: "R52", name: "Balanagar Road North", from_junction: "J5", to_junction: "J2", lanes: 2, speed_limit: 40, length_km: 1.40 },
  { id: "R26", name: "Allwyn Colony Road North", from_junction: "J2", to_junction: "J6", lanes: 2, speed_limit: 40, length_km: 0.58 },
  { id: "R62", name: "Allwyn Colony Road South", from_junction: "J6", to_junction: "J2", lanes: 2, speed_limit: 40, length_km: 0.58 },
  { id: "R35", name: "JNTU-Balanagar Road South", from_junction: "J3", to_junction: "J5", lanes: 2, speed_limit: 40, length_km: 1.10 },
  { id: "R53", name: "JNTU-Balanagar Road North", from_junction: "J5", to_junction: "J3", lanes: 2, speed_limit: 40, length_km: 1.10 },
  { id: "R38", name: "Pragathi Nagar Road North", from_junction: "J3", to_junction: "J8", lanes: 2, speed_limit: 40, length_km: 1.50 },
  { id: "R42", name: "NH65 via Bus Depot", from_junction: "J4", to_junction: "J2", lanes: 2, speed_limit: 40, length_km: 1.00 },
  { id: "R45", name: "Industrial Corridor East", from_junction: "J4", to_junction: "J5", lanes: 2, speed_limit: 40, length_km: 1.30 },
  { id: "R54", name: "Industrial Corridor West", from_junction: "J5", to_junction: "J4", lanes: 2, speed_limit: 40, length_km: 1.30 },
  { id: "R46", name: "Allwyn Connector North", from_junction: "J4", to_junction: "J6", lanes: 2, speed_limit: 40, length_km: 0.55 },
  { id: "R64", name: "Allwyn Connector South", from_junction: "J6", to_junction: "J4", lanes: 2, speed_limit: 40, length_km: 0.55 },
  { id: "R49", name: "Depot-Pragathi Nagar Road", from_junction: "J4", to_junction: "J9", lanes: 2, speed_limit: 40, length_km: 0.95 },
  { id: "R57", name: "Balanagar-Moosapet Link East", from_junction: "J5", to_junction: "J7", lanes: 2, speed_limit: 40, length_km: 0.60 },
  { id: "R75", name: "Balanagar-Moosapet Link West", from_junction: "J7", to_junction: "J5", lanes: 2, speed_limit: 40, length_km: 0.60 },
  { id: "R58", name: "Balanagar North Road", from_junction: "J5", to_junction: "J8", lanes: 2, speed_limit: 40, length_km: 1.80 },
  { id: "R72", name: "Moosapet-KPHB Road", from_junction: "J7", to_junction: "J2", lanes: 2, speed_limit: 40, length_km: 1.50 },
  { id: "R83", name: "Petbasheerabad-Balanagar Road", from_junction: "J8", to_junction: "J5", lanes: 2, speed_limit: 40, length_km: 1.50 },
  { id: "R85", name: "Petbasheerabad-JNTU Road", from_junction: "J8", to_junction: "J3", lanes: 2, speed_limit: 40, length_km: 1.80 },
  { id: "R89", name: "Pragathi Nagar South East", from_junction: "J8", to_junction: "J9", lanes: 2, speed_limit: 40, length_km: 0.70 },
  { id: "R98", name: "Pragathi Nagar South West", from_junction: "J9", to_junction: "J8", lanes: 2, speed_limit: 40, length_km: 0.70 },
  { id: "R93", name: "Pragathi Nagar-JNTU Road", from_junction: "J9", to_junction: "J3", lanes: 2, speed_limit: 40, length_km: 1.20 },
  { id: "R94", name: "Pragathi Nagar-Depot Road", from_junction: "J9", to_junction: "J4", lanes: 2, speed_limit: 40, length_km: 0.95 },
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
    region_name: "Kukatpally Traffic Zone",
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
      num_roads: 34,
      junction_costs: mockJunctions.map((j) => ({
        junction_id: j.id,
        traffic_delay: Math.round((5 + Math.random() * 20) * 10) / 10,
        signal_wait: Math.round((3 + Math.random() * 15) * 10) / 10,
      })),
      last_update: new Date().toISOString(),
    },
  };
}

// Adjacency based on Kukatpally Zone roads
const adjacency: Record<string, string[]> = {
  J1: ["J2", "J3", "J4"],           // KPHB Main, NH65, Kukatpally Main
  J2: ["J1", "J3", "J5", "J6", "J7"], // Reverse + Balanagar, Allwyn, Moosapet
  J3: ["J1", "J2", "J5", "J8"],     // NH65, KPHB-JNTU, Balanagar, Pragathi
  J4: ["J2", "J5", "J6", "J9"],     // Bus Depot, Industrial, Allwyn, Pragathi
  J5: ["J2", "J3", "J4", "J7", "J8"], // All connections
  J6: ["J2", "J4", "J10"],          // Allwyn, Connector, Bachupally
  J7: ["J2", "J5", "J10"],          // Moosapet, Balanagar, ORR
  J8: ["J3", "J5", "J9", "J10"],    // Petbasheerabad connections
  J9: ["J4", "J8", "J3"],           // Pragathi Nagar hub
  J10: ["J6", "J7", "J8"],          // Bachupally terminus
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
    // Cost = travel time in seconds (distance/speed * 3600)
    const cost = road ? (road.length_km / road.speed_limit) * 3600 : 30;
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
