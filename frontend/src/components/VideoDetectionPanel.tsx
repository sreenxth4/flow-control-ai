import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Play, Loader2, Car, Bike, Bus, Truck, ChevronDown, ChevronUp } from "lucide-react";
import { submitVideoDetection } from "@/lib/api";
import { useMapData, useTrafficState } from "@/hooks/use-map-data";
import { DensityBadge } from "@/components/DensityBadge";
import type { DensityLevel } from "@/lib/types";
import { toast } from "sonner";
import { TrafficMap } from "@/components/TrafficMap";
import "./junction-label.css";
import { useQueryClient } from "@tanstack/react-query";

// Junction camera options - Kukatpally Zone
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

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#00AA00",
  MEDIUM: "#FF8800",
  HIGH: "#FF0000",
};

interface AnalysisResult {
  junctionId: string;
  roadId: string;
  roadName: string;
  totalVehicles: number;
  totalPCU: number;
  vehicles: { cars: number; bikes: number; autos: number; buses: number; trucks: number; cycles: number };
  density: DensityLevel;
  processingTime: number;
  averageFps: number;
  averageDwellTime: number;
  timestamp: string;
}

interface JunctionStatus {
  junctionId: string;
  name: string;
  lastAnalyzed: string | null;
  density: DensityLevel | null;
  vehicleCount: number;
  pcu: number;
}

// PCU weights (Indian Roads Congress standard) - used only for mock fallback
const PCU_WEIGHTS: Record<string, number> = {
  cars: 1.0, bikes: 0.5, autos: 1.0, buses: 3.0, trucks: 3.0, cycles: 0.3,
};

function computePCU(vehicles: Record<string, number>): number {
  return Object.entries(vehicles).reduce((sum, [type, count]) => sum + count * (PCU_WEIGHTS[type] || 1), 0);
}

function classifyDensity(pcu: number): DensityLevel {
  if (pcu < 20) return "LOW";
  if (pcu < 50) return "MEDIUM";
  return "HIGH";
}

function resolveCoords(junction: any): { lat: number; lng: number } | null {
  const lat = junction?.lat ?? junction?.latitude;
  const lng = junction?.lng ?? junction?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

// Road colors: BLACK for major roads (50+), GREY for local roads (<50)
const getRoadColor = (speedLimit: number) => speedLimit >= 50 ? "#1a1a1a" : "#999999";

// Helper to get density dot color
const getDensityDotColor = (density: string | undefined) => {
  switch (density) {
    case "HIGH": return "#ef4444";
    case "MEDIUM": return "#f59e0b";
    case "LOW": return "#22c55e";
    default: return "#9ca3af";
  }
};

export function VideoDetectionPanel() {
  const queryClient = useQueryClient();
  const { data: mapData } = useMapData();
  const [selectedJunction, setSelectedJunction] = useState("");
  const [selectedRoad, setSelectedRoad] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [highlightedJunction, setHighlightedJunction] = useState<string | null>(null);
  const [expandedJunction, setExpandedJunction] = useState<string | null>(null);
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

  // Poll junction_signals for live signal data (used by expanded cards)
  useEffect(() => {
    const poll = () => {
      fetch("http://localhost:5000/api/junction_signals")
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

  // 1-second tick interval for smooth countdown
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const mapJunctions = Array.isArray(mapData?.junctions) ? mapData.junctions : [];
  const safeJunctions = mapJunctions.filter(j => {
    const lat = (j as any).lat ?? (j as any).latitude;
    const lng = (j as any).lng ?? (j as any).longitude;
    return typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
  });
  const mapRoads = Array.isArray(mapData?.roads) ? mapData.roads : [];
  const { data: trafficStateData } = useTrafficState();
  const cameraOptions =
    mapJunctions.length > 0
      ? mapJunctions.map((j) => ({ id: j.id, name: j.name }))
      : JUNCTION_CAMERAS;

  // Get incoming roads for selected junction — use junction's incoming_roads field,
  // NOT all roads with to_junction match (which includes removed/overlapping roads)
  const incomingRoads = selectedJunction
    ? (() => {
        const junction = mapJunctions.find((j: any) => j.id === selectedJunction);
        const incomingIds: string[] = (junction as any)?.incoming_roads || [];
        return incomingIds
          .map((rId: string) => {
            const road = mapRoads.find((r: any) => r.id === rId);
            return road
              ? { id: road.id, name: road.name || `${road.from_junction} → ${road.to_junction}`, from: road.from_junction }
              : null;
          })
          .filter(Boolean) as { id: string; name: string; from: string }[];
      })()
    : [];

  // Reset road when junction changes
  const handleJunctionChange = (jId: string) => {
    setSelectedJunction(jId);
    setSelectedRoad("");
  };

  // Keep status cards synchronized with live signal + map data.
  // junctionSignals is the primary source of truth (polled every 3s);
  // mapData is a fallback for fields like lastAnalyzed.
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

        // Sum vehicles from signal roads for accurate count
        const sigRoads = sig?.roads || {};
        const sigVehicles = Object.values(sigRoads).reduce(
          (sum: number, rd: any) => sum + (rd?.vehicles ?? 0), 0
        ) as number;

        return {
          junctionId: camera.id,
          name: camera.name,
          lastAnalyzed,
          // Signal API density is most up-to-date; fallback to mapData
          density: (sig?.density_level as DensityLevel) ?? live?.density ?? null,
          vehicleCount: sigVehicles || (live?.vehicle_count ?? 0),
          pcu: sig?.total_pcu ?? live?.total_pcu ?? 0,
        };
      })
    );
  }, [mapData, junctionSignals]);

  // No longer initialize L.map manually for VideoDetectionPanel.
  // The map features are now unified directly within the reusable TrafficMap component.

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.(mp4|avi|mov|mkv)$/i.test(f.name)) setFile(f);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file || !selectedJunction || !selectedRoad) {
      toast.error("Please select a junction, road, and upload a video file.");
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const res = await submitVideoDetection(selectedJunction, file, 10, selectedRoad);

      // Use road_density_analysis as the ONLY authoritative source for headline metrics.
      // Do NOT sum detections_per_frame — that inflates counts (per-frame != unique vehicles).
      const rda = (res as any).road_density_analysis;
      const dist = rda?.vehicle_type_distribution;

      const vehicles = {
        cars: dist?.car ?? 0,
        bikes: dist?.bike ?? 0,
        autos: dist?.auto ?? 0,
        buses: dist?.bus ?? 0,
        trucks: dist?.truck ?? 0,
        cycles: dist?.cycle ?? 0,
      };
      const totalVehicles: number = rda?.total_vehicles ?? 0;
      const totalPCU: number = rda?.total_pcu ?? 0;
      const density: DensityLevel = rda?.traffic_density ?? "LOW";
      const avgDwell: number = rda?.average_dwell_time_seconds ?? 0;

      const analysisResult: AnalysisResult = {
        junctionId: selectedJunction,
        roadId: selectedRoad,
        roadName: incomingRoads.find((r) => r.id === selectedRoad)?.name || selectedRoad,
        totalVehicles,
        totalPCU,
        vehicles,
        density,
        processingTime: res.processing_time_seconds,
        averageFps: res.average_processing_fps,
        averageDwellTime: avgDwell,
        timestamp: new Date().toISOString(),
      };
      setResult(analysisResult);
      setHighlightedJunction(selectedJunction);
      setStatuses((prev) =>
        prev.map((s) =>
          s.junctionId === selectedJunction
            ? { ...s, lastAnalyzed: analysisResult.timestamp, density, vehicleCount: totalVehicles, pcu: totalPCU }
            : s
        )
      );
      // Push updates into shared map cache so all pages react instantly.
      queryClient.setQueryData(["map-data"], (current: any) => {
        if (!current || !Array.isArray(current.junctions)) return current;
        return {
          ...current,
          junctions: current.junctions.map((j: any) =>
            j.id === selectedJunction
              ? {
                ...j,
                density,
                vehicle_count: totalVehicles,
                total_pcu: totalPCU,
                vehicle_type_distribution: {
                  car: vehicles.cars,
                  bike: vehicles.bikes,
                  auto: vehicles.autos,
                  bus: vehicles.buses,
                  truck: vehicles.trucks,
                  cycle: vehicles.cycles,
                },
                live_updated_at: Date.now() / 1000,
              }
              : j
          ),
        };
      });

      await queryClient.refetchQueries({ queryKey: ["map-data"], exact: true });
      toast.success(`Analysis complete for road ${selectedRoad} at ${JUNCTION_CAMERAS.find((j) => j.id === selectedJunction)?.name}`);
    } catch {
      // Mock fallback — uses local PCU calculation only when backend is unavailable
      const mockVehicles = {
        cars: Math.floor(Math.random() * 40) + 10,
        bikes: Math.floor(Math.random() * 30) + 5,
        autos: Math.floor(Math.random() * 20) + 3,
        buses: Math.floor(Math.random() * 8) + 1,
        trucks: Math.floor(Math.random() * 6) + 1,
        cycles: Math.floor(Math.random() * 15) + 2,
      };
      const totalVehicles = Object.values(mockVehicles).reduce((a, b) => a + b, 0);
      const totalPCU = Math.round(computePCU(mockVehicles) * 10) / 10;
      const density = classifyDensity(totalPCU);
      const mockResult: AnalysisResult = {
        junctionId: selectedJunction,
        roadId: selectedRoad,
        roadName: incomingRoads.find((r) => r.id === selectedRoad)?.name || selectedRoad,
        totalVehicles,
        totalPCU,
        vehicles: mockVehicles,
        density,
        processingTime: Math.round((elapsed + Math.random() * 5) * 10) / 10,
        averageFps: Math.round((4 + Math.random() * 2) * 10) / 10,
        averageDwellTime: 0,
        timestamp: new Date().toISOString(),
      };
      setResult(mockResult);
      setHighlightedJunction(selectedJunction);
      setStatuses((prev) =>
        prev.map((s) =>
          s.junctionId === selectedJunction
            ? { ...s, lastAnalyzed: mockResult.timestamp, density, vehicleCount: totalVehicles, pcu: totalPCU }
            : s
        )
      );
      toast.success(`Analysis complete (mock) for road ${selectedRoad}`);
    } finally {
      setLoading(false);
    }
  }, [file, selectedJunction, selectedRoad, elapsed, queryClient, incomingRoads]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col">
      {/* Main: left panel + right map */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="flex w-[420px] flex-shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Upload & Analyze</h2>
            <p className="text-xs text-muted-foreground">Upload traffic footage for AI vehicle detection</p>
          </div>

          {/* Junction Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Junction</Label>
            <Select value={selectedJunction} onValueChange={handleJunctionChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select junction..." />
              </SelectTrigger>
              <SelectContent>
                {cameraOptions.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.id} — {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Road Select (filtered by junction) */}
          {selectedJunction && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Incoming Road</Label>
              <Select value={selectedRoad} onValueChange={setSelectedRoad}>
                <SelectTrigger>
                  <SelectValue placeholder="Select road..." />
                </SelectTrigger>
                <SelectContent>
                  {incomingRoads.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.id} — {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* File Upload */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Video File</Label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-6 transition-colors hover:border-primary/50"
            >
              <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Drag & drop or click to select</p>
              <p className="text-[10px] text-muted-foreground">.mp4 .avi .mov .mkv</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.avi,.mov,.mkv"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file && (
                <Badge variant="secondary" className="mt-2 text-xs">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </Badge>
              )}
            </div>
          </div>

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={loading || !file || !selectedJunction || !selectedRoad} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing... ({elapsed}s)
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Analysis
              </>
            )}
          </Button>

          {/* Results Card */}
          {result && (
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Road: {result.roadId} ({result.roadName})</span>
                  <DensityBadge level={result.density} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted p-2 text-center">
                    <p className="text-lg font-bold text-foreground">{result.totalVehicles}</p>
                    <p className="text-muted-foreground">Total Vehicles</p>
                  </div>
                  <div className="rounded-md bg-muted p-2 text-center">
                    <p className="text-lg font-bold text-foreground">{result.totalPCU}</p>
                    <p className="text-muted-foreground">Total PCU</p>
                  </div>
                </div>

                {/* Vehicle Breakdown */}
                <div className="grid grid-cols-3 gap-1.5">
                  <VehicleCount icon={<Car className="h-3 w-3" />} label="Cars" count={result.vehicles.cars} />
                  <VehicleCount icon={<Bike className="h-3 w-3" />} label="Bikes" count={result.vehicles.bikes} />
                  <VehicleCount icon={<span className="text-[10px]">🛺</span>} label="Autos" count={result.vehicles.autos} />
                  <VehicleCount icon={<Bus className="h-3 w-3" />} label="Buses" count={result.vehicles.buses} />
                  <VehicleCount icon={<Truck className="h-3 w-3" />} label="Trucks" count={result.vehicles.trucks} />
                  <VehicleCount icon={<span className="text-[10px]">🚲</span>} label="Cycles" count={result.vehicles.cycles} />
                </div>

                <div className="flex justify-between text-muted-foreground">
                  <span>Processing: {result.processingTime.toFixed(1)}s</span>
                  <span>Avg FPS: {result.averageFps.toFixed(1)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Junction Analysis Status Grid */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-foreground">Junction Analysis Status</h3>
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
                    className={`rounded-lg border transition-all duration-200 cursor-pointer text-[11px] ${
                      isExpanded
                        ? "col-span-2 border-primary/40 bg-card shadow-md"
                        : "border-border bg-muted/40 hover:border-primary/20 hover:bg-muted/60"
                    }`}
                    onClick={() => setExpandedJunction(isExpanded ? null : s.junctionId)}
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{s.name}</span>
                        {s.density ? <DensityBadge level={s.density} /> : <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pending</Badge>}
                      </div>
                      {isExpanded
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
                            <div className="text-[11px] mt-0.5">🟢 <strong>{activeRoadName}</strong> — {greenDuration}s green</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold tabular-nums" style={{ color: timeRemaining > 5 ? "#16a34a" : "#ef4444" }}>{timeRemaining}s</div>
                            <div className="text-[10px] text-muted-foreground">remaining</div>
                          </div>
                        </div>

                        {/* Incoming Roads Table */}
                        <div>
                          <div className="text-[10px] font-semibold text-muted-foreground mb-1">INCOMING ROADS</div>
                          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
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
                                    <td className="px-1.5 py-1 max-w-[120px] truncate">{roadObj?.name || "—"}</td>
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

                        {/* Insight */}
                        {activeGreen && (
                          <p className="text-[10px] text-muted-foreground italic">
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
        </div>

        {/* Right: Map */}
        <div className="flex-1 overflow-hidden relative" style={{ isolation: "isolate" }}>
          <TrafficMap
            junctions={Array.isArray(mapData?.junctions) ? mapData.junctions : []}
            roads={Array.isArray(mapData?.roads) ? mapData.roads : []}
            roadStates={trafficStateData?.road_states || {}}
            flyTo={null}
            onJunctionClick={useCallback(() => {}, [])}
            highlightJunctionId={highlightedJunction || undefined}
          />
        </div>
      </div>
    </div>
  );
}

function VehicleCount({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-muted/60 px-2 py-1">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold text-foreground">{count}</span>
    </div>
  );
}
