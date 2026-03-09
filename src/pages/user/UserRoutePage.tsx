import { useState, useCallback, useEffect, useRef } from "react";
import { useMapData, useFindMultipleRoutes } from "@/hooks/use-map-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Route, X, ArrowRight, Loader2, AlertTriangle, Clock } from "lucide-react";
import type { RouteResult, DensityLevel, MultiRouteResult } from "@/lib/types";
import { mockJunctions, getRandomizedJunctionDensities } from "@/lib/mock-data";
import { toast } from "sonner";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Density colors
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

// Marker size by vehicle count
const getMarkerSize = (vehicleCount?: number) => Math.min(35, 12 + (vehicleCount || 0) * 0.8);

// One-way roads
const ONE_WAY_ROADS = ["R14", "R38", "R42", "R49", "R58", "R72", "R83", "R85", "R93", "R94"];

// Route colors: Green=fastest, Amber=alternate, Blue=longer
const ROUTE_COLORS = ["#22c55e", "#f59e0b", "#3b82f6"];
const ROUTE_LABELS = ["Fastest", "Alternate", "Longer"];

const JUNCTIONS = mockJunctions.map((j, i) => ({ ...j, index: i }));
const getJunctionName = (id: string) => JUNCTIONS.find((j) => j.id === id)?.name || id;

const UserRoutePage = () => {
  const { data } = useMapData();
  const findRoutesMutation = useFindMultipleRoutes();

  const [source, setSource] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [routeResult, setRouteResult] = useState<MultiRouteResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [liveDensities, setLiveDensities] = useState<Record<string, DensityLevel>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Live density animation - update every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveDensities(getRandomizedJunctionDensities());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
    const routes = routeResult?.routes || [];
    const selectedRoute = routes[selectedRouteIndex];
    
    // Build route road sets for each route
    const routeRoadSets = routes.map((route, idx) => {
      const set = new Set<string>();
      if (route.success && route.path.length > 1) {
        for (let i = 0; i < route.path.length - 1; i++) {
          set.add(`${route.path[i]}-${route.path[i + 1]}`);
        }
      }
      return { set, color: route.color || ROUTE_COLORS[idx], isSelected: idx === selectedRouteIndex };
    });

    // Roads
    data.roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;
      
      // Check if this road is on any route
      const matchingRoute = routeRoadSets.find(r => r.set.has(`${road.from_junction}-${road.to_junction}`));
      const isOneWay = ONE_WAY_ROADS.includes(road.id);
      const speedColor = getSpeedColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      const lineColor = matchingRoute ? matchingRoute.color : speedColor;
      const lineWeight = matchingRoute ? (matchingRoute.isSelected ? 7 : 4) : weight;
      const lineOpacity = matchingRoute ? (matchingRoute.isSelected ? 1 : 0.6) : 0.5;

      const line = L.polyline([[from.lat, from.lng], [to.lat, to.lng]], {
        color: lineColor,
        weight: lineWeight,
        opacity: lineOpacity,
        dashArray: isOneWay && !matchingRoute ? "8 6" : undefined,
      });

      // Road details tooltip on hover
      const lengthM = (road.length_km * 1000).toFixed(0);
      const baseCost = ((road.length_km / road.speed_limit) * 3600).toFixed(1);
      line.bindTooltip(
        `<div style="min-width:140px; font-size: 12px;">
          <strong>${road.name}</strong><br/>
          <span style="color:#666">${road.from_junction} → ${road.to_junction}</span><br/>
          📏 ${lengthM}m | 🚗 ${road.speed_limit} km/h<br/>
          🛣️ ${road.lanes} lanes | ⏱️ ${baseCost}s
        </div>`,
        { sticky: true, direction: "top" }
      );

      layers.addLayer(line);
    });

    // All route paths for junction highlighting
    const allRoutePaths = new Set<string>();
    routes.forEach(r => r.path?.forEach(p => allRoutePaths.add(p)));

    // Junctions
    data.junctions.forEach((j) => {
      const isSource = source === j.id;
      const isDest = destination === j.id;
      const isOnRoute = allRoutePaths.has(j.id);
      
      // Use live density
      const currentDensity = liveDensities[j.id] || j.density;
      const color = isSource ? "#3b82f6" : isDest ? "#ef4444" : currentDensity ? DENSITY_COLORS[currentDensity] : "#CCCCCC";
      const radius = isSource || isDest ? 16 : isOnRoute ? 14 : getMarkerSize(j.vehicle_count);

      // Create pulsing div icon
      const markerIcon = L.divIcon({
        className: 'junction-marker',
        html: `<div class="junction-circle animate-density-pulse" style="
          width: ${radius * 2}px; 
          height: ${radius * 2}px; 
          background-color: ${color}; 
          border: ${isSource || isDest ? 3 : isOnRoute ? 3 : 1.5}px solid ${isOnRoute ? '#FFD700' : '#fff'};
          border-radius: 50%;
          opacity: 0.9;
        "></div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });

      const marker = L.marker([j.lat, j.lng], { icon: markerIcon });
      const pcuInfo = j.vehicle_count != null && j.total_pcu != null ? `<br/>${j.vehicle_count} vehicles (${j.total_pcu} PCU)` : "";
      marker.bindPopup(`<div style="min-width:140px"><strong>${j.id}: ${j.name}</strong><br/>Density: ${currentDensity || "N/A"}${pcuInfo}</div>`);
      layers.addLayer(marker);

      // Star marker for selected route junctions
      if (selectedRoute?.path?.includes(j.id) && mapRef.current) {
        const starIcon = L.divIcon({
          className: 'route-star',
          html: '<div style="color: #FFD700; font-size: 16px; text-shadow: 0 0 2px #000;">⭐</div>',
          iconSize: [16, 16],
          iconAnchor: [8, 20],
        });
        L.marker([j.lat, j.lng], { icon: starIcon, interactive: false }).addTo(layers);
      }
    });
  }, [data, routeResult, source, destination, selectedRouteIndex, liveDensities]);

  const handleFindRoute = useCallback(async () => {
    if (!source || !destination) return;
    const srcIdx = parseInt(source.replace("J", "")) - 1;
    const destIdx = parseInt(destination.replace("J", "")) - 1;
    try {
      const result = await findRoutesMutation.mutateAsync({ source: srcIdx, destination: destIdx });
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
                            style={{ backgroundColor: route.color || ROUTE_COLORS[idx] }} 
                          />
                          <span className="text-sm font-medium">{ROUTE_LABELS[idx]}</span>
                        </div>
                        <span className="text-sm font-mono font-bold">{route.total_cost.toFixed(1)}s</span>
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
                  {ROUTE_COLORS.map((color, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="h-1 w-4 rounded" style={{ backgroundColor: color }} />
                      <span>{ROUTE_LABELS[idx]}</span>
                    </div>
                  ))}
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
                      style={{ backgroundColor: selectedRoute.color || ROUTE_COLORS[selectedRouteIndex] }} 
                    />
                    {ROUTE_LABELS[selectedRouteIndex]} Route
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
