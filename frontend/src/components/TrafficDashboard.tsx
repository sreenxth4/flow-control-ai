import { useEffect, useRef, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DensityBadge } from "@/components/DensityBadge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMapData, usePerformance, useHealth, useTrafficState } from "@/hooks/use-map-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Gauge, Signal, CheckCircle, XCircle, Clock } from "lucide-react";
import { TrafficMap } from "@/components/TrafficMap";
import "./junction-label.css";
import type { DensityLevel, Junction } from "@/lib/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

// Density colors: GREEN/ORANGE/RED
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#00AA00",
  MEDIUM: "#FF8800",
  HIGH: "#FF0000",
};

// Road colors: BLACK for major roads (50+), GREY for local roads (40)
const getRoadColor = (speedLimit: number) => speedLimit >= 50 ? "#1a1a1a" : "#999999";

// Fixed compact marker size matching Upload & Analyze map style
const getMarkerSize = (_vehicleCount?: number) => 10;

const isValidCoord = (lat: unknown, lng: unknown): lat is number => {
  return Number.isFinite(lat) && Number.isFinite(lng);
};

const resolveCoords = (junction: any): { lat: number; lng: number } | null => {
  const lat = junction?.lat ?? junction?.latitude;
  const lng = junction?.lng ?? junction?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

export function TrafficDashboard() {
  const { data: mapData, isLoading: mapLoading } = useMapData();
  const { data: perf, isLoading: perfLoading } = usePerformance();
  const { data: health, isLoading: healthLoading } = useHealth();

  const dashboardJunctions = Array.isArray(mapData?.junctions) ? mapData.junctions : [];
  const safeRoads = Array.isArray(mapData?.roads) ? mapData.roads : [];
  const { data: trafficStateData } = useTrafficState();

  // Poll junction signals for live per-road data
  const [junctionSignals, setJunctionSignals] = useState<Record<string, any>>({});
  useEffect(() => {
    const poll = () => {
      fetch(`${BASE_URL}/api/junction_signals`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.junctions) setJunctionSignals(data.junctions);
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  // Anchor-based smooth countdown: persist across polls
  const countdownAnchorsRef = useRef<Record<string, { anchorTime: number; anchorRemaining: number; activeGreenRoad: string }>>({});

  // When signal data arrives, set/update anchors (only reset on phase change)
  useEffect(() => {
    const now = Date.now();
    Object.entries(junctionSignals).forEach(([jId, sig]: [string, any]) => {
      const activeGreen = sig?.active_green_road || "";
      const timeRemaining = sig?.time_remaining ?? 0;
      const existing = countdownAnchorsRef.current[jId];
      if (!existing || existing.activeGreenRoad !== activeGreen) {
        countdownAnchorsRef.current[jId] = { anchorTime: now, anchorRemaining: timeRemaining, activeGreenRoad: activeGreen };
      }
    });
  }, [junctionSignals]);

  // Current time state: updated every second to drive smooth countdown rendering
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Build road name lookup
  const roadNameMap = useRef<Record<string, string>>({});
  useEffect(() => {
    safeRoads.forEach((r: any) => { roadNameMap.current[r.id] = r.name; });
  }, [safeRoads]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Map */}
      <div className="h-[38vh] sm:h-[42vh] md:h-[45vh] min-h-[240px] sm:min-h-[280px] flex-shrink-0 overflow-hidden relative" style={{ isolation: "isolate" }}>
        <TrafficMap
          junctions={dashboardJunctions}
          roads={safeRoads}
          roadStates={trafficStateData?.road_states || {}}
          flyTo={null}
          onJunctionClick={useCallback(() => {}, [])}
        />
      </div>

      {/* Content below map */}
      <div className="space-y-4 sm:space-y-5 p-3 sm:p-5">
        {/* Live Junction Signals */}
        <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Signal className="h-4 w-4 text-traffic-medium" /> Live Junction Signals — Kukatpally Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mapLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <Accordion type="multiple" className="w-full">
                {dashboardJunctions.map((junction) => {
                  const sig = junctionSignals[junction.id];
                  const sigRoads = sig?.roads || {};
                  const roadIds = Object.keys(sigRoads);
                  const activeGreen = sig?.active_green_road || "";
                  const activeGreenName = roadNameMap.current[activeGreen] || activeGreen;
                  const timeRemaining = sig?.time_remaining ?? 0;
                  const densityLevel = sig?.density_level || junction.density;

                  const anchor = countdownAnchorsRef.current[junction.id];
                  const smoothCountdown = anchor
                    ? Math.max(0, anchor.anchorRemaining - Math.floor((now - anchor.anchorTime) / 1000))
                    : timeRemaining;

                  return (
                    <AccordionItem key={junction.id} value={junction.id}>
                      <AccordionTrigger className="text-sm hover:no-underline">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{junction.id} — {junction.name}</span>
                          <DensityBadge level={densityLevel} />
                          <span className="text-xs text-muted-foreground">{roadIds.length} roads</span>
                          {activeGreen && (
                            <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                              🟢 {activeGreenName} — {smoothCountdown}s
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {roadIds.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No signal data available yet.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[40px]">⚡</TableHead>
                                <TableHead>Road ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead className="text-right">PCU</TableHead>
                                <TableHead className="text-right">Vehicles</TableHead>
                                <TableHead className="text-right">Wait</TableHead>
                                <TableHead className="w-[40px]">Dens</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {roadIds.map((rId) => {
                                const rd = sigRoads[rId];
                                const isGreen = rd?.signal === "GREEN";
                                const dotColor = rd?.density === "HIGH" ? "#ef4444" : rd?.density === "MEDIUM" ? "#f59e0b" : "#22c55e";
                                // Smooth wait time: for RED roads, add elapsed seconds since last poll
                                const baseWait = rd?.wait_time ?? 0;
                                const smoothWait = isGreen ? 0 : baseWait + Math.floor((now - (anchor?.anchorTime ?? now)) / 1000);
                                return (
                                  <TableRow key={rId} className={isGreen ? "bg-green-50 dark:bg-green-950/20" : ""}>
                                    <TableCell>{isGreen ? "🟢" : "🔴"}</TableCell>
                                    <TableCell className="font-mono text-xs">{rId}</TableCell>
                                    <TableCell className="text-sm">{roadNameMap.current[rId] || "—"}</TableCell>
                                    <TableCell className="text-right font-mono">{rd?.pcu ?? "—"}</TableCell>
                                    <TableCell className="text-right font-mono">{rd?.vehicles ?? "—"}</TableCell>
                                    <TableCell className="text-right font-mono" style={{ color: isGreen ? "#888" : "#ef4444" }}>
                                      {isGreen ? "—" : `${smoothWait}s`}
                                    </TableCell>
                                    <TableCell>
                                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: dotColor, border: "1px solid #e5e7eb" }} />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Health + Performance */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* System Health */}
          <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Heart className="h-4 w-4 text-traffic-low" /> System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              {healthLoading ? (
                <Skeleton className="h-24" />
              ) : health ? (
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={health.status === "healthy" ? "bg-traffic-low text-traffic-low-foreground" : "bg-traffic-high text-traffic-high-foreground"}>
                      {health.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Detector</span>
                    <span className="font-medium text-foreground">{health.detector}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span className="font-medium text-foreground">{health.model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Video Support</span>
                    {health.video_support ? (
                      <span className="flex items-center gap-1 text-traffic-low"><CheckCircle className="h-3.5 w-3.5" /> Enabled</span>
                    ) : (
                      <span className="flex items-center gap-1 text-traffic-high"><XCircle className="h-3.5 w-3.5" /> Disabled</span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to fetch health status</p>
              )}
            </CardContent>
          </Card>

          {/* Performance Diagnostics */}
          <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gauge className="h-4 w-4 text-primary" /> Performance Diagnostics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {perfLoading ? (
                <Skeleton className="h-24" />
              ) : perf ? (
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Frames</span>
                    <span className="font-medium text-foreground">{perf.summary?.total_frames ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average FPS</span>
                    <span className="font-medium text-foreground">{perf.summary?.average_fps ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Time</span>
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {perf.summary?.total_time ?? 0}s
                    </span>
                  </div>
                  {/* Breakdown bar */}
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Breakdown</p>
                    <PerfBar label="Detection" value={perf.performance_profile?.detect_time ?? 0} total={perf.performance_profile?.total_time ?? 0} />
                    <PerfBar label="Tracking" value={perf.performance_profile?.track_time ?? 0} total={perf.performance_profile?.total_time ?? 0} />
                    <PerfBar label="Analysis" value={perf.performance_profile?.analyze_time ?? 0} total={perf.performance_profile?.total_time ?? 0} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No detection run yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Auto-refresh note */}
        <p className="pb-4 text-center text-xs text-muted-foreground">Auto-refreshes every 60 seconds</p>
      </div>
    </div>
  );
}

function PerfBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{value}s ({pct.toFixed(0)}%)</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
