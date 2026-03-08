import { useQuery } from "@tanstack/react-query";
import { fetchMapData, fetchJunctionDetail, fetchPerformance, fetchHealth } from "@/lib/api";

export function useMapData() {
  return useQuery({
    queryKey: ["map-data"],
    queryFn: fetchMapData,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useJunctionDetail(id: string | null) {
  return useQuery({
    queryKey: ["junction", id],
    queryFn: () => fetchJunctionDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function usePerformance() {
  return useQuery({
    queryKey: ["performance"],
    queryFn: fetchPerformance,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
