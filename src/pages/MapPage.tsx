import { useState, useCallback } from "react";
import { useMapData } from "@/hooks/use-map-data";
import { TrafficMap } from "@/components/TrafficMap";
import { JunctionSidebar } from "@/components/JunctionSidebar";
import { JunctionDetailModal } from "@/components/JunctionDetailModal";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeft } from "lucide-react";

const MapPage = () => {
  const { data } = useMapData();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedJunction, setSelectedJunction] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const handleJunctionClick = useCallback((id: string) => {
    setSelectedJunction(id);
    setModalOpen(true);
  }, []);

  const handleJunctionFly = useCallback((lat: number, lng: number) => {
    setFlyTo([lat, lng]);
  }, []);

  return (
    <div className="relative flex h-full w-full">
      {isUsingMockData() && <MockDataBanner />}

      {/* Sidebar */}
      <div
        className={`relative z-10 flex-shrink-0 border-r border-border bg-card transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0"
        } overflow-hidden`}
      >
        {data && (
          <div className="h-full w-80">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Junctions</h2>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <JunctionSidebar
              junctions={data.junctions}
              signalPhases={data.signal_phases}
              onJunctionClick={handleJunctionClick}
              onJunctionFly={handleJunctionFly}
            />
          </div>
        )}
      </div>

      {/* Toggle sidebar */}
      {!sidebarOpen && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute left-2 top-2 z-[1000] shadow-md"
          onClick={() => setSidebarOpen(true)}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}

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

      <JunctionDetailModal
        junctionId={selectedJunction}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default MapPage;
