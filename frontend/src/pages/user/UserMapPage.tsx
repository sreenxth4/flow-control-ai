import { useState, useCallback, useEffect, useMemo } from "react";
import { useMapData, useTrafficState } from "@/hooks/use-map-data";
import { Badge } from "@/components/ui/badge";
import { DensityBadge } from "@/components/DensityBadge";
import { ChevronDown, ChevronUp, PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DensityLevel } from "@/lib/types";
import { TrafficMap } from "@/components/TrafficMap";
import { BottomSheet } from "@/components/BottomSheet";
import "@/components/junction-label.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";
const SIDEBAR_STORAGE_KEY = "user-map-sidebar-open";

// Junction camera options — Kukatpally Zone
const JUNCTION_CAMERAS = [
  { id: "J1", name: "Kukatpally Y Junction" },
  { id: "J2", name: "KPHB Colony Signal" },
  { id: "J3", name: "JNTU Gate Junction" },
  { id: "J4", name: "Kukatpally Bus Depot" },
  { id: "J5", name: "Balanagar X Roads" },
  { id: "J6", name: "Allwyn X Roads" },
  { id: "J7", name: "Moosapet X Roads" },
  { id: "J8", name: "Petbasheerabad Junction" },
  { id: "J9", name: "Pragathi Nagar Junction" },
  { id: "J10", name: "Bachupally Junction" },
] as const;

const getDensityDotColor = (density: string | undefined) => {
  switch (density) {
    case "HIGH": return "#ef4444";
    case "MEDIUM": return "#f59e0b";
    case "LOW": return "#22c55e";
    default: return "#9ca3af";
  }
};

interface JunctionStatus {
  junctionId: string;
  name: string;
  lastAnalyzed: string | null;
  density: DensityLevel | null;
  vehicleCount: number;
  pcu: number;
}

const UserMapPage = () => {
  const { data: mapData } = useMapData();
  const { data: trafficStateData } = useTrafficState();

  const [highlightedJunction, setHighlightedJunction] = useState<string | null>(null);
  const [expandedJunction, setExpandedJunction] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) return saved === "true";
    return window.innerWidth >= 768;
  });
  const [junctionSignals, setJunctionSignals] = useState<Record<string, any>>({});
  const [lastFetch, setLastFetch] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());

  const [statuses, setStatuses] = useState<JunctionStatus[]>(
    JUNCTION_CAMERAS.map((j) => ({
      junctionId: j.id,
      name: j.name,
      lastAnalyzed: null,
      density: null,
      vehicleCount: 0,
      pcu: 0,
    }))
  );

  // Poll junction_signals for live signal data
  useEffect(() => {
    const poll = () => {
      fetch(`${BASE_URL}/api/junction_signals`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.junctions) {
            setJunctionSignals(data.junctions);
            setLastFetch(Date.now());
          }
        })
        .catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  // 1-second tick interval for smooth countdown interpolation
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

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

  const mapJunctions = useMemo(
    () => Array.isArray(mapData?.junctions) ? mapData.junctions : [],
    [mapData?.junctions]
  );
  const safeJunctions = useMemo(
    () => mapJunctions.filter(j => {
      const lat = (j as any).lat ?? (j as any).latitude;
      const lng = (j as any).lng ?? (j as any).longitude;
      return typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng);
    }),
    [mapJunctions]
  );
  const mapRoads = useMemo(
    () => Array.isArray(mapData?.roads) ? mapData.roads : [],
    [mapData?.roads]
  );

  // Keep junction statuses synchronized with live signal data
  useEffect(() => {
    const liveJunctions = Array.isArray(mapData?.junctions) ? mapData.junctions : [];
    setStatuses(
      JUNCTION_CAMERAS.map((camera) => {
        const live = liveJunctions.find((j) => j.id === camera.id);
        const sig = junctionSignals[camera.id];
        const liveUpdatedAt = (live as any)?.live_updated_at;
        const lastAnalyzed =
          typeof liveUpdatedAt === "number" && Number.isFinite(liveUpdatedAt)
            ? new Date(liveUpdatedAt * 1000).toISOString()
            : null;

        const sigRoads = sig?.roads || {};
        const sigVehicles = Object.values(sigRoads).reduce(
          (sum: number, rd: any) => sum + (rd?.vehicles ?? 0), 0
        ) as number;

        return {
          junctionId: camera.id,
          name: camera.name,
          lastAnalyzed,
          density: (sig?.density_level as DensityLevel) ?? live?.density ?? null,
          vehicleCount: sigVehicles || (live?.vehicle_count ?? 0),
          pcu: sig?.total_pcu ?? live?.total_pcu ?? 0,
        };
      })
    );
  }, [mapData, junctionSignals]);

  const noopJunctionClick = useCallback(() => {}, []);

  const memoizedRoadStates = useMemo(
    () => trafficStateData?.road_states || {},
    [trafficStateData?.road_states]
  );

  // ── Sidebar content (shared between desktop sidebar & mobile bottom sheet) ──
  const sidebarContent = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">🚦 Junction Analysis</h2>
          <p className="text-xs text-muted-foreground">Live signal status for all 10 junctions</p>
        </div>
        {/* Desktop-only close button */}
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="h-8 w-8 hidden md:inline-flex">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Junction Analysis Status Grid */}
      <div className="grid grid-cols-2 gap-2">
        {statuses.map((s) => {
          const isExpanded = expandedJunction === s.junctionId;
          const sig = junctionSignals[s.junctionId];
          const activeGreen = sig?.active_green_road || "";
          const timeRemaining = Math.max(0, (sig?.time_remaining ?? 0) - Math.floor((now - lastFetch) / 1000));
          const greenDuration = sig?.green_duration ?? 0;
          const roadsData = sig?.roads || {};
          const junction = mapJunctions.find((j: any) => j.id === s.junctionId);
          const incomingIds: string[] = (junction as any)?.incoming_roads || [];
          const activeRoadObj = mapRoads.find((r: any) => r.id === activeGreen);
          const activeRoadName = activeRoadObj?.name || activeGreen || "—";

          return (
            <div
              key={s.junctionId}
              className={`rounded-lg border transition-all duration-300 cursor-pointer text-micro outline-none select-none ${
                isExpanded
                  ? "col-span-2 border-primary bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20 scale-[1.02] z-10 relative"
                  : "border-border bg-card hover:border-primary/50 hover:bg-muted/50 hover:shadow-sm hover:-translate-y-1"
              }`}
              onClick={() => {
                setExpandedJunction(isExpanded ? null : s.junctionId);
                setHighlightedJunction(isExpanded ? null : s.junctionId);
              }}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-medium text-foreground truncate">{s.name}</span>
                  {s.density ? <DensityBadge level={s.density} /> : <Badge variant="outline" className="text-micro px-1.5 py-0">Pending</Badge>}
                </div>
                {isExpanded
                  ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                }
              </div>
              <div className="px-2 pb-1">
                <p className="text-muted-foreground">
                  {s.lastAnalyzed
                    ? `Analyzed: ${new Date(s.lastAnalyzed).toLocaleTimeString()}`
                    : "Not analyzed"}
                </p>
                {s.lastAnalyzed && (
                  <p className="text-muted-foreground">
                    {s.vehicleCount} vehicles · {s.pcu} PCU
                  </p>
                )}
              </div>

              {/* Expanded Section */}
              {isExpanded && sig && (
                <div
                  className="border-t border-border px-3 py-2.5 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Active Signal Info */}
                  <div className="flex items-center justify-between rounded-md px-2.5 py-2" style={{ background: "rgba(34,197,94,0.08)" }}>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#16a34a" }}>🚦 Active Signal</div>
                      <div className="text-xs mt-0.5">🟢 <strong>{activeRoadName}</strong> — {greenDuration}s green</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold tabular-nums" style={{ color: timeRemaining > 5 ? "#16a34a" : "#ef4444" }}>{timeRemaining}s</div>
                      <div className="text-micro text-muted-foreground">remaining</div>
                    </div>
                  </div>

                  {/* Incoming Roads Table */}
                  <div>
                    <div className="text-micro font-semibold text-muted-foreground mb-1">INCOMING ROADS</div>
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px] text-xs" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "hsl(var(--muted))" }}>
                          <th className="text-left px-1.5 py-1 font-medium">⚡</th>
                          <th className="text-left px-1.5 py-1 font-medium">ID</th>
                          <th className="text-left px-1.5 py-1 font-medium">Name</th>
                          <th className="text-right px-1.5 py-1 font-medium">PCU</th>
                          <th className="text-right px-1.5 py-1 font-medium">Vehs</th>
                          <th className="text-right px-1.5 py-1 font-medium">Wait</th>
                          <th className="text-center px-1.5 py-1 font-medium">Dens</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomingIds.map((rId) => {
                          const rd = roadsData[rId];
                          const roadObj = mapRoads.find((r: any) => r.id === rId);
                          const isGreen = rd?.signal === "GREEN";
                          return (
                            <tr
                              key={rId}
                              style={{
                                background: isGreen ? "rgba(34,197,94,0.1)" : "transparent",
                                opacity: isGreen ? 1 : 0.75,
                              }}
                            >
                              <td className="px-1.5 py-1">{isGreen ? "🟢" : "🔴"}</td>
                              <td className="px-1.5 py-1 font-mono">{rId}</td>
                              <td className="px-1.5 py-1 max-w-[100px] truncate">{roadObj?.name || "—"}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums">{rd?.pcu ?? "—"}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums">{rd?.vehicles ?? "—"}</td>
                              <td className="px-1.5 py-1 text-right tabular-nums" style={{ color: !isGreen && (rd?.wait_time ?? 0) > 0 ? "#ef4444" : undefined }}>
                                {!isGreen && (rd?.wait_time ?? 0) > 0 ? `${rd.wait_time}s` : "—"}
                              </td>
                              <td className="px-1.5 py-1 text-center">
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: getDensityDotColor(rd?.density),
                                    border: "1px solid rgba(255,255,255,0.3)",
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {incomingIds.length === 0 && (
                          <tr><td colSpan={7} className="px-1.5 py-2 text-center text-muted-foreground">No incoming roads</td></tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  {/* Insight */}
                  {activeGreen && (
                    <p className="text-micro text-muted-foreground italic">
                      💡 {activeRoadName} has the highest pressure score → selected for GREEN
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-full w-full overflow-hidden">
      {/* ═══ MAP — always full width on mobile ═══ */}
      <div className="flex-1 min-h-0 overflow-hidden relative order-1 md:order-2" style={{ isolation: "isolate" }}>
        <TrafficMap
          junctions={safeJunctions}
          roads={mapRoads}
          roadStates={memoizedRoadStates}
          flyTo={null}
          onJunctionClick={noopJunctionClick}
          highlightJunctionId={highlightedJunction || undefined}
        />
      </div>

      {/* ═══ DESKTOP SIDEBAR (hidden on mobile) ═══ */}
      <div
        className={`
          hidden md:block order-2 md:order-1 flex-shrink-0 border-r border-border bg-card transition-all duration-300
          ${sidebarOpen ? "w-[min(340px,42vw)]" : "w-12 overflow-hidden"}
        `}
      >
        {!sidebarOpen ? (
          <div className="flex h-full w-12 flex-col items-center pt-3 gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="h-8 w-8">
              <PanelLeft className="h-4 w-4" />
            </Button>
            <span className="text-micro text-muted-foreground [writing-mode:vertical-lr] rotate-180 tracking-widest">JUNCTIONS</span>
          </div>
        ) : (
          <div className="h-full w-full overflow-y-auto overflow-x-hidden">
            {sidebarContent}
          </div>
        )}
      </div>

      {/* ═══ MOBILE BOTTOM SHEET (hidden on desktop) ═══ */}
      <BottomSheet peekLabel="Junction Analysis" peekIcon="🚦">
        {sidebarContent}
      </BottomSheet>
    </div>
  );
};

export default UserMapPage;
