import { useState, useCallback } from "react";
import { useMapData, useTrafficState } from "@/hooks/use-map-data";
import { TrafficMap } from "@/components/TrafficMap";
import { JunctionSidebar } from "@/components/JunctionSidebar";
import { JunctionDetailModal } from "@/components/JunctionDetailModal";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { BottomSheet } from "@/components/BottomSheet";

const AdminMapPage = () => {
  const { data } = useMapData();
  const { data: trafficStateData } = useTrafficState();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
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

  const junctionContent = data && (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Junctions</h2>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="hidden md:inline-flex">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <JunctionSidebar
        junctions={data.junctions}
        signalPhases={data.signal_phases}
        onJunctionClick={handleJunctionClick}
        onJunctionFly={handleJunctionFly}
      />
    </>
  );

  return (
    <div className="flex flex-col md:flex-row h-full w-full overflow-hidden">
      {isUsingMockData() && <MockDataBanner />}

      {/* ═══ MAP ═══ */}
      <div className="flex-1 min-h-0 overflow-hidden relative order-1 md:order-2" style={{ isolation: "isolate" }}>
        {data && (
          <TrafficMap
            junctions={data.junctions}
            roads={data.roads}
            flyTo={flyTo}
            onJunctionClick={handleJunctionClick}
            turnRestrictions={data.turn_restrictions}
            trafficStates={trafficStateData?.road_states}
          />
        )}
      </div>

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <div
        className={`
          hidden md:block order-2 md:order-1 flex-shrink-0 border-r border-border bg-card transition-all duration-300
          ${sidebarOpen ? "w-80" : "w-12 overflow-hidden"}
        `}
      >
        {!sidebarOpen ? (
          <div className="flex h-full w-12 flex-col items-center pt-3 gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="h-8 w-8">
              <PanelLeft className="h-4 w-4" />
            </Button>
            <span className="text-micro text-muted-foreground [writing-mode:vertical-lr] rotate-180 tracking-widest">JUNCTIONS</span>
          </div>
        ) : (
          <div className="h-full w-full overflow-y-auto">
            {junctionContent}
          </div>
        )}
      </div>

      {/* ═══ MOBILE BOTTOM SHEET ═══ */}
      <BottomSheet peekLabel="Junctions" peekIcon="📍">
        {junctionContent}
      </BottomSheet>

      <JunctionDetailModal
        junctionId={selectedJunction}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default AdminMapPage;
