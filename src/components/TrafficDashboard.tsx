import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DensityBadge } from "@/components/DensityBadge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMapData, usePerformance, useHealth } from "@/hooks/use-map-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Gauge, Signal, CheckCircle, XCircle, Clock } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DensityLevel, Junction } from "@/lib/types";

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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

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

  // Update markers + roads
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !mapData) return;
    layers.clearLayers();

    const safeJunctions = Array.isArray(mapData.junctions) ? mapData.junctions : [];
    const safeRoads = Array.isArray(mapData.roads) ? mapData.roads : [];

    const junctionMap = new Map<string, Junction>();
    safeJunctions.forEach((j) => {
      const coords = resolveCoords(j);
      if (!coords) return;
      junctionMap.set(j.id, { ...j, lat: coords.lat, lng: coords.lng });
    });

    // Roads
    safeRoads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;
      if (!isValidCoord(from.lat, from.lng) || !isValidCoord(to.lat, to.lng)) return;

      const roadColor = getRoadColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        {
          color: roadColor,
          weight,
          opacity: 0.7,
        }
      );
      
      const baseCost = ((road.length_km / road.speed_limit) * 3600).toFixed(1);
      line.bindPopup(
        `<div style="min-width:160px">
          <strong>${road.name}</strong><br/>
          <span style="color:#666">${road.from_junction} → ${road.to_junction}</span><br/>
          Length: ${(road.length_km * 1000).toFixed(0)}m | Speed: ${road.speed_limit} km/h<br/>
          Lanes: ${road.lanes} | Base Cost: ${baseCost}s
        </div>`
      );
      layers.addLayer(line);
    });

    // Junctions
    safeJunctions.forEach((j) => {
      const coords = resolveCoords(j);
      if (!coords || !isValidCoord(coords.lat, coords.lng)) return;

      const color = j.density ? DENSITY_COLORS[j.density] : "#CCCCCC";
      const radius = getMarkerSize(j.vehicle_count);

      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#fff",
        weight: 2,
      });
      const pcuInfo = j.vehicle_count != null && j.total_pcu != null ? `<br/>${j.vehicle_count} vehicles (${j.total_pcu} PCU)` : "";
      marker.bindPopup(`<div style="min-width:160px"><strong>${j.id}: ${j.name}</strong><br/>Density: ${j.density || "No data"}${pcuInfo}</div>`);
      layers.addLayer(marker);
    });
  }, [mapData]);

  // Group signal phases by junction
  const safeJunctions = mapData && Array.isArray(mapData.junctions) ? mapData.junctions : [];
  const safeSignalPhases = mapData && Array.isArray((mapData as any).signal_phases) ? (mapData as any).signal_phases : [];
  const phasesByJunction = mapData
    ? safeJunctions.map((j) => ({
        junction: j,
        phases: safeSignalPhases.filter((sp) => sp?.junction_id === j.id),
      }))
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Map */}
      <div className="h-[45vh] min-h-[300px] flex-shrink-0">
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>

      {/* Content below map */}
      <div className="space-y-5 p-5">
        {/* Signal Phases Accordion */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Signal className="h-4 w-4 text-traffic-medium" /> Signal Phases — Kukatpally Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mapLoading ? (
              <Skeleton className="h-40" />
            ) : (
              <Accordion type="multiple" className="w-full">
                {phasesByJunction.map(({ junction, phases }) => (
                  <AccordionItem key={junction.id} value={junction.id}>
                    <AccordionTrigger className="text-sm hover:no-underline">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{junction.id} — {junction.name}</span>
                        <DensityBadge level={junction.density} />
                        <span className="text-xs text-muted-foreground">{phases.length} phases</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Phase Name</TableHead>
                            <TableHead>Green Roads</TableHead>
                            <TableHead className="text-right">Min Green (s)</TableHead>
                            <TableHead className="text-right">Max Green (s)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {phases.map((sp, idx) => (
                            <TableRow key={`${junction.id}-${sp.phase_name || "phase"}-${idx}`}>
                              <TableCell className="text-sm">{(sp.phase_name ?? "").replace(junction.name + " ", "")}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {(Array.isArray(sp?.green_roads) ? sp.green_roads : []).map((r, roadIdx) => (
                                    <Badge key={`${junction.id}-${sp.phase_name || "phase"}-${r}-${roadIdx}`} variant="outline" className="text-xs">{r}</Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{sp.min_green}</TableCell>
                              <TableCell className="text-right">{sp.max_green}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Health + Performance */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* System Health */}
          <Card>
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
          <Card>
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
                      {perf.summary?.total_time ?? perf.summary?.processing_time_seconds ?? 0}s
                    </span>
                  </div>
                  {/* Breakdown bar */}
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Breakdown</p>
                    <PerfBar label="Detection" value={perf.performance_profile?.detect_time ?? perf.performance_profile?.detect_seconds ?? 0} total={perf.performance_profile?.total_time ?? perf.performance_profile?.total_seconds ?? 0} />
                    <PerfBar label="Tracking" value={perf.performance_profile?.track_time ?? perf.performance_profile?.track_seconds ?? 0} total={perf.performance_profile?.total_time ?? perf.performance_profile?.total_seconds ?? 0} />
                    <PerfBar label="Analysis" value={perf.performance_profile?.analyze_time ?? perf.performance_profile?.analyze_seconds ?? 0} total={perf.performance_profile?.total_time ?? perf.performance_profile?.total_seconds ?? 0} />
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
