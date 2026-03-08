import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DensityBadge } from "@/components/DensityBadge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMapData, usePerformance, useHealth } from "@/hooks/use-map-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Gauge, Signal, CheckCircle, XCircle, Video, Clock } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DensityLevel, Junction, Road } from "@/lib/types";

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
};

export function TrafficDashboard() {
  const { data: mapData, isLoading: mapLoading } = useMapData();
  const { data: perf, isLoading: perfLoading } = usePerformance();
  const { data: health, isLoading: healthLoading } = useHealth();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [17.4935, 78.3990],
      zoom: 16,
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

    const junctionMap = new Map<string, Junction>();
    mapData.junctions.forEach((j) => junctionMap.set(j.id, j));

    // Roads
    mapData.roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;
      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        { color: "hsl(210, 60%, 50%)", weight: Math.max(2, road.lanes), opacity: 0.5, dashArray: road.lanes <= 2 ? "6 4" : undefined }
      );
      line.bindPopup(`<div class="text-sm"><strong>${road.name}</strong><br/>Lanes: ${road.lanes} · ${road.speed_limit} km/h · ${road.length_km} km</div>`);
      layers.addLayer(line);
    });

    // Junctions
    mapData.junctions.forEach((j) => {
      const color = j.density ? DENSITY_COLORS[j.density] : "#6b7280";
      const marker = L.circleMarker([j.lat, j.lng], {
        radius: 11,
        fillColor: color,
        fillOpacity: 0.85,
        color: "#374151",
        weight: 1.5,
      });
      const pcuInfo = j.vehicle_count != null && j.total_pcu != null ? `<br/>${j.vehicle_count} vehicles (${j.total_pcu} PCU)` : "";
      marker.bindPopup(`<div class="text-sm"><strong>${j.name}</strong> (${j.id})<br/>Density: ${j.density || "No data"}${pcuInfo}</div>`);
      layers.addLayer(marker);
    });
  }, [mapData]);

  // Group signal phases by junction
  const phasesByJunction = mapData
    ? mapData.junctions.map((j) => ({
        junction: j,
        phases: mapData.signal_phases.filter((sp) => sp.junction_id === j.id),
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
              <Signal className="h-4 w-4 text-traffic-medium" /> Signal Phases — All Junctions
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
                          {phases.map((sp) => (
                            <TableRow key={sp.phase_name}>
                              <TableCell className="text-sm">{(sp.phase_name ?? "").replace(junction.name + " ", "")}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {sp.green_roads.map((r) => (
                                    <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
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
                    <span className="font-medium text-foreground">{perf.summary.total_frames}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Average FPS</span>
                    <span className="font-medium text-foreground">{perf.summary.average_fps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Time</span>
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {perf.summary.total_time}s
                    </span>
                  </div>
                  {/* Breakdown bar */}
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Breakdown</p>
                    <PerfBar label="Detection" value={perf.performance_profile.detect_time} total={perf.performance_profile.total_time} />
                    <PerfBar label="Tracking" value={perf.performance_profile.track_time} total={perf.performance_profile.total_time} />
                    <PerfBar label="Analysis" value={perf.performance_profile.analyze_time} total={perf.performance_profile.total_time} />
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
