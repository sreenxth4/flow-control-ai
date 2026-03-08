import type { MapData, JunctionDetail, PerformanceData, HealthStatus, DensityLevel, NetworkStatus, RouteResult } from "./types";

const densities: DensityLevel[] = ["LOW", "MEDIUM", "HIGH"];
const randomDensity = (): DensityLevel => densities[Math.floor(Math.random() * 3)];

export const mockJunctions = [
  { id: "J1", name: "Main Square", type: "intersection", lat: 28.6139, lng: 77.2090 },
  { id: "J2", name: "Railway Crossing", type: "crossing", lat: 28.6150, lng: 77.2100 },
  { id: "J3", name: "Hospital Junction", type: "intersection", lat: 28.6120, lng: 77.2080 },
  { id: "J4", name: "Bus Terminal", type: "terminal", lat: 28.6160, lng: 77.2070 },
  { id: "J5", name: "Market Circle", type: "roundabout", lat: 28.6110, lng: 77.2100 },
  { id: "J6", name: "University Gate", type: "gate", lat: 28.6172, lng: 77.2090 },
  { id: "J7", name: "Tech Park", type: "intersection", lat: 28.6145, lng: 77.2125 },
  { id: "J8", name: "River Bridge", type: "bridge", lat: 28.6098, lng: 77.2085 },
  { id: "J9", name: "Old Fort Gate", type: "gate", lat: 28.6130, lng: 77.2055 },
  { id: "J10", name: "Stadium Junction", type: "intersection", lat: 28.6178, lng: 77.2115 },
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
    region_name: "New Delhi Traffic Region",
    junctions: mockJunctions.map((j) => ({ ...j, density: randomDensity() })),
    roads: mockRoads,
    signal_phases: mockSignalPhases,
  };
}

export function getMockJunctionDetail(id: string): JunctionDetail | null {
  const junction = mockJunctions.find((j) => j.id === id);
  if (!junction) return null;
  return {
    junction: { ...junction, density: randomDensity() },
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
