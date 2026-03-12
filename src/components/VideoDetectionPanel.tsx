import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Play, Loader2, Car, Bike, Bus, Truck } from "lucide-react";
import { submitVideoDetection } from "@/lib/api";
import { useMapData } from "@/hooks/use-map-data";
import { DensityBadge } from "@/components/DensityBadge";
import type { DensityLevel } from "@/lib/types";
import { toast } from "sonner";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/components/map-styles.css";
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

export function VideoDetectionPanel() {
  const queryClient = useQueryClient();
  const { data: mapData } = useMapData();
  const [selectedJunction, setSelectedJunction] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [highlightedJunction, setHighlightedJunction] = useState<string | null>(null);
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

  const mapJunctions = Array.isArray(mapData?.junctions) ? mapData.junctions : [];
  const cameraOptions =
    mapJunctions.length > 0
      ? mapJunctions.map((j) => ({ id: j.id, name: j.name }))
      : JUNCTION_CAMERAS;

  // Keep status cards synchronized with persisted backend metrics.
  useEffect(() => {
    const liveJunctions = Array.isArray(mapData?.junctions) ? mapData.junctions : [];
    if (liveJunctions.length === 0) return;

    setStatuses(
      JUNCTION_CAMERAS.map((camera) => {
        const live = liveJunctions.find((j) => j.id === camera.id);
        const liveUpdatedAt = (live as any)?.live_updated_at;
        const lastAnalyzed =
          typeof liveUpdatedAt === "number" && Number.isFinite(liveUpdatedAt)
            ? new Date(liveUpdatedAt * 1000).toISOString()
            : null;

        return {
          junctionId: camera.id,
          name: camera.name,
          lastAnalyzed,
          density: live?.density ?? null,
          vehicleCount: live?.vehicle_count ?? 0,
          pcu: live?.total_pcu ?? 0,
        };
      })
    );
  }, [mapData]);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Timer for elapsed
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const start = Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  // Init map - Kukatpally center
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [17.49, 78.38],
      zoom: 14,
      zoomControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layersRef.current = null; };
  }, []);

  // Update map markers + roads
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.clearLayers();

    // Draw roads first (under markers)
    const safeRoads = Array.isArray(mapData?.roads) ? mapData!.roads : [];
    const junctionCoordMap = new Map<string, { lat: number; lng: number }>();
    (Array.isArray(mapData?.junctions) ? mapData!.junctions : []).forEach((j: any) => {
      const c = resolveCoords(j);
      if (c) junctionCoordMap.set(j.id, c);
    });
    safeRoads.forEach((road: any) => {
      const from = junctionCoordMap.get(road.from_junction);
      const to = junctionCoordMap.get(road.to_junction);
      if (!from || !to) return;
      const roadColor = getRoadColor(road.speed_limit);
      const weight = 1.5 + (road.lanes ?? 1) * 0.75;
      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        { color: roadColor, weight, opacity: 0.7 }
      );
      const lengthM = (road.length_km * 1000).toFixed(0);
      const baseCost = ((road.length_km / road.speed_limit) * 3600).toFixed(1);
      line.bindTooltip(
        `<div style="min-width:140px;">
          <strong>${road.name}</strong><br/>
          <span style="color:#94a3b8">${road.from_junction} → ${road.to_junction}</span><br/>
          📏 ${lengthM}m &nbsp;|&nbsp; 🚗 ${road.speed_limit} km/h<br/>
          🛣️ ${road.lanes} lanes &nbsp;|&nbsp; ⏱️ ${baseCost}s
        </div>`,
        { sticky: true, direction: "top" }
      );
      layers.addLayer(line);
    });

    const junctionsForMap = mapJunctions.length > 0 ? mapJunctions : JUNCTION_CAMERAS.map((camera) => {
      const fallback = {
        J1: { lat: 17.4947, lng: 78.3872 },
        J2: { lat: 17.4935, lng: 78.3920 },
        J3: { lat: 17.4898, lng: 78.3905 },
        J4: { lat: 17.4962, lng: 78.3838 },
        J5: { lat: 17.4855, lng: 78.3830 },
        J6: { lat: 17.4978, lng: 78.3898 },
        J7: { lat: 17.4885, lng: 78.3785 },
        J8: { lat: 17.5018, lng: 78.3868 },
        J9: { lat: 17.4990, lng: 78.3935 },
        J10: { lat: 17.5042, lng: 78.3832 },
      } as Record<string, { lat: number; lng: number }>;
      const coords = fallback[camera.id] || { lat: 17.49, lng: 78.38 };
      return { ...camera, ...coords };
    });

    junctionsForMap.forEach((j) => {
      const coords = resolveCoords(j);
      if (!coords) return;

      const status = statuses.find((s) => s.junctionId === j.id);
      const density = status?.density;
      const color = density ? DENSITY_COLORS[density] : "#CCCCCC";
      const isHighlighted = highlightedJunction === j.id;
      const radius = isHighlighted ? 16 : 10;
      const borderWidth = isHighlighted ? 3 : 2;

      const markerIcon = L.divIcon({
        className: "junction-marker",
        html: `<div class="junction-circle ${!isHighlighted ? 'animate-density-pulse' : ''}" style="
          width: ${radius * 2}px; 
          height: ${radius * 2}px; 
          background-color: ${color}; 
          border: ${borderWidth}px solid ${isHighlighted ? '#fff' : '#fff'};
          border-radius: 50%;
          opacity: ${isHighlighted ? 1 : 0.9};
        "></div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });

      const marker = L.marker([coords.lat, coords.lng], { icon: markerIcon });
      const densityLabel = density || "Pending";
      marker.bindTooltip(
        `<div style="min-width:140px;">
          <strong>${j.id}: ${j.name}</strong><br/>
          <span style="color:#94a3b8">Density:</span> <strong style="color:${color}">${densityLabel}</strong>
        </div>`,
        { direction: "top", offset: [0, -8] }
      );
      marker.bindPopup(`<div style="min-width:140px"><strong>${j.id}: ${j.name}</strong><br/><span style="color:#94a3b8">Density:</span> ${densityLabel}</div>`);
      layers.addLayer(marker);

      // Junction name label
      const labelText = (j.name || j.id || "").trim() || j.id;
      const labelWidth = Math.min(240, Math.max(64, labelText.length * 7));
      const labelIcon = L.divIcon({
        className: "junction-name-label",
        html: `<div style="display:inline-block; padding:2px 8px; border-radius:6px; background:rgba(15,23,42,0.85); color:#f1f5f9; border:1px solid rgba(100,116,139,0.3); font-size:10px; font-weight:600; line-height:1.3; white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.25);">${labelText}</div>`,
        iconSize: [labelWidth, 20],
        iconAnchor: [Math.floor(labelWidth / 2), -14],
      });
      L.marker([coords.lat, coords.lng], { icon: labelIcon, interactive: false, keyboard: false }).addTo(layers);
    });
  }, [statuses, highlightedJunction, mapJunctions, mapData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.(mp4|avi|mov|mkv)$/i.test(f.name)) setFile(f);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file || !selectedJunction) {
      toast.error("Please select a junction and upload a video file.");
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const res = await submitVideoDetection(selectedJunction, file, 10);

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
      toast.success(`Analysis complete for ${JUNCTION_CAMERAS.find((j) => j.id === selectedJunction)?.name}`);
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
      toast.success(`Analysis complete (mock) for ${JUNCTION_CAMERAS.find((j) => j.id === selectedJunction)?.name}`);
    } finally {
      setLoading(false);
    }
  }, [file, selectedJunction, elapsed, queryClient]);

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
            <Label className="text-xs font-medium">Junction Camera</Label>
            <Select value={selectedJunction} onValueChange={setSelectedJunction}>
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
          <Button onClick={handleSubmit} disabled={loading || !file || !selectedJunction} className="w-full">
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
                  <span>Results: {JUNCTION_CAMERAS.find((j) => j.id === result.junctionId)?.name}</span>
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
              {statuses.map((s) => (
                <div
                  key={s.junctionId}
                  className="rounded-md border border-border bg-muted/40 p-2 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{s.name}</span>
                    {s.density ? <DensityBadge level={s.density} /> : <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pending</Badge>}
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
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
              ))}
            </div>
          </div>
        </div>

        {/* Right: Map */}
        <div className="flex-1">
          <div ref={mapContainerRef} className="h-full w-full" />
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
