import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel } from "@/lib/types";

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
};

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 17, { duration: 0.8 });
  }, [center, map]);
  return null;
}

function RoadLines({ roads, junctions }: { roads: Road[]; junctions: Junction[] }) {
  const junctionMap = useMemo(() => {
    const m = new Map<string, Junction>();
    junctions.forEach((j) => m.set(j.id, j));
    return m;
  }, [junctions]);

  return (
    <>
      {roads.map((road) => {
        const from = junctionMap.get(road.from_junction);
        const to = junctionMap.get(road.to_junction);
        if (!from || !to) return null;
        return (
          <Polyline
            key={road.id}
            positions={[
              [from.lat, from.lng],
              [to.lat, to.lng],
            ]}
            pathOptions={{
              color: "hsl(210, 60%, 50%)",
              weight: Math.max(2, road.lanes),
              opacity: 0.6,
              dashArray: road.lanes <= 2 ? "6 4" : undefined,
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>{road.name}</strong>
                <br />
                Lanes: {road.lanes} | Speed: {road.speed_limit} km/h
                <br />
                Length: {road.length_km} km
              </div>
            </Popup>
          </Polyline>
        );
      })}
    </>
  );
}

function JunctionMarkers({
  junctions,
  onJunctionClick,
}: {
  junctions: Junction[];
  onJunctionClick: (id: string) => void;
}) {
  return (
    <>
      {junctions.map((j) => {
        const color = DENSITY_COLORS[j.density || "LOW"];
        return (
          <CircleMarker
            key={j.id}
            center={[j.lat, j.lng]}
            radius={12}
            pathOptions={{
              fillColor: color,
              fillOpacity: 0.9,
              color: "#fff",
              weight: 2,
            }}
            eventHandlers={{
              click: () => onJunctionClick(j.id),
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>{j.name}</strong> ({j.id})
                <br />
                Type: {j.type}
                <br />
                Density: {j.density || "LOW"}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

// Fix default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface TrafficMapProps {
  junctions: Junction[];
  roads: Road[];
  flyTo: [number, number] | null;
  onJunctionClick: (id: string) => void;
}

export function TrafficMap({ junctions, roads, flyTo, onJunctionClick }: TrafficMapProps) {
  return (
    <MapContainer
      center={[28.6139, 77.209]}
      zoom={16}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo center={flyTo} />
      <RoadLines roads={roads} junctions={junctions} />
      <JunctionMarkers junctions={junctions} onJunctionClick={onJunctionClick} />
    </MapContainer>
  );
}
