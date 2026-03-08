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
  { id: "J1", name: "Kukatpally Y Junction", type: "intersection", lat: 17.4947, lng: 78.3996 },
  { id: "J2", name: "KPHB Colony", type: "intersection", lat: 17.4932, lng: 78.3912 },
  { id: "J3", name: "Balanagar Crossroads", type: "intersection", lat: 17.4835, lng: 78.4425 },
  { id: "J4", name: "JNTU Junction", type: "intersection", lat: 17.4965, lng: 78.3875 },
  { id: "J5", name: "Moosapet X Roads", type: "intersection", lat: 17.4685, lng: 78.4275 },
  { id: "J6", name: "Allwyn Colony", type: "intersection", lat: 17.4978, lng: 78.4050 },
  { id: "J7", name: "Hitech City Signal", type: "intersection", lat: 17.4486, lng: 78.3808 },
  { id: "J8", name: "Bharath Nagar", type: "intersection", lat: 17.4780, lng: 78.4120 },
  { id: "J9", name: "MIG Colony Gate", type: "gate", lat: 17.4890, lng: 78.4080 },
  { id: "J10", name: "Petbasheerabad", type: "intersection", lat: 17.5030, lng: 78.4180 },
];

export const mockRoads = [
  { id: "R1", name: "MG Road N", from_junction: "J1", to_junction: "J2", lanes: 3, speed_limit: 40, length_km: 0.15 },
  { id: "R2", name: "MG Road S", from_junction: "J2", to_junction: "J1", lanes: 3, speed_limit: 40, length_km: 0.15 },
  { id: "R3", name: "Hospital Rd E", from_junction: "J1", to_junction: "J3", lanes: 2, speed_limit: 30, length_km: 0.22 },
  { id: "R4", name: "Hospital Rd W", from_junction: "J3", to_junction: "J1", lanes: 2, speed_limit: 30, length_km: 0.22 },
  { id: "R5", name: "Ring Road NW", from_junction: "J1", to_junction: "J4", lanes: 4, speed_limit: 50, length_km: 0.28 },
  { id: "R6", name: "Ring Road SE", from_junction: "J4", to_junction: "J1", lanes: 4, speed_limit: 50, length_km: 0.28 },
  { id: "R7", name: "Market Ave", from_junction: "J3", to_junction: "J5", lanes: 2, speed_limit: 30, length_km: 0.22 },
  { id: "R8", name: "Market Ave Rev", from_junction: "J5", to_junction: "J3", lanes: 2, speed_limit: 30, length_km: 0.22 },
  { id: "R9", name: "Station Rd", from_junction: "J2", to_junction: "J7", lanes: 3, speed_limit: 40, length_km: 0.25 },
  { id: "R10", name: "Station Rd Rev", from_junction: "J7", to_junction: "J2", lanes: 3, speed_limit: 40, length_km: 0.25 },
  { id: "R11", name: "University Blvd", from_junction: "J4", to_junction: "J6", lanes: 3, speed_limit: 40, length_km: 0.22 },
  { id: "R12", name: "University Blvd Rev", from_junction: "J6", to_junction: "J4", lanes: 3, speed_limit: 40, length_km: 0.22 },
  { id: "R13", name: "Bypass NE", from_junction: "J6", to_junction: "J10", lanes: 4, speed_limit: 60, length_km: 0.25 },
  { id: "R14", name: "Bypass SW", from_junction: "J10", to_junction: "J6", lanes: 4, speed_limit: 60, length_km: 0.25 },
  { id: "R15", name: "Tech Link", from_junction: "J7", to_junction: "J10", lanes: 2, speed_limit: 40, length_km: 0.34 },
  { id: "R16", name: "Tech Link Rev", from_junction: "J10", to_junction: "J7", lanes: 2, speed_limit: 40, length_km: 0.34 },
  { id: "R17", name: "River Rd", from_junction: "J5", to_junction: "J8", lanes: 2, speed_limit: 30, length_km: 0.18 },
  { id: "R18", name: "River Rd Rev", from_junction: "J8", to_junction: "J5", lanes: 2, speed_limit: 30, length_km: 0.18 },
  { id: "R19", name: "Fort Road", from_junction: "J3", to_junction: "J9", lanes: 2, speed_limit: 30, length_km: 0.27 },
  { id: "R20", name: "Fort Road Rev", from_junction: "J9", to_junction: "J3", lanes: 2, speed_limit: 30, length_km: 0.27 },
  { id: "R21", name: "Old Bridge Rd", from_junction: "J8", to_junction: "J9", lanes: 2, speed_limit: 25, length_km: 0.42 },
  { id: "R22", name: "Old Bridge Rd Rev", from_junction: "J9", to_junction: "J8", lanes: 2, speed_limit: 25, length_km: 0.42 },
  { id: "R23", name: "Central Ave", from_junction: "J1", to_junction: "J7", lanes: 3, speed_limit: 40, length_km: 0.35 },
  { id: "R24", name: "Central Ave Rev", from_junction: "J7", to_junction: "J1", lanes: 3, speed_limit: 40, length_km: 0.35 },
  { id: "R25", name: "Express Way N", from_junction: "J2", to_junction: "J6", lanes: 4, speed_limit: 60, length_km: 0.24 },
  { id: "R26", name: "Express Way S", from_junction: "J6", to_junction: "J2", lanes: 4, speed_limit: 60, length_km: 0.24 },
  { id: "R27", name: "Park Lane", from_junction: "J1", to_junction: "J9", lanes: 2, speed_limit: 30, length_km: 0.35 },
  { id: "R28", name: "Park Lane Rev", from_junction: "J9", to_junction: "J1", lanes: 2, speed_limit: 30, length_km: 0.35 },
  { id: "R29", name: "Lakeside Dr", from_junction: "J5", to_junction: "J7", lanes: 2, speed_limit: 35, length_km: 0.42 },
  { id: "R30", name: "Lakeside Dr Rev", from_junction: "J7", to_junction: "J5", lanes: 2, speed_limit: 35, length_km: 0.42 },
  { id: "R31", name: "Stadium Rd", from_junction: "J2", to_junction: "J10", lanes: 3, speed_limit: 40, length_km: 0.33 },
  { id: "R32", name: "Stadium Rd Rev", from_junction: "J10", to_junction: "J2", lanes: 3, speed_limit: 40, length_km: 0.33 },
  { id: "R33", name: "Industrial Way", from_junction: "J4", to_junction: "J9", lanes: 3, speed_limit: 45, length_km: 0.38 },
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
  J1: ["J2", "J3", "J4", "J7", "J9"],
  J2: ["J1", "J6", "J7", "J10"],
  J3: ["J1", "J5", "J9"],
  J4: ["J1", "J6", "J9"],
  J5: ["J3", "J7", "J8"],
  J6: ["J2", "J4", "J10"],
  J7: ["J1", "J2", "J5", "J10"],
  J8: ["J5", "J9"],
  J9: ["J1", "J3", "J4", "J8"],
  J10: ["J2", "J6", "J7"],
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
