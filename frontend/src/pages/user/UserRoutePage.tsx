import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useMapData, useFindMultipleRoutes, useTrafficState } from "@/hooks/use-map-data";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MapPin, Route, X, ArrowRight, Loader2, AlertTriangle, Clock,
  RefreshCw, Zap, Lightbulb, PanelLeft, PanelLeftClose,
} from "lucide-react";
import type { RouteResult, DensityLevel, MultiRouteResult } from "@/lib/types";
import { toast } from "sonner";
import { TrafficMap } from "@/components/TrafficMap";
import { BottomSheet } from "@/components/BottomSheet";

// Density colors
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};
const SIDEBAR_STORAGE_KEY = "user-route-sidebar-open";

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

// Route colors assigned by total travel time
const getRouteColorByRank = (routes: { total_cost: number; congestion_delay?: number }[]) => {
  if (routes.length <= 1) return ["#22c55e"];
  const totalTimes = routes.map((r, i) => ({ i, time: r.total_cost + (r.congestion_delay || 0) }));
  totalTimes.sort((a, b) => a.time - b.time);
  const colorMap: Record<number, string> = {};
  colorMap[totalTimes[0].i] = "#22c55e";
  if (totalTimes.length === 2) {
    colorMap[totalTimes[1].i] = "#ef4444";
  } else {
    colorMap[totalTimes[totalTimes.length - 1].i] = "#ef4444";
    for (let k = 1; k < totalTimes.length - 1; k++) {
      colorMap[totalTimes[k].i] = "#87CEEB";
    }
  }
  return routes.map((_, i) => colorMap[i]);
};

const getRouteLabelByRank = (routes: { total_cost: number; congestion_delay?: number }[]) => {
  if (routes.length <= 1) return ["Fastest"];
  const totalTimes = routes.map((r, i) => ({ i, time: r.total_cost + (r.congestion_delay || 0) }));
  totalTimes.sort((a, b) => a.time - b.time);
  const labelMap: Record<number, string> = {};
  labelMap[totalTimes[0].i] = "Fastest";
  if (totalTimes.length === 2) {
    labelMap[totalTimes[1].i] = "Slowest";
  } else {
    labelMap[totalTimes[totalTimes.length - 1].i] = "Slowest";
    for (let k = 1; k < totalTimes.length - 1; k++) {
      labelMap[totalTimes[k].i] = "Moderate";
    }
  }
  return routes.map((_, i) => labelMap[i]);
};

const UserRoutePage = () => {
  const { data } = useMapData();
  const { data: trafficStateData } = useTrafficState();
  const queryClient = useQueryClient();
  const findRoutesMutation = useFindMultipleRoutes();

  const [source, setSource] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [routeResult, setRouteResult] = useState<MultiRouteResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeLocked, setRouteLocked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) return saved === "true";
    return window.innerWidth >= 768;
  });
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Hybrid smart rerouting state
  const originalLockedCostRef = useRef<number>(0);
  const [liveCost, setLiveCost] = useState<number | null>(null);
  const [rerouteSuggestion, setRerouteSuggestion] = useState<{
    saving: number;
    newResult: MultiRouteResult;
    bestIndex: number;
  } | null>(null);

  const junctions = useMemo(() => Array.isArray(data?.junctions) ? data.junctions : [], [data?.junctions]);
  const safeJunctions = useMemo(() =>
    junctions.filter(j => {
      const lat = j.lat ?? (j as any).latitude;
      const lng = j.lng ?? (j as any).longitude;
      return typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng);
    }),
    [junctions]
  );
  const roads = useMemo(() => Array.isArray(data?.roads) ? data.roads : [], [data?.roads]);

  const getJunctionName = useCallback(
    (id: string) => junctions.find((j) => j.id === id)?.name || id,
    [junctions]
  );

  const handleFindRoute = useCallback(async () => {
    if (!source || !destination) return;
    try {
      const result = await findRoutesMutation.mutateAsync({ source, destination });
      setRouteResult(result);
      setSelectedRouteIndex(0);
      setRouteLocked(false);
      setLiveCost(null);
      setLastFetchTime(Date.now());
      if (result.routes.length === 0) toast.error("No route found between selected junctions");
      if (result.routes.some((r) => !r.success)) {
        const firstError = result.routes.find((r) => !r.success);
        toast.error(firstError?.message || "Route validation failed on backend");
      }
    } catch {
      toast.error("Backend route service unavailable");
      setRouteResult(null);
    }
  }, [source, destination, findRoutesMutation]);

  const handleClear = useCallback(() => {
    setSource("");
    setDestination("");
    setRouteResult(null);
    setSelectedRouteIndex(0);
    setRouteLocked(false);
    setLiveCost(null);
    setLastFetchTime(0);
  }, []);

  // Lock route when user selects one
  const handleSelectRoute = useCallback((idx: number) => {
    setSelectedRouteIndex(idx);
    setRouteLocked(true);
    setRerouteSuggestion(null);
    setLiveCost(null);
    const route = routeResult?.routes?.[idx];
    if (route) {
      originalLockedCostRef.current = route.total_cost + (route.congestion_delay || 0);
    }
  }, [routeResult]);

  // Accept reroute suggestion
  const handleAcceptReroute = useCallback(() => {
    if (!rerouteSuggestion) return;
    setRouteResult(rerouteSuggestion.newResult);
    setSelectedRouteIndex(rerouteSuggestion.bestIndex);
    originalLockedCostRef.current = (() => {
      const r = rerouteSuggestion.newResult.routes[rerouteSuggestion.bestIndex];
      return r ? r.total_cost + (r.congestion_delay || 0) : 0;
    })();
    setRerouteSuggestion(null);
    setLiveCost(null);
    setLastFetchTime(Date.now());
  }, [rerouteSuggestion]);

  // Update "fetched X seconds ago" counter
  useEffect(() => {
    if (!lastFetchTime) return;
    const tick = () => setSecondsAgo(Math.floor((Date.now() - lastFetchTime) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [lastFetchTime]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("orientationchange", handleResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  // BACKGROUND MONITORING — silently checks for better routes every 5s
  // Only active when route is locked. Never changes UI automatically.
  // Shows suggestion banner only if a route saves >30s.
  // Also does "soft update" — updates live cost of locked path.
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!routeLocked || !source || !destination) return;

    const monitor = setInterval(async () => {
      try {
        const freshResult = await findRoutesMutation.mutateAsync({ source, destination });
        if (!freshResult.routes.length) return;

        // Find best fresh route
        let bestIdx = 0;
        let bestCost = Infinity;
        freshResult.routes.forEach((r, i) => {
          const cost = r.total_cost + (r.congestion_delay || 0);
          if (cost < bestCost) { bestCost = cost; bestIdx = i; }
        });

        const saving = originalLockedCostRef.current - bestCost;

        // Soft update: find fresh cost of user's SAME locked path
        const lockedRoute = routeResult?.routes?.[selectedRouteIndex];
        if (lockedRoute) {
          const lockedPath = JSON.stringify(lockedRoute.path);
          const matchingFresh = freshResult.routes.find(r => JSON.stringify(r.path) === lockedPath);
          if (matchingFresh) {
            setLiveCost(matchingFresh.total_cost + (matchingFresh.congestion_delay || 0));
          } else {
            setLiveCost(null);
          }
        }

        // Only suggest reroute if saving > 30 seconds
        if (saving > 30) {
          setRerouteSuggestion({ saving: Math.round(saving), newResult: freshResult, bestIndex: bestIdx });
        } else {
          setRerouteSuggestion(null);
        }
      } catch {
        // silent — don't disturb user
      }
    }, 5000);

    return () => clearInterval(monitor);
  }, [routeLocked, source, destination, findRoutesMutation]);

  const selectedRoute = routeResult?.routes?.[selectedRouteIndex];

  const noopJunctionClick = useCallback(() => {}, []);

  // Memoize props for TrafficMap to prevent unnecessary re-renders
  const memoizedMultiRoutePaths = useMemo(() => {
    if (!selectedRoute) return undefined;
    return [{
      path: selectedRoute.path,
      roads: selectedRoute.roads,
      color: getRouteColorByRank(routeResult!.routes)[selectedRouteIndex]
    }];
  }, [selectedRoute?.path, selectedRoute?.roads, routeResult?.routes, selectedRouteIndex]);

  const selectedSourceJunction = selectedRoute?.path?.[0] || source || null;
  const selectedDestinationJunction =
    selectedRoute?.path?.[selectedRoute.path.length - 1] || destination || null;

  const memoizedRoadStates = useMemo(
    () => trafficStateData?.road_states || {},
    [trafficStateData?.road_states]
  );

  // ── Shared sidebar content (desktop sidebar & mobile bottom sheet) ──
  const sidebarContent = (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Route Finder</h2>
          <p className="text-xs text-muted-foreground">Find optimal routes through the Kukatpally traffic network</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="h-8 w-8 hidden md:inline-flex">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Source */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <MapPin className="h-3 w-3 text-primary" /> Source Junction
        </Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
          <SelectContent>
            {junctions.map((j) => (
              <SelectItem key={j.id} value={j.id} disabled={j.id === destination}>
                {j.id} — {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Destination */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <MapPin className="h-3 w-3 text-destructive" /> Destination Junction
        </Label>
        <Select value={destination} onValueChange={setDestination}>
          <SelectTrigger><SelectValue placeholder="Select destination..." /></SelectTrigger>
          <SelectContent>
            {junctions.map((j) => (
              <SelectItem key={j.id} value={j.id} disabled={j.id === source}>
                {j.id} — {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <Button onClick={handleFindRoute} disabled={!source || !destination || findRoutesMutation.isPending} className="flex-1">
          {findRoutesMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finding...</>
          ) : (
            <><Route className="mr-2 h-4 w-4" /> Find Routes</>
          )}
        </Button>
        {(source || destination || routeResult) && (
          <Button variant="outline" onClick={handleClear}><X className="h-4 w-4" /></Button>
        )}
      </div>

      {/* Refresh / Staleness indicator */}
      {routeResult && routeResult.routes.length > 0 && (
        <div className="flex items-center gap-2 text-xs rounded-md bg-muted/50 px-3 py-1.5">
          <Button
            variant="ghost" size="sm"
            onClick={handleFindRoute}
            disabled={findRoutesMutation.isPending}
            className="h-6 px-2 text-xs gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${findRoutesMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <span className="text-muted-foreground">
            {secondsAgo < 5 ? 'Just now' : `${secondsAgo}s ago`}
          </span>
          {routeLocked && (
            <span className="ml-auto text-green-500 text-micro font-medium">🔒 Locked</span>
          )}
        </div>
      )}

      {/* Stale data warning */}
      {routeResult && secondsAgo > 30 && !rerouteSuggestion && (
        <div className="flex items-center gap-2 text-xs rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
          <span className="text-amber-600 dark:text-amber-400">Traffic data is {secondsAgo}s old — consider refreshing</span>
        </div>
      )}

      {/* ⚡ Smart Reroute Suggestion Banner */}
      {rerouteSuggestion && (
        <div className="rounded-lg border-2 border-emerald-500/50 bg-emerald-500/10 p-3 space-y-2"
             style={{ animation: 'pulse 2s ease-in-out infinite', boxShadow: '0 0 12px rgba(16,185,129,0.3)' }}>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              Faster route available (−{rerouteSuggestion.saving}s)
            </span>
            <button
              onClick={() => setRerouteSuggestion(null)}
              className="ml-auto text-muted-foreground hover:text-foreground"
              aria-label="Dismiss reroute suggestion"
              title="Dismiss reroute suggestion"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Traffic conditions changed — a better route was found.
          </p>
          <Button size="sm" onClick={handleAcceptReroute}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7">
            ⚡ Switch Route
          </Button>
        </div>
      )}

      {/* Route Selection Cards */}
      {routeResult && routeResult.routes.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Available Routes</Label>
          <div className="grid gap-2">
            {routeResult.routes.map((route, idx) => {
              const totalTime = route.total_cost + (route.congestion_delay || 0);
              const sigSummary = route.signals_summary || { green: 0, red: 0 };
              const isLocked = routeLocked && selectedRouteIndex === idx;
              const showLive = isLocked && liveCost !== null && Math.abs(liveCost - totalTime) > 2;
              const liveDelta = liveCost !== null ? liveCost - totalTime : 0;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectRoute(idx)}
                  className={`w-full rounded-xl border p-3 text-left transition-all duration-300 overflow-hidden outline-none select-none ${
                    selectedRouteIndex === idx
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-md shadow-primary/10 scale-[1.02] z-10 relative"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/50 hover:shadow-sm hover:-translate-y-1"
                  }`}
                >
                  <div className="flex items-center justify-between w-full min-w-0 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getRouteColorByRank(routeResult.routes)[idx] }}
                      />
                      <span className="text-sm font-medium truncate">{getRouteLabelByRank(routeResult.routes)[idx]}</span>
                    </div>
                    <span className="text-sm font-mono font-bold whitespace-nowrap flex-shrink-0">{formatTime(totalTime)}</span>
                  </div>
                  {showLive && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">now</span>
                      <span className={`font-mono font-bold ${liveDelta > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                        {formatTime(liveCost!)}
                      </span>
                      <span className={`text-micro ${liveDelta > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                        ({liveDelta > 0 ? '+' : ''}{Math.round(liveDelta)}s)
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="whitespace-nowrap">🛑 {route.num_junctions} junctions</span>
                    {route.congestion_delay && route.congestion_delay > 0 && (
                      <span className="text-amber-600 whitespace-nowrap">⏳ +{Math.round(route.congestion_delay)}s delay</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {sigSummary.green > 0 && (
                      <span className="text-green-600 whitespace-nowrap">🟢 {sigSummary.green} GREEN</span>
                    )}
                    {sigSummary.red > 0 && (
                      <span className="text-red-500 whitespace-nowrap">🔴 {sigSummary.red} RED</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {selectedRoute?.recommendation && (
        <div className="flex items-start gap-2 rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2 w-full overflow-hidden">
          <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300 break-words flex-1 min-w-0 leading-relaxed">
            {selectedRoute.recommendation}
          </p>
        </div>
      )}

      {/* Delay Breakdown */}
      {selectedRoute?.delay_reasons && selectedRoute.delay_reasons.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Delay Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {selectedRoute.delay_reasons.map((dr) => (
              <div key={dr.junction_id} className="rounded-md bg-muted/50 p-2">
                <div className="flex flex-wrap items-center justify-between mb-1 gap-2">
                  <span className="font-medium truncate">{dr.junction}</span>
                  <span className="font-mono font-bold text-amber-600 whitespace-nowrap">+{dr.delay}s</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                  {dr.signal_delay > 0 && <span className="whitespace-nowrap">🚦 Signal: {dr.signal_delay}s</span>}
                  {dr.traffic_delay > 0 && <span className="whitespace-nowrap">🚗 Traffic: {dr.traffic_delay}s</span>}
                  {dr.queue_delay > 0 && <span className="whitespace-nowrap">📊 Queue: {dr.queue_delay}s</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Segment Details Table */}
      {selectedRoute && selectedRoute.segments && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs">Segment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">From</TableHead>
                  <TableHead className="text-xs">To</TableHead>
                  <TableHead className="text-xs">⚡</TableHead>
                  <TableHead className="text-right text-xs">Time</TableHead>
                  <TableHead className="text-right text-xs">Delay</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRoute.segments.map((seg, i) => {
                  const segDelay = (seg.traffic_delay || 0) + (seg.signal_delay || 0) + (seg.queue_delay || 0) + (seg.congestion_penalty || 0);
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{getJunctionName(seg.from_junction)}</TableCell>
                      <TableCell className="text-xs">{getJunctionName(seg.to_junction)}</TableCell>
                      <TableCell className="text-xs">
                        {seg.signal_status === "GREEN" ? "🟢" : seg.signal_status === "RED" ? "🔴" : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{seg.cost.toFixed(1)}s</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {segDelay > 0.5 ? (
                          <span className={segDelay >= 25 ? "text-red-500" : "text-amber-500"}>
                            +{segDelay.toFixed(1)}s
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Total with congestion */}
            <div className="flex items-center justify-between rounded-md bg-primary/10 p-2">
              <div className="flex items-center gap-1 text-sm font-medium">
                <Clock className="h-4 w-4" />
                Total Travel Time
              </div>
              <span className="text-lg font-bold">
                {formatTime(selectedRoute.total_cost + (selectedRoute.congestion_delay || 0))}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {routeResult && routeResult.routes.length === 0 && (
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">No route found between the selected junctions.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-full w-full overflow-hidden">
      {/* ═══ MAP ═══ */}
      <div className="flex-1 min-h-0 overflow-hidden relative order-1 md:order-2" style={{ isolation: "isolate" }}>
        <TrafficMap
          junctions={safeJunctions}
          roads={roads}
          roadStates={memoizedRoadStates}
          flyTo={null}
          onJunctionClick={noopJunctionClick}
          sourceJunction={selectedSourceJunction}
          destinationJunction={selectedDestinationJunction}
          multiRoutePaths={memoizedMultiRoutePaths}
        />
      </div>

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <div
        className={`
          hidden md:block order-2 md:order-1 flex-shrink-0 border-r border-border bg-card transition-all duration-300
          ${sidebarOpen ? "w-[min(380px,44vw)]" : "w-12 overflow-hidden"}
        `}
      >
        {!sidebarOpen ? (
          <div className="flex h-full w-12 flex-col items-center pt-3 gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="h-8 w-8">
              <PanelLeft className="h-4 w-4" />
            </Button>
            <span className="text-micro text-muted-foreground [writing-mode:vertical-lr] rotate-180 tracking-widest">ROUTES</span>
          </div>
        ) : (
          <div className="h-full w-full overflow-y-auto overflow-x-hidden">
            {sidebarContent}
          </div>
        )}
      </div>

      {/* ═══ MOBILE BOTTOM SHEET ═══ */}
      <BottomSheet peekLabel="Route Finder" peekIcon="🛣️" defaultSnap="half">
        {sidebarContent}
      </BottomSheet>
    </div>
  );
};

export default UserRoutePage;
