import { getMockMapData, getMockJunctionDetail, getMockPerformance, getMockHealth, getMockNetworkStatus, getMockRoute, getMockMultipleRoutes } from "./mock-data";
import type { MapData, JunctionDetail, DetectionResult, PerformanceData, HealthStatus, SignalOptimizationRequest, SignalOptimizationResult, NetworkStatus, RouteRequest, RouteResult, MultiRouteResult } from "./types";

// API base resolution: window override > env var > fallback
function getApiBase(): string {
  if (typeof window !== "undefined" && (window as any).__API_BASE__) {
    return (window as any).__API_BASE__;
  }
  return import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "http://127.0.0.1:5000";
}

let usingMockData = false;
export const isUsingMockData = () => usingMockData;

// Shared safe fetch helper — never throws into render
export type SafeResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...options?.headers },
    });
    if (!res.ok) {
      usingMockData = true;
      return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
      // Try parsing anyway — some backends don't set content-type
      try {
        const data = await res.json();
        usingMockData = false;
        return { ok: true, data };
      } catch {
        usingMockData = true;
        return { ok: false, error: "Response is not JSON", status: res.status };
      }
    }
    const data = await res.json();
    usingMockData = false;
    return { ok: true, data };
  } catch {
    usingMockData = true;
    return { ok: false, error: "Network/CORS error — backend unavailable" };
  }
}

const BASE = () => getApiBase();

// Legacy apiFetch kept for submitVideoDetection (throws on failure)
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const result = await safeFetchJson<T>(`${BASE()}${path}`, options);
  if (!result.ok) throw new Error((result as { ok: false; error: string }).error);
  return (result as { ok: true; data: T }).data;
}

export async function fetchMapData(): Promise<MapData> {
  const result = await safeFetchJson<MapData>(`${BASE()}/api/v1/map`);
  if (result.ok) return result.data;
  return getMockMapData();
}

export async function fetchJunctionDetail(id: string): Promise<JunctionDetail | null> {
  const result = await safeFetchJson<JunctionDetail>(`${BASE()}/api/v1/junctions/${id}`);
  if (result.ok) return result.data;
  return getMockJunctionDetail(id);
}

export async function fetchPerformance(): Promise<PerformanceData> {
  const result = await safeFetchJson<PerformanceData>(`${BASE()}/api/v1/performance/latest`);
  if (result.ok) return result.data;
  return getMockPerformance();
}

// Health check with fallback endpoint sequence
export async function fetchHealth(): Promise<HealthStatus> {
  const endpoints = ["/api/v1/healthz", "/api/health", "/healthz"];
  for (const ep of endpoints) {
    const result = await safeFetchJson<HealthStatus>(`${BASE()}${ep}`);
    if (result.ok) return result.data;
  }
  return getMockHealth();
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

// Signal Optimization
export async function optimizeSignals(request: SignalOptimizationRequest): Promise<SignalOptimizationResult> {
  const result = await safeFetchJson<SignalOptimizationResult>(`${BASE()}/api/optimize_signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (result.ok) return result.data;
  // Mock fallback
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

// Network Status
export async function fetchNetworkStatus(): Promise<NetworkStatus> {
  const result = await safeFetchJson<NetworkStatus>(`${BASE()}/api/network_status`);
  if (result.ok) return result.data;
  return getMockNetworkStatus();
}

// Route Finding
export async function findRoute(request: RouteRequest): Promise<RouteResult> {
  const result = await safeFetchJson<RouteResult>(`${BASE()}/api/get_route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (result.ok) return result.data;
  return getMockRoute(request.source, request.destination);
}

// Multiple Routes Finding
export async function findMultipleRoutes(request: RouteRequest): Promise<MultiRouteResult> {
  const result = await safeFetchJson<MultiRouteResult>(`${BASE()}/api/get_routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (result.ok) return result.data;
  return getMockMultipleRoutes(request.source, request.destination);
}
