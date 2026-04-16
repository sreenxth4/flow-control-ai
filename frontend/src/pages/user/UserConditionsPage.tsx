import { useMapData } from "@/hooks/use-map-data";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DensityBadge } from "@/components/DensityBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Car, Activity, ShieldCheck, RefreshCw } from "lucide-react";
import type { DensityLevel } from "@/lib/types";

const UserConditionsPage = () => {
  const queryClient = useQueryClient();
  const { data: mapData, isLoading, isFetching } = useMapData();
  const [lastFetchTime, setLastFetchTime] = useState(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    setLastFetchTime(Date.now());
  }, [mapData]);

  useEffect(() => {
    const iv = setInterval(() => setSecondsAgo(Math.floor((Date.now() - lastFetchTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [lastFetchTime]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["map-data"] });
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const iv = setInterval(handleRefresh, 30000);
    return () => clearInterval(iv);
  }, [queryClient]);

  const junctions = mapData?.junctions || [];
  const totalJunctions = junctions.length;

  const analyzed = junctions.filter((j) => !!j.density).length;
  const countByDensity = (level: DensityLevel) => junctions.filter((j) => j.density === level).length;
  const high = countByDensity("HIGH");
  const medium = countByDensity("MEDIUM");
  const low = countByDensity("LOW");
  const pending = Math.max(totalJunctions - analyzed, 0);

  // Build summary string
  const parts: string[] = [];
  if (high > 0) parts.push(`${high} HIGH`);
  if (medium > 0) parts.push(`${medium} MEDIUM`);
  if (low > 0) parts.push(`${low} LOW`);
  if (pending > 0) parts.push(`${pending} pending`);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="mb-6 h-12 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Traffic Conditions</h1>
            <p className="text-sm text-muted-foreground">Real-time density status across the network</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {secondsAgo < 5 ? "Just now" : `${secondsAgo}s ago`}
            </span>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Dashboard */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
          <Card className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/30">
            <CardContent className="p-4 flex flex-col justify-center items-center gap-1 text-center">
              <span className="text-3xl font-black tabular-nums">{analyzed}</span>
              <span className="text-micro font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><ShieldCheck className="h-3 w-3"/> Analyzed</span>
            </CardContent>
          </Card>
          <Card className={`transition-all duration-300 hover:shadow-md hover:-translate-y-1 ${high > 0 ? "border-red-500/30 bg-red-500/5 shadow-sm shadow-red-500/10 hover:shadow-red-500/20 hover:border-red-500/50" : "hover:border-primary/30"}`}>
            <CardContent className="p-4 flex flex-col justify-center items-center gap-1 text-center">
              <span className={`text-3xl font-black tabular-nums ${high > 0 ? "text-red-500" : "text-muted-foreground"}`}>{high}</span>
              <span className="text-micro font-bold text-muted-foreground uppercase tracking-wider">High Density</span>
            </CardContent>
          </Card>
          <Card className={`transition-all duration-300 hover:shadow-md hover:-translate-y-1 ${medium > 0 ? "border-amber-500/30 bg-amber-500/5 shadow-sm shadow-amber-500/10 hover:shadow-amber-500/20 hover:border-amber-500/50" : "hover:border-primary/30"}`}>
            <CardContent className="p-4 flex flex-col justify-center items-center gap-1 text-center">
              <span className={`text-3xl font-black tabular-nums ${medium > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{medium}</span>
              <span className="text-micro font-bold text-muted-foreground uppercase tracking-wider">Medium Density</span>
            </CardContent>
          </Card>
          <Card className={`transition-all duration-300 hover:shadow-md hover:-translate-y-1 ${low > 0 ? "border-green-500/30 bg-green-500/5 shadow-sm shadow-green-500/10 hover:shadow-green-500/20 hover:border-green-500/50" : "hover:border-primary/30"}`}>
            <CardContent className="p-4 flex flex-col justify-center items-center gap-1 text-center">
              <span className={`text-3xl font-black tabular-nums ${low > 0 ? "text-green-500" : "text-muted-foreground"}`}>{low}</span>
              <span className="text-micro font-bold text-muted-foreground uppercase tracking-wider">Low Density</span>
            </CardContent>
          </Card>
        </div>

        {/* Junction Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {junctions.map((j) => {
            const density = j.density;
            const hasData = !!density;

            return (
              <Card key={j.id} className="transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-primary/40 group">
                <CardContent className="flex items-start justify-between p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">
                        {j.id} — {j.name}
                      </p>
                      {hasData ? (() => {
                        const pcu = typeof j.total_pcu === 'number' ? j.total_pcu.toFixed(1) : "?";
                        const autoVehicles = Math.round((typeof j.total_pcu === 'number' ? j.total_pcu : 0) * 1.5);
                        const vehs = j.vehicle_count && j.vehicle_count > 0 ? j.vehicle_count : autoVehicles;
                        
                        return (
                          <div className="flex items-center gap-4">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                              <Car className="h-3.5 w-3.5 text-primary/70" /> {vehs} veh
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                              <Activity className="h-3.5 w-3.5 text-primary/70" /> {pcu} PCU
                            </span>
                          </div>
                        );
                      })() : (
                        <p className="mt-0.5 text-xs text-muted-foreground italic">Awaiting analysis pulse...</p>
                      )}
                    </div>
                  </div>
                  {hasData ? (
                    <DensityBadge level={density} />
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">No data</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">Auto-refreshes every 30 seconds</p>
      </div>
    </ScrollArea>
  );
};

export default UserConditionsPage;
