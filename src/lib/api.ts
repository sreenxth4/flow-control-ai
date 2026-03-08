import { getMockMapData, getMockJunctionDetail, getMockPerformance, getMockHealth } from "./mock-data";
import type { MapData, JunctionDetail, DetectionResult, PerformanceData, HealthStatus } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

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
  try {
    return await apiFetch<PerformanceData>("/api/v1/performance/latest");
  } catch {
    return getMockPerformance();
  }
}

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    return await apiFetch<HealthStatus>("/healthz");
  } catch {
    return getMockHealth();
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
