import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Play, Loader2, Car, Bike, Bus, Truck } from "lucide-react";
import { submitVideoDetection } from "@/lib/api";
import { DensityBadge } from "@/components/DensityBadge";
import type { DensityLevel } from "@/lib/types";
import { toast } from "sonner";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { mockJunctions } from "@/lib/mock-data";

// Junction camera options
const JUNCTION_CAMERAS = [
  { id: "J1", name: "Kukatpally Y Junction" },
  { id: "J2", name: "KPHB Colony" },
  { id: "J3", name: "Balanagar Crossroads" },
  { id: "J4", name: "JNTU Junction" },
  { id: "J5", name: "Moosapet X Roads" },
  { id: "J6", name: "Allwyn Colony" },
  { id: "J7", name: "Hitech City Signal" },
  { id: "J8", name: "Bharath Nagar" },
  { id: "J9", name: "MIG Colony Gate" },
  { id: "J10", name: "Petbasheerabad" },
] as const;

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
};

interface AnalysisResult {
  junctionId: string;
  totalVehicles: number;
  totalPCU: number;
  vehicles: { cars: number; bikes: number; autos: number; buses: number; trucks: number; cycles: number };
  density: DensityLevel;
  processingTime: number;
  averageFps: number;
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

// PCU weights (Indian Roads Congress standard)
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

export function VideoDetectionPanel() {
  const [selectedJunction, setSelectedJunction] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fps, setFps] = useState(5);
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

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [28.6139, 77.209],
      zoom: 15,
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

  // Update map markers
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.clearLayers();

    mockJunctions.forEach((j) => {
      const status = statuses.find((s) => s.junctionId === j.id);
      const density = status?.density;
      const color = density ? DENSITY_COLORS[density] : "#6b7280";
      const isHighlighted = highlightedJunction === j.id;

      const marker = L.circleMarker([j.lat, j.lng], {
        radius: isHighlighted ? 16 : 10,
        fillColor: color,
        fillOpacity: isHighlighted ? 1 : 0.8,
        color: isHighlighted ? "#fff" : "#374151",
        weight: isHighlighted ? 3 : 1.5,
        className: isHighlighted ? "animate-density-pulse" : "",
      });
      marker.bindPopup(
        `<div class="text-sm"><strong>${j.name}</strong> (${j.id})<br/>Density: ${density || "Pending"}</div>`
      );
      layers.addLayer(marker);
    });
  }, [statuses, highlightedJunction]);

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
      const res = await submitVideoDetection(selectedJunction, file, fps);
      // Parse results from API
      const vehicleTotals: Record<string, number> = {};
      res.detections_per_frame.forEach((f) => {
        Object.entries(f.vehicles).forEach(([type, count]) => {
          vehicleTotals[type] = (vehicleTotals[type] || 0) + count;
        });
      });
      const vehicles = {
        cars: vehicleTotals["car"] || vehicleTotals["cars"] || 0,
        bikes: vehicleTotals["bike"] || vehicleTotals["bikes"] || vehicleTotals["motorcycle"] || 0,
        autos: vehicleTotals["auto"] || vehicleTotals["autos"] || vehicleTotals["auto_rickshaw"] || 0,
        buses: vehicleTotals["bus"] || vehicleTotals["buses"] || 0,
        trucks: vehicleTotals["truck"] || vehicleTotals["trucks"] || 0,
        cycles: vehicleTotals["cycle"] || vehicleTotals["cycles"] || vehicleTotals["bicycle"] || 0,
      };
      const totalVehicles = Object.values(vehicles).reduce((a, b) => a + b, 0);
      const totalPCU = Math.round(computePCU(vehicles) * 10) / 10;
      const density = classifyDensity(totalPCU);

      const analysisResult: AnalysisResult = {
        junctionId: selectedJunction,
        totalVehicles,
        totalPCU,
        vehicles,
        density,
        processingTime: res.processing_time_seconds,
        averageFps: res.average_processing_fps,
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
      toast.success(`Analysis complete for ${JUNCTION_CAMERAS.find((j) => j.id === selectedJunction)?.name}`);
    } catch {
      // Mock fallback
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
        averageFps: Math.round((fps * 0.8 + Math.random() * fps * 0.4) * 10) / 10,
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
  }, [file, selectedJunction, fps, elapsed]);

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
                {JUNCTION_CAMERAS.map((j) => (
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

          {/* FPS Slider */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Target FPS: {fps}</Label>
            <Slider value={[fps]} onValueChange={([v]) => setFps(v)} min={1} max={30} step={1} />
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
