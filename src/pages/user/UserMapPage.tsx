import { useMapData } from "@/hooks/use-map-data";
import { TrafficMap } from "@/components/TrafficMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import { MapPin, Activity } from "lucide-react";
import { DensityBadge } from "@/components/DensityBadge";
import { useState, useCallback } from "react";

const UserMapPage = () => {
  const { data } = useMapData();
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const junctions = data?.junctions || [];

  const handleJunctionClick = useCallback((id: string) => {
    const j = junctions.find((j) => j.id === id);
    if (j) {
      setFlyTo([j.lat, j.lng]);
    }
  }, [junctions]);

  return (
    <div className="relative flex h-full w-full">
      {isUsingMockData() && <MockDataBanner />}

      {/* Sidebar */}
      <div className="relative z-10 w-72 flex-shrink-0 border-r border-border bg-card">
        <ScrollArea className="h-full">
          <div className="p-4">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-foreground">Live Traffic</h2>
              <p className="text-sm text-muted-foreground">Real-time traffic conditions</p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" />
                  Junction Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {junctions.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => handleJunctionClick(j.id)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{j.name}</span>
                    </div>
                    <DensityBadge level={j.density} />
                  </button>
                ))}
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
          />
        )}
      </div>
    </div>
  );
};

export default UserMapPage;
