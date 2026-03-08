import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel } from "@/lib/types";
import { mockJunctions } from "@/lib/mock-data";

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
  routePath?: string[];
  sourceJunction?: string | null;
  destinationJunction?: string | null;
}

export function TrafficMap({ junctions, roads, flyTo, onJunctionClick, routePath, sourceJunction, destinationJunction }: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [17.4945, 78.3990],
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

    // Build route road set for highlighting
    const routeRoadSet = new Set<string>();
    if (routePath && routePath.length > 1) {
      for (let i = 0; i < routePath.length - 1; i++) {
        routeRoadSet.add(`${routePath[i]}-${routePath[i + 1]}`);
      }
    }

    // Draw roads
    roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;

      const isOnRoute = routeRoadSet.has(`${road.from_junction}-${road.to_junction}`);

      const line = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: isOnRoute ? "#22c55e" : "hsl(210, 60%, 50%)",
          weight: isOnRoute ? 6 : Math.max(2, road.lanes),
          opacity: isOnRoute ? 1 : 0.6,
          dashArray: !isOnRoute && road.lanes <= 2 ? "6 4" : undefined,
        }
      );
      line.bindPopup(
        `<div class="text-sm"><strong>${road.name}</strong><br/>Lanes: ${road.lanes} | Speed: ${road.speed_limit} km/h<br/>Length: ${road.length_km} km</div>`
      );
      layers.addLayer(line);
    });

    // Draw junctions
    junctions.forEach((j) => {
      const isSource = sourceJunction === j.id;
      const isDest = destinationJunction === j.id;
      const isOnRoute = routePath?.includes(j.id);

      const color = isSource ? "#3b82f6" : isDest ? "#ef4444" : DENSITY_COLORS[j.density || "LOW"];
      const radius = isSource || isDest ? 14 : isOnRoute ? 13 : 12;
      const weight = isSource || isDest ? 3 : 2;

      const marker = L.circleMarker([j.lat, j.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#fff",
        weight,
      });
      marker.bindPopup(
        `<div class="text-sm"><strong>${j.name}</strong> (${j.id})<br/>Type: ${j.type}<br/>Density: ${j.density || "LOW"}</div>`
      );
      marker.on("click", () => onJunctionClick(j.id));
      layers.addLayer(marker);
    });
  }, [junctions, roads, onJunctionClick, routePath, sourceJunction, destinationJunction]);

  // Fly to
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 17, { duration: 0.8 });
    }
  }, [flyTo]);

  return <div ref={containerRef} className="h-full w-full" />;
}
