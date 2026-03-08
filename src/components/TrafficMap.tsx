import { useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel } from "@/lib/types";

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
};

function FlyTo({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom || 17, { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

interface TrafficMapProps {
  junctions: Junction[];
  roads: Road[];
  flyTo: [number, number] | null;
  onJunctionClick: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

export function TrafficMap({ junctions, roads, flyTo, onJunctionClick, onMapClick }: TrafficMapProps) {
  const junctionMap = useRef<Map<string, Junction>>(new Map());

  useEffect(() => {
    const m = new Map<string, Junction>();
    junctions.forEach((j) => m.set(j.id, j));
    junctionMap.current = m;
  }, [junctions]);

  const getPos = (id: string): [number, number] | null => {
    const j = junctionMap.current.get(id);
    return j ? [j.lat, j.lng] : null;
  };

  // fix default icon
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  return (
    <MapContainer
      center={[28.6139, 77.2090]}
      zoom={16}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyTo center={flyTo} />

      {/* Roads */}
      {roads.map((road) => {
        const from = getPos(road.from_junction);
        const to = getPos(road.to_junction);
        if (!from || !to) return null;
        return (
          <Polyline
            key={road.id}
            positions={[from, to]}
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

      {/* Junctions */}
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
    </MapContainer>
  );
}
