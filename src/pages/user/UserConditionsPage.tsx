import { useMapData, useNetworkStatus } from "@/hooks/use-map-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, MapPin, Clock, AlertTriangle } from "lucide-react";
import { DensityBadge } from "@/components/DensityBadge";
import { Skeleton } from "@/components/ui/skeleton";

const UserConditionsPage = () => {
  const { data: mapData, isLoading: mapLoading } = useMapData();
  const { data: networkData, isLoading: networkLoading } = useNetworkStatus();

  const junctions = mapData?.junctions || [];
  const junctionCosts = networkData?.network.junction_costs || [];

  const getCost = (id: string) => junctionCosts.find((c) => c.junction_id === id);

  if (mapLoading || networkLoading) {
    return (
      <div className="p-6">
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Traffic Conditions</h1>
          <p className="text-muted-foreground">Real-time traffic and signal status across the network</p>
        </div>

        {/* Summary */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-traffic-low/10 p-3">
                <Activity className="h-5 w-5 text-traffic-low" />
              </div>
              <div>
                <p className="text-2xl font-bold">{junctions.filter((j) => j.density === "LOW").length}</p>
                <p className="text-xs text-muted-foreground">Clear Junctions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-traffic-medium/10 p-3">
                <Clock className="h-5 w-5 text-traffic-medium" />
              </div>
              <div>
                <p className="text-2xl font-bold">{junctions.filter((j) => j.density === "MEDIUM").length}</p>
                <p className="text-xs text-muted-foreground">Moderate Traffic</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-lg bg-traffic-high/10 p-3">
                <AlertTriangle className="h-5 w-5 text-traffic-high" />
              </div>
              <div>
                <p className="text-2xl font-bold">{junctions.filter((j) => j.density === "HIGH").length}</p>
                <p className="text-xs text-muted-foreground">Heavy Traffic</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Junction Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {junctions.map((j) => {
            const cost = getCost(j.id);
            return (
              <Card key={j.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {j.name}
                    </div>
                    <DensityBadge level={j.density} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded bg-muted p-2 text-center">
                      <p className="text-xs text-muted-foreground">Traffic Delay</p>
                      <p className="font-mono text-sm font-medium">{cost?.traffic_delay.toFixed(1) || "—"}s</p>
                    </div>
                    <div className="rounded bg-muted p-2 text-center">
                      <p className="text-xs text-muted-foreground">Signal Wait</p>
                      <p className="font-mono text-sm font-medium">{cost?.signal_wait.toFixed(1) || "—"}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {networkData && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Last updated: {new Date(networkData.network.last_update).toLocaleTimeString()}
          </p>
        )}
      </div>
    </ScrollArea>
  );
};

export default UserConditionsPage;
