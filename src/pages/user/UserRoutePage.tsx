import { useState, useCallback, useEffect, useRef } from "react";
import { useMapData, useFindRoute } from "@/hooks/use-map-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Route, X, ArrowRight, Loader2 } from "lucide-react";
import type { RouteResult, DensityLevel } from "@/lib/types";
import { mockJunctions } from "@/lib/mock-data";
import { toast } from "sonner";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Density colors: GREEN/ORANGE/RED
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#00AA00",
  MEDIUM: "#FF8800",
  HIGH: "#FF0000",
};

// Speed colors
const getSpeedColor = (speedLimit: number) => speedLimit >= 50 ? "#0066FF" : "#00CC00";

// Marker size by vehicle count
const getMarkerSize = (vehicleCount?: number) => Math.min(35, 12 + (vehicleCount || 0) * 0.8);

// One-way roads
const ONE_WAY_ROADS = ["R14", "R38", "R42", "R49", "R58", "R72", "R83", "R85", "R93", "R94"];

const JUNCTIONS = mockJunctions.map((j, i) => ({ ...j, index: i }));
const getJunctionName = (id: string) => JUNCTIONS.find((j) => j.id === id)?.name || id;

const UserRoutePage = () => {
  const { data } = useMapData();
  const findRouteMutation = useFindRoute();

  const [source, setSource] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Init map - Kukatpally center
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
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

  // Update map
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !data) return;
    layers.clearLayers();

    const junctionMap = new Map(data.junctions.map((j) => [j.id, j]));
    const routePath = routeResult?.success ? routeResult.path : null;
    const routeRoadSet = new Set<string>();
    if (routePath && routePath.length > 1) {
      for (let i = 0; i < routePath.length - 1; i++) {
        routeRoadSet.add(`${routePath[i]}-${routePath[i + 1]}`);
      }
    }

    // Roads
    data.roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;
      
      const isOnRoute = routeRoadSet.has(`${road.from_junction}-${road.to_junction}`);
      const isOneWay = ONE_WAY_ROADS.includes(road.id);
      const speedColor = getSpeedColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      layers.addLayer(
        L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
          color: isOnRoute ? "#FF0000" : speedColor,
          weight: isOnRoute ? 6 : weight,
          opacity: isOnRoute ? 1 : 0.5,
          dashArray: isOneWay && !isOnRoute ? "8 6" : undefined,
        })
      );
    });

    // Junctions
    data.junctions.forEach((j) => {
      const isSource = source === j.id;
      const isDest = destination === j.id;
      const isOnRoute = routePath?.includes(j.id);
      const color = isSource ? "#3b82f6" : isDest ? "#ef4444" : j.density ? DENSITY_COLORS[j.density] : "#CCCCCC";
      const radius = isSource || isDest ? 16 : isOnRoute ? 14 : getMarkerSize(j.vehicle_count);

      const marker = L.circleMarker([j.lat, j.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: isOnRoute ? "#FFD700" : "#fff",
        weight: isSource || isDest ? 3 : isOnRoute ? 3 : 1.5,
      });
      const pcuInfo = j.vehicle_count != null && j.total_pcu != null ? `<br/>${j.vehicle_count} vehicles (${j.total_pcu} PCU)` : "";
      marker.bindPopup(`<div style="min-width:140px"><strong>${j.id}: ${j.name}</strong><br/>Density: ${j.density || "N/A"}${pcuInfo}</div>`);
      layers.addLayer(marker);

      // Star marker for route junctions
      if (isOnRoute && mapRef.current) {
        const starIcon = L.divIcon({
          className: 'route-star',
          html: '<div style="color: #FFD700; font-size: 16px; text-shadow: 0 0 2px #000;">⭐</div>',
          iconSize: [16, 16],
          iconAnchor: [8, 20],
        });
        L.marker([j.lat, j.lng], { icon: starIcon, interactive: false }).addTo(layers);
      }
    });
  }, [data, routeResult, source, destination]);

  const handleFindRoute = useCallback(async () => {
    if (!source || !destination) return;
    const srcIdx = parseInt(source.replace("J", "")) - 1;
    const destIdx = parseInt(destination.replace("J", "")) - 1;
    try {
      const result = await findRouteMutation.mutateAsync({ source: srcIdx, destination: destIdx });
      setRouteResult(result);
      if (!result.success) toast.error("No route found between selected junctions");
    } catch {
      toast.error("Backend route service unavailable");
      setRouteResult(null);
    }
  }, [source, destination, findRouteMutation]);

  const handleClear = useCallback(() => {
    setSource("");
    setDestination("");
    setRouteResult(null);
  }, []);

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar */}
      <div className="w-[360px] flex-shrink-0 border-r border-border bg-card">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Route Finder</h2>
              <p className="text-xs text-muted-foreground">Find optimal routes through the Kukatpally traffic network</p>
            </div>

            {/* Source */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <MapPin className="h-3 w-3 text-primary" /> Source Junction
              </Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
                <SelectContent>
                  {JUNCTIONS.map((j) => (
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
                  {JUNCTIONS.map((j) => (
                    <SelectItem key={j.id} value={j.id} disabled={j.id === source}>
                      {j.id} — {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button onClick={handleFindRoute} disabled={!source || !destination || findRouteMutation.isPending} className="flex-1">
                {findRouteMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finding...</>
                ) : (
                  <><Route className="mr-2 h-4 w-4" /> Find Route</>
                )}
              </Button>
              {(source || destination || routeResult) && (
                <Button variant="outline" onClick={handleClear}><X className="h-4 w-4" /></Button>
              )}
            </div>

            {/* Legend */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Legend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#00AA00" }} />
                  <span>LOW density (0-10 vehicles)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#FF8800" }} />
                  <span>MEDIUM density (11-25 vehicles)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: "#FF0000" }} />
                  <span>HIGH density (26+ vehicles)</span>
                </div>
                <div className="mt-2 border-t pt-2">
                  <div className="flex items-center gap-2">
                    <span className="h-0.5 w-4" style={{ backgroundColor: "#00CC00" }} />
                    <span>Local roads (40 km/h)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-0.5 w-4" style={{ backgroundColor: "#0066FF" }} />
                    <span>Major roads (50+ km/h)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Route Result */}
            {routeResult && routeResult.success && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Route Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {/* Path */}
                  <div className="flex flex-wrap items-center gap-1">
                    {routeResult.path.map((id, i) => (
                      <span key={id} className="flex items-center">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{getJunctionName(id)}</span>
                        {i < routeResult.path.length - 1 && <ArrowRight className="mx-0.5 h-3 w-3 text-muted-foreground" />}
                      </span>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-muted p-2 text-center">
                      <p className="text-lg font-bold text-foreground">{routeResult.total_cost.toFixed(1)}s</p>
                      <p className="text-muted-foreground">Total Time</p>
                    </div>
                    <div className="rounded-md bg-muted p-2 text-center">
                      <p className="text-lg font-bold text-foreground">{routeResult.num_junctions}</p>
                      <p className="text-muted-foreground">Junctions</p>
                    </div>
                  </div>

                  {/* Segment Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">From</TableHead>
                        <TableHead className="text-xs">To</TableHead>
                        <TableHead className="text-right text-xs">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeResult.segments.map((seg, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{getJunctionName(seg.from_junction)}</TableCell>
                          <TableCell className="text-xs">{getJunctionName(seg.to_junction)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{seg.cost.toFixed(1)}s</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {routeResult && !routeResult.success && (
              <Card className="border-destructive/50">
                <CardContent className="p-4">
                  <p className="text-sm text-destructive">No route found between the selected junctions.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Map */}
      <div className="flex-1">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
};

export default UserRoutePage;
