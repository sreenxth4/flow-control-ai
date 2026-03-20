import { useState, useCallback, useEffect, useRef } from "react";
import { useMapData, useFindMultipleRoutes } from "@/hooks/use-map-data";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Route, X, ArrowRight, Loader2, AlertTriangle, Clock } from "lucide-react";
import type { RouteResult, DensityLevel, MultiRouteResult } from "@/lib/types";
import { toast } from "sonner";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/components/map-styles.css";
import {
  DENSITY_COLORS,
  getRoadColorByDensity,
  getMarkerSize,
  createJunctionMarkerHTML,
  createJunctionLabelHTML,
  createJunctionTooltipHTML,
  createRoadTooltipHTML,
  createSignalDotHTML,
  getSignalDotOffsets,
  resolveCoords,
} from "@/components/map-utils";
import { fetchAllRoadGeometries } from "@/lib/osrm";


// Route colors: Green=fastest, Amber=alternate, Blue=longer
// Route colors assigned by total travel time: green=fastest, skyblue=middle, red=slowest
const getRouteColorByRank = (routes: { total_cost: number; congestion_delay?: number }[]) => {
  if (routes.length <= 1) return ["#22c55e"];
  const totalTimes = routes.map((r, i) => ({ i, time: r.total_cost + (r.congestion_delay || 0) }));
  totalTimes.sort((a, b) => a.time - b.time);
  const colorMap: Record<number, string> = {};
  colorMap[totalTimes[0].i] = "#22c55e"; // green = fastest
  if (totalTimes.length === 2) {
    colorMap[totalTimes[1].i] = "#ef4444";
  } else {
    colorMap[totalTimes[totalTimes.length - 1].i] = "#ef4444"; // red = slowest
    for (let k = 1; k < totalTimes.length - 1; k++) {
      colorMap[totalTimes[k].i] = "#87CEEB"; // skyblue = middle
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
  const queryClient = useQueryClient();
  const findRoutesMutation = useFindMultipleRoutes();

  const [source, setSource] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [routeResult, setRouteResult] = useState<MultiRouteResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [mapReady, setMapReady] = useState(false);

  const junctions = Array.isArray(data?.junctions) ? data.junctions : [];
  const getJunctionName = useCallback(
    (id: string) => junctions.find((j) => j.id === id)?.name || id,
    [junctions]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Refetch map data every 90s for near-real-time density/vehicle updates
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["map-data"] });
    }, 90_000);
    return () => clearInterval(interval);
  }, [queryClient]);

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
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; layersRef.current = null; setMapReady(false); };
  }, []);

  // Update map with OSRM geometry
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !data || !mapReady) return;

    let cancelled = false;

    const draw = async () => {
      const safeJunctions = Array.isArray(data.junctions) ? data.junctions : [];
      const safeRoads = Array.isArray(data.roads) ? data.roads : [];

      const junctionMap = new Map(
        safeJunctions
          .map((j) => {
            const coords = resolveCoords(j);
            if (!coords) return null;
            return [j.id, { ...j, lat: coords.lat, lng: coords.lng }] as const;
          })
          .filter((entry): entry is readonly [string, (typeof safeJunctions)[number] & { lat: number; lng: number }] => entry !== null)
      );

      // Fetch real road geometries
      const coordsMap = new Map<string, { lat: number; lng: number }>();
      junctionMap.forEach((v, k) => coordsMap.set(k, { lat: v.lat, lng: v.lng }));
      const geometries = await fetchAllRoadGeometries(safeRoads, coordsMap);

      if (cancelled) return;
      layers.clearLayers();

      const routes = routeResult?.routes || [];
      const routeColors = getRouteColorByRank(routes);

      const routeRoadSets = routes.map((route, idx) => {
        const set = new Set<string>();
        if (route.success && route.path.length > 1) {
          for (let i = 0; i < route.path.length - 1; i++) {
            set.add(`${route.path[i]}-${route.path[i + 1]}`);
            set.add(`${route.path[i + 1]}-${route.path[i]}`);
          }
        }
        const isSelected = idx === selectedRouteIndex;
        return { set, color: routeColors[idx], isSelected };
      });

      const hasRoutes = routes.length > 0;

      // Roads with OSRM geometry
      safeRoads.forEach((road) => {
        const from = junctionMap.get(road.from_junction);
        const to = junctionMap.get(road.to_junction);
        if (!from || !to) return;
        if ([from.lat, from.lng, to.lat, to.lng].some(v => typeof v !== "number" || isNaN(v))) return;

        const matchingRoute = routeRoadSets.find(r => r.isSelected && r.set.has(`${road.from_junction}-${road.to_junction}`));

        let lineColor: string;
        let lineWeight: number;
        let lineOpacity: number;

        if (matchingRoute) {
          lineColor = matchingRoute.color;
          lineWeight = 8;
          lineOpacity = 1;
        } else if (hasRoutes) {
          lineColor = "#6b7280";
          lineWeight = 1;
          lineOpacity = 0.15;
        } else {
          lineColor = getRoadColorByDensity(from.density, to.density);
          lineWeight = 2 + road.lanes * 0.8;
          lineOpacity = 0.6;
        }

        const routeCoords = geometries.get(road.id) || [[from.lat, from.lng], [to.lat, to.lng]];
        const line = L.polyline(routeCoords as L.LatLngTuple[], { color: lineColor, weight: lineWeight, opacity: lineOpacity });
        line.bindTooltip(
          createRoadTooltipHTML({ name: road.name, from: road.from_junction, to: road.to_junction, lengthKm: road.length_km, speedLimit: road.speed_limit, lanes: road.lanes }),
          { sticky: true, direction: "top" }
        );
        layers.addLayer(line);
      });

      // All route paths for junction highlighting
      const allRoutePaths = new Set<string>();
      routes.forEach(r => r.path?.forEach(p => allRoutePaths.add(p)));

      // Density map for signal dots
      const densityMap = new Map<string, { lat: number; lng: number; density?: DensityLevel }>();
      junctionMap.forEach((v, k) => densityMap.set(k, { lat: v.lat, lng: v.lng, density: v.density }));

      // Junctions + signal dots
      safeJunctions.forEach((j) => {
        const isSource = source === j.id;
        const isDest = destination === j.id;
        const isOnRoute = allRoutePaths.has(j.id);
        const coords = resolveCoords(j);
        if (!coords) return;

        const radius = isSource || isDest ? 18 : isOnRoute ? 14 : getMarkerSize(j.vehicle_count);
        const borderColor = isOnRoute ? "#FFD700" : "rgba(255,255,255,0.9)";
        const borderWidth = isSource || isDest ? 3.5 : isOnRoute ? 3 : 2.5;
        const specialColor = isSource ? "#3b82f6" : isDest ? "#ef4444" : undefined;

        const markerIcon = L.divIcon({
          className: "junction-marker",
          html: createJunctionMarkerHTML({ density: j.density, radius, borderColor, borderWidth, isSpecial: isSource || isDest, specialColor }),
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        });

        const marker = L.marker([coords.lat, coords.lng], { icon: markerIcon });
        marker.bindTooltip(
          createJunctionTooltipHTML({ id: j.id, name: j.name, density: j.density, vehicleCount: j.vehicle_count, totalPcu: j.total_pcu }),
          { direction: "top", offset: [0, -12] }
        );
        layers.addLayer(marker);

        const labelText = (j.name || j.id || "").trim() || j.id;
        const labelWidth = Math.min(240, Math.max(64, labelText.length * 7.5));
        const labelIcon = L.divIcon({
          className: "junction-name-label",
          html: createJunctionLabelHTML(labelText),
          iconSize: [labelWidth, 20],
          iconAnchor: [Math.floor(labelWidth / 2), -16],
        });
        L.marker([coords.lat, coords.lng], { icon: labelIcon, interactive: false, keyboard: false }).addTo(layers);

        // Signal direction dots
        const dots = getSignalDotOffsets(j.id, coords.lat, coords.lng, safeRoads, densityMap);
        dots.forEach((dot) => {
          const dotIcon = L.divIcon({
            className: "signal-dot",
            html: createSignalDotHTML(dot.density),
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker([dot.lat, dot.lng], { icon: dotIcon, interactive: false, keyboard: false }).addTo(layers);
        });
      });
    };

    draw();
    return () => { cancelled = true; };
  }, [data, routeResult, source, destination, selectedRouteIndex, mapReady]);

  const handleFindRoute = useCallback(async () => {
    if (!source || !destination) return;
    try {
      const result = await findRoutesMutation.mutateAsync({ source, destination });
      setRouteResult(result);
      setSelectedRouteIndex(0);
      if (result.routes.length === 0) toast.error("No route found between selected junctions");
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
  }, []);

  const selectedRoute = routeResult?.routes?.[selectedRouteIndex];

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar */}
      <div className="w-[380px] flex-shrink-0 border-r border-border bg-card">
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

            {/* Route Selection Cards */}
            {routeResult && routeResult.routes.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Available Routes</Label>
                <div className="grid gap-2">
                  {routeResult.routes.map((route, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedRouteIndex(idx)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        selectedRouteIndex === idx 
                          ? "border-primary bg-primary/10 ring-1 ring-primary" 
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: routeResult ? getRouteColorByRank(routeResult.routes)[idx] : "#6b7280" }} 
                          />
                          <span className="text-sm font-medium">{getRouteLabelByRank(routeResult.routes)[idx]}</span>
                        </div>
                        <span className="text-sm font-mono font-bold">{(route.total_cost + (route.congestion_delay || 0)).toFixed(1)}s</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{route.num_junctions} junctions</span>
                        {route.congestion_delay && route.congestion_delay > 0 && (
                          <span className="text-amber-600">+{route.congestion_delay}s delay</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Congestion Impact Alert */}
            {selectedRoute?.congested_junctions && selectedRoute.congested_junctions.length > 0 && (
              <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-xs">
                  <span className="font-medium">Congestion Impact:</span> This route takes{" "}
                  <span className="font-bold">+{selectedRoute.congestion_delay}s</span> longer due to{" "}
                  {selectedRoute.congested_junctions
                    .filter(cj => cj.density === "HIGH")
                    .map(cj => cj.id)
                    .join(", ") || "moderate"}{" "}
                  density at{" "}
                  {selectedRoute.congested_junctions.map(cj => cj.id).join(", ")}
                </AlertDescription>
              </Alert>
            )}

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
                  <p className="font-medium mb-1">Route Colors:</p>
                  <div className="flex items-center gap-2">
                    <span className="h-1 w-4 rounded" style={{ backgroundColor: "#22c55e" }} />
                    <span>Fastest (least time)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1 w-4 rounded" style={{ backgroundColor: "#87CEEB" }} />
                    <span>Middle</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1 w-4 rounded" style={{ backgroundColor: "#ef4444" }} />
                    <span>Slowest (most time)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selected Route Summary */}
            {selectedRoute && selectedRoute.success && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <span 
                      className="h-3 w-3 rounded-full" 
                      style={{ backgroundColor: routeResult ? getRouteColorByRank(routeResult.routes)[selectedRouteIndex] : "#22c55e" }} 
                    />
                    {routeResult ? getRouteLabelByRank(routeResult.routes)[selectedRouteIndex] : "Route"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {/* Path */}
                  <div className="flex flex-wrap items-center gap-1">
                    {selectedRoute.path.map((id, i) => (
                      <span key={id} className="flex items-center">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{getJunctionName(id)}</span>
                        {i < selectedRoute.path.length - 1 && <ArrowRight className="mx-0.5 h-3 w-3 text-muted-foreground" />}
                      </span>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md bg-muted p-2 text-center">
                      <p className="text-lg font-bold text-foreground">{selectedRoute.total_cost.toFixed(1)}s</p>
                      <p className="text-muted-foreground">Base Time</p>
                    </div>
                    <div className="rounded-md bg-muted p-2 text-center">
                      <p className="text-lg font-bold text-foreground">{selectedRoute.num_junctions}</p>
                      <p className="text-muted-foreground">Junctions</p>
                    </div>
                    <div className="rounded-md bg-amber-500/10 p-2 text-center">
                      <p className="text-lg font-bold text-amber-600">+{selectedRoute.congestion_delay || 0}s</p>
                      <p className="text-muted-foreground">Delay</p>
                    </div>
                  </div>

                  {/* Segment Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">From</TableHead>
                        <TableHead className="text-xs">To</TableHead>
                        <TableHead className="text-right text-xs">Time</TableHead>
                        <TableHead className="text-right text-xs">Delay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRoute.segments.map((seg, i) => {
                        const congested = selectedRoute.congested_junctions?.find(cj => cj.id === seg.to_junction);
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{getJunctionName(seg.from_junction)}</TableCell>
                            <TableCell className="text-xs">{getJunctionName(seg.to_junction)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{seg.cost.toFixed(1)}s</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {congested ? (
                                <span className={congested.density === "HIGH" ? "text-red-500" : "text-amber-500"}>
                                  +{congested.delay}s
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
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
                      {(selectedRoute.total_cost + (selectedRoute.congestion_delay || 0)).toFixed(1)}s
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
