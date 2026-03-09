import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel } from "@/lib/types";

// Density colors: GREEN/ORANGE/RED
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#00AA00",
  MEDIUM: "#FF8800",
  HIGH: "#FF0000",
};

// Speed colors: GREEN for 40km/h, BLUE for 50km/h+
const getSpeedColor = (speedLimit: number) => speedLimit >= 50 ? "#0066FF" : "#00CC00";

// Marker size by vehicle count: 12px min, grows with count
const getMarkerSize = (vehicleCount?: number) => {
  const count = vehicleCount || 0;
  return Math.min(35, 12 + count * 0.8);
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

// One-way roads (no reverse pair)
const ONE_WAY_ROADS = ["R14", "R38", "R42", "R49", "R58", "R72", "R83", "R85", "R93", "R94"];

export function TrafficMap({ junctions, roads, flyTo, onJunctionClick, routePath, sourceJunction, destinationJunction }: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once - Kukatpally center
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [17.49, 78.38],
      zoom: 14,
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

    // Draw roads first (under markers)
    roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;

      const isOnRoute = routeRoadSet.has(`${road.from_junction}-${road.to_junction}`);
      const isOneWay = ONE_WAY_ROADS.includes(road.id);
      const speedColor = getSpeedColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        {
          color: isOnRoute ? "#FF0000" : speedColor,
          weight: isOnRoute ? 6 : weight,
          opacity: isOnRoute ? 1 : 0.7,
          dashArray: isOneWay && !isOnRoute ? "8 6" : undefined,
        }
      );

      const baseCost = ((road.length_km / road.speed_limit) * 3600).toFixed(1);
      line.bindPopup(
        `<div style="min-width:160px">
          <strong>${road.name}</strong><br/>
          <span style="color:#666">${road.from_junction} → ${road.to_junction}</span><br/>
          Length: ${(road.length_km * 1000).toFixed(0)}m | Speed: ${road.speed_limit} km/h<br/>
          Lanes: ${road.lanes} | Base Cost: ${baseCost}s
        </div>`
      );
      layers.addLayer(line);

      // Add direction arrow at 60% along the line
      if (mapRef.current && mapRef.current.getZoom() >= 14) {
        const midLat = from.lat + (to.lat - from.lat) * 0.6;
        const midLng = from.lng + (to.lng - from.lng) * 0.6;
        const angle = Math.atan2(to.lng - from.lng, to.lat - from.lat) * (180 / Math.PI);
        
        const arrowIcon = L.divIcon({
          className: 'road-arrow',
          html: `<div style="transform: rotate(${angle}deg); color: ${isOnRoute ? '#FF0000' : speedColor}; opacity: 0.6; font-size: 14px;">▲</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }).addTo(layers);
      }
    });

    // Draw junctions
    junctions.forEach((j) => {
      const isSource = sourceJunction === j.id;
      const isDest = destinationJunction === j.id;
      const isOnRoute = routePath?.includes(j.id);

      const color = !j.density ? "#CCCCCC" : isSource ? "#3b82f6" : isDest ? "#ef4444" : DENSITY_COLORS[j.density];
      const radius = isSource || isDest ? 16 : getMarkerSize(j.vehicle_count);
      const weight = isSource || isDest ? 3 : 2;

      const marker = L.circleMarker([j.lat, j.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: isOnRoute ? "#FFD700" : "#fff",
        weight: isOnRoute ? 3 : weight,
      });

      const incomingRoads = roads.filter(r => r.to_junction === j.id).map(r => r.id).join(", ");
      const outgoingRoads = roads.filter(r => r.from_junction === j.id).map(r => r.id).join(", ");

      marker.bindPopup(
        `<div style="min-width:180px">
          <strong>${j.id}: ${j.name}</strong><br/>
          Vehicles: ${j.vehicle_count ?? 0} | Density: <strong>${j.density || "N/A"}</strong><br/>
          ${j.total_pcu ? `PCU: ${j.total_pcu}<br/>` : ""}
          <span style="color:#666">Incoming:</span> ${incomingRoads || "none"}<br/>
          <span style="color:#666">Outgoing:</span> ${outgoingRoads || "none"}
        </div>`
      );
      marker.on("click", () => onJunctionClick(j.id));
      layers.addLayer(marker);

      // Add junction label at zoom 14+
      if (mapRef.current && mapRef.current.getZoom() >= 14) {
        const labelIcon = L.divIcon({
          className: 'junction-label',
          html: `<div style="font-size: 10px; font-weight: bold; color: #333; background: rgba(255,255,255,0.8); padding: 1px 3px; border-radius: 2px; white-space: nowrap;">${j.id}</div>`,
          iconSize: [30, 16],
          iconAnchor: [15, -8],
        });
        L.marker([j.lat, j.lng], { icon: labelIcon, interactive: false }).addTo(layers);
      }
    });
  }, [junctions, roads, onJunctionClick, routePath, sourceJunction, destinationJunction]);

  // Fly to
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 15, { duration: 0.8 });
    }
  }, [flyTo]);

  return <div ref={containerRef} className="h-full w-full" />;
}
