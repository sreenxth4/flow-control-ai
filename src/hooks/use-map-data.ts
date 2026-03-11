import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchMapData, fetchJunctionDetail, fetchPerformance, fetchHealth, fetchNetworkStatus, findRoute, optimizeSignals, findMultipleRoutes } from "@/lib/api";
import type { RouteRequest, SignalOptimizationRequest } from "@/lib/types";

export function useMapData() {
  return useQuery({
    queryKey: ["map-data"],
    queryFn: fetchMapData,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
    retryDelay: 3000,
  });
}

export function useJunctionDetail(id: string | null) {
  return useQuery({
    queryKey: ["junction", id],
    queryFn: () => fetchJunctionDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
    retry: 1,
  });
}

export function usePerformance() {
  return useQuery({
    queryKey: ["performance"],
    queryFn: fetchPerformance,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useNetworkStatus() {
  return useQuery({
    queryKey: ["network-status"],
    queryFn: fetchNetworkStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useFindRoute() {
  return useMutation({
    mutationFn: (request: RouteRequest) => findRoute(request),
  });
}

export function useFindMultipleRoutes() {
  return useMutation({
    mutationFn: (request: RouteRequest) => findMultipleRoutes(request),
  });
}

export function useOptimizeSignals() {
  return useMutation({
    mutationFn: (request: SignalOptimizationRequest) => optimizeSignals(request),
  });
}
