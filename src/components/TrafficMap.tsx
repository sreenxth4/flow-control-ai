import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel } from "@/lib/types";

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
};

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [28.6139, 77.209],
      zoom: 16,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Update markers and roads
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;
    layers.clearLayers();

    const junctionMap = new Map<string, Junction>();
    junctions.forEach((j) => junctionMap.set(j.id, j));

    // Draw roads
    roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;

      const line = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: "hsl(210, 60%, 50%)",
          weight: Math.max(2, road.lanes),
          opacity: 0.6,
          dashArray: road.lanes <= 2 ? "6 4" : undefined,
        }
      );
      line.bindPopup(
        `<div class="text-sm"><strong>${road.name}</strong><br/>Lanes: ${road.lanes} | Speed: ${road.speed_limit} km/h<br/>Length: ${road.length_km} km</div>`
      );
      layers.addLayer(line);
    });

    // Draw junctions
    junctions.forEach((j) => {
      const color = DENSITY_COLORS[j.density || "LOW"];
      const marker = L.circleMarker([j.lat, j.lng], {
        radius: 12,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#fff",
        weight: 2,
      });
      marker.bindPopup(
        `<div class="text-sm"><strong>${j.name}</strong> (${j.id})<br/>Type: ${j.type}<br/>Density: ${j.density || "LOW"}</div>`
      );
      marker.on("click", () => onJunctionClick(j.id));
      layers.addLayer(marker);
    });
  }, [junctions, roads, onJunctionClick]);

  // Fly to
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 17, { duration: 0.8 });
    }
  }, [flyTo]);

  return <div ref={containerRef} className="h-full w-full" />;
}
