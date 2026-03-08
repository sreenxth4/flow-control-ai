import { useMapData } from "@/hooks/use-map-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DensityBadge } from "@/components/DensityBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";
import { mockJunctions } from "@/lib/mock-data";
import type { DensityLevel } from "@/lib/types";

const UserConditionsPage = () => {
  const { data: mapData, isLoading } = useMapData();

  const junctions = mapData?.junctions || [];

  const analyzed = junctions.filter((j) => !!j.density).length;
  const countByDensity = (level: DensityLevel) => junctions.filter((j) => j.density === level).length;
  const high = countByDensity("HIGH");
  const medium = countByDensity("MEDIUM");
  const low = countByDensity("LOW");
  const pending = 10 - analyzed;

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Traffic Conditions</h1>
          <p className="text-sm text-muted-foreground">Real-time density status across the network</p>
        </div>

        {/* Summary Bar */}
        <Card className="mb-6">
          <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">
              {analyzed} of 10 junctions analyzed
            </span>
            <span className="text-xs text-muted-foreground">{parts.join(", ")}</span>
          </CardContent>
        </Card>

        {/* Junction Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {mockJunctions.map((mj) => {
            const live = junctions.find((j) => j.id === mj.id);
            const density = live?.density;
            const hasData = !!density;

            return (
              <Card key={mj.id}>
                <CardContent className="flex items-start justify-between p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {mj.id} — {mj.name}
                      </p>
                      {hasData && live ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {live.vehicle_count ?? "?"} vehicles ({live.total_pcu ?? "?"} PCU)
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">Awaiting analysis</p>
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

        <p className="mt-6 text-center text-xs text-muted-foreground">Auto-refreshes every 60 seconds</p>
      </div>
    </ScrollArea>
  );
};

export default UserConditionsPage;
