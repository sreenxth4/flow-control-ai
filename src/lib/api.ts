import { getMockMapData, getMockJunctionDetail, getMockPerformance, getMockHealth, getMockNetworkStatus, getMockRoute, getMockMultipleRoutes } from "./mock-data";
import type { MapData, JunctionDetail, DetectionResult, PerformanceData, HealthStatus, SignalOptimizationRequest, SignalOptimizationResult, NetworkStatus, RouteRequest, RouteResult, MultiRouteResult } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";
let performanceEndpoint: "/api/v1/performance/latest" | "/api/v1/metrics" = "/api/v1/metrics";

let usingMockData = false;
export const isUsingMockData = () => usingMockData;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { ...options?.headers },
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    usingMockData = false;
    return res.json();
  } catch {
    usingMockData = true;
    throw new Error("Backend unavailable");
  }
}

export async function fetchMapData(): Promise<MapData> {
  try {
    return await apiFetch<MapData>("/api/v1/map");
  } catch {
    return getMockMapData();
  }
}

export async function fetchJunctionDetail(id: string): Promise<JunctionDetail | null> {
  try {
    return await apiFetch<JunctionDetail>(`/api/v1/junctions/${id}`);
  } catch {
    return getMockJunctionDetail(id);
  }
}

export async function fetchPerformance(): Promise<PerformanceData> {
  const parsePerformancePayload = (payload: any): PerformanceData => {
    // New backend shape
    if (payload?.summary && payload?.performance_profile) {
      return payload as PerformanceData;
    }

    // Legacy metrics shape fallback
    const totalFrames = payload?.summary?.total_frames ?? payload?.total_frames_processed ?? payload?.total_frames ?? 0;
    const averageFps = payload?.summary?.average_fps ?? payload?.average_processing_fps ?? payload?.fps ?? 0;
    const totalTime = payload?.summary?.total_time ?? payload?.processing_time_seconds ?? 0;

    return {
      summary: {
        total_frames: totalFrames,
        average_fps: averageFps,
        total_time: totalTime,
      },
      performance_profile: {
        detect_time: payload?.performance_profile?.detect_time ?? 0,
        track_time: payload?.performance_profile?.track_time ?? 0,
        analyze_time: payload?.performance_profile?.analyze_time ?? 0,
        total_time: payload?.performance_profile?.total_time ?? totalTime,
      },
    };
  };

  try {
    const res = await fetch(`${BASE_URL}${performanceEndpoint}`);
    if (!res.ok) {
      if (res.status === 404 && performanceEndpoint === "/api/v1/metrics") {
        performanceEndpoint = "/api/v1/performance/latest";
        const fallbackRes = await fetch(`${BASE_URL}${performanceEndpoint}`);
        if (!fallbackRes.ok) throw new Error(`API ${fallbackRes.status}`);
        usingMockData = false;
        const fallbackPayload = await fallbackRes.json();
        return parsePerformancePayload(fallbackPayload);
      }
      throw new Error(`API ${res.status}`);
    }

    usingMockData = false;
    const payload = await res.json();
    return parsePerformancePayload(payload);
  } catch {
    return getMockPerformance();
  }
}

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    return await apiFetch<HealthStatus>("/api/v1/healthz");
  } catch {
    try {
      return await apiFetch<HealthStatus>("/healthz");
    } catch {
      return getMockHealth();
    }
  }
}

export async function submitVideoDetection(
  sourceId: string,
  videoFile: File,
  targetFps: number
): Promise<DetectionResult> {
  const formData = new FormData();
  formData.append("source_id", sourceId);
  formData.append("video_file", videoFile);
  formData.append("target_fps", String(targetFps));

  return apiFetch<DetectionResult>("/api/v1/detect/video", {
    method: "POST",
    body: formData,
  });
}

// Signal Optimization (main backend)
export async function optimizeSignals(request: SignalOptimizationRequest): Promise<SignalOptimizationResult> {
  try {
    return await apiFetch<SignalOptimizationResult>("/api/optimize_signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    // Mock response
    return {
      junction_id: request.junction_id,
      signal_timings: [
        { phase: "Phase A", green_duration: 35 },
        { phase: "Phase B", green_duration: 25 },
      ],
      cycle_time: 90,
      density_level: "MEDIUM",
      traffic_delay: 12.5,
      signal_wait: 8.3,
    };
  }
}

// Network Status
export async function fetchNetworkStatus(): Promise<NetworkStatus> {
  try {
    return await apiFetch<NetworkStatus>("/api/network_status");
  } catch {
    return getMockNetworkStatus();
  }
}

// Route Finding
export async function findRoute(request: RouteRequest): Promise<RouteResult> {
  try {
    return await apiFetch<RouteResult>("/api/get_route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return getMockRoute(request.source, request.destination);
  }
}

// Multiple Routes Finding
export async function findMultipleRoutes(request: RouteRequest): Promise<MultiRouteResult> {
  try {
    return await apiFetch<MultiRouteResult>("/api/get_routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    try {
      const singleRoute = await apiFetch<RouteResult>("/api/get_route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      return { routes: [singleRoute] };
    } catch {
      return getMockMultipleRoutes(request.source, request.destination);
    }
  }
}

// Simulation Scenarios
export async function postSimulationScenario(scenario: string): Promise<any> {
  return apiFetch<any>("/api/simulation/scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
}
