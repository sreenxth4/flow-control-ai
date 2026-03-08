import { useState, useCallback } from "react";
import { useMapData, useFindRoute } from "@/hooks/use-map-data";
import { TrafficMap } from "@/components/TrafficMap";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import { Navigation, MapPin, Route, X, ArrowRight, DollarSign } from "lucide-react";
import { DensityBadge } from "@/components/DensityBadge";
import type { RouteResult, Junction } from "@/lib/types";
import { mockJunctions } from "@/lib/mock-data";

const UserRoutePage = () => {
  const { data } = useMapData();
  const findRouteMutation = useFindRoute();

  const [source, setSource] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const junctions = data?.junctions || [];

  const handleJunctionClick = useCallback((id: string) => {
    if (!source) {
      setSource(id);
    } else if (!destination && id !== source) {
      setDestination(id);
    }
  }, [source, destination]);

  const handleFindRoute = useCallback(async () => {
    if (!source || !destination) return;
    const srcIdx = parseInt(source.replace("J", "")) - 1;
    const destIdx = parseInt(destination.replace("J", "")) - 1;
    
    try {
      const result = await findRouteMutation.mutateAsync({ source: srcIdx, destination: destIdx });
      setRouteResult(result);
    } catch {
      setRouteResult(null);
    }
  }, [source, destination, findRouteMutation]);

  const handleClearRoute = useCallback(() => {
    setSource(null);
    setDestination(null);
    setRouteResult(null);
  }, []);

  const getJunctionName = (id: string) => {
    const j = mockJunctions.find((j) => j.id === id);
    return j?.name || id;
  };

  return (
    <div className="relative flex h-full w-full">
      {isUsingMockData() && <MockDataBanner />}

      {/* Sidebar */}
      <div className="relative z-10 w-96 flex-shrink-0 border-r border-border bg-card">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Route Finder</h2>
              <p className="text-sm text-muted-foreground">Find optimal routes through the traffic network</p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Navigation className="h-4 w-4 text-primary" />
                  Select Route
                </CardTitle>
                <CardDescription className="text-xs">Click junctions on map or select below</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs">
                    <MapPin className="h-3 w-3 text-traffic-low" /> Source
                  </Label>
                  <Select value={source || ""} onValueChange={setSource}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {junctions.map((j) => (
                        <SelectItem key={j.id} value={j.id} disabled={j.id === destination}>
                          {j.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs">
                    <MapPin className="h-3 w-3 text-traffic-high" /> Destination
                  </Label>
                  <Select value={destination || ""} onValueChange={setDestination}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {junctions.map((j) => (
                        <SelectItem key={j.id} value={j.id} disabled={j.id === source}>
                          {j.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleFindRoute}
                    disabled={!source || !destination || findRouteMutation.isPending}
                    className="flex-1"
                    size="sm"
                  >
                    <Route className="mr-2 h-4 w-4" />
                    {findRouteMutation.isPending ? "Finding..." : "Find Route"}
                  </Button>
                  {(source || destination || routeResult) && (
                    <Button variant="outline" size="sm" onClick={handleClearRoute}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Route Result */}
            {routeResult && (
              <Card className={routeResult.success ? "border-traffic-low" : "border-destructive"}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Route className="h-4 w-4 text-traffic-low" />
                    Route Found
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {routeResult.success ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-muted p-3 text-center">
                          <DollarSign className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Total Cost</p>
                          <p className="text-lg font-bold">{routeResult.total_cost}</p>
                        </div>
                        <div className="rounded-lg bg-muted p-3 text-center">
                          <MapPin className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Junctions</p>
                          <p className="text-lg font-bold">{routeResult.num_junctions}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Path</h4>
                        <div className="flex flex-wrap items-center gap-1">
                          {routeResult.path.map((id, i) => (
                            <span key={id} className="flex items-center">
                              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {getJunctionName(id)}
                              </span>
                              {i < routeResult.path.length - 1 && (
                                <ArrowRight className="mx-1 h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Segments</h4>
                        <div className="space-y-1.5">
                          {routeResult.segments.map((seg, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5 text-xs"
                            >
                              <span className="truncate">{seg.road_name}</span>
                              <span className="font-mono text-muted-foreground">{seg.cost}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-destructive">No route found between selected junctions</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Traffic Conditions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Traffic Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {junctions.slice(0, 6).map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between rounded bg-muted/30 px-2 py-1.5"
                    >
                      <span className="text-sm">{j.name}</span>
                      <DensityBadge level={j.density} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>

      {/* Map */}
      <div className="flex-1">
        {data && (
          <TrafficMap
            junctions={data.junctions}
            roads={data.roads}
            flyTo={flyTo}
            onJunctionClick={handleJunctionClick}
            routePath={routeResult?.success ? routeResult.path : undefined}
            sourceJunction={source}
            destinationJunction={destination}
          />
        )}
      </div>
    </div>
  );
};

export default UserRoutePage;
