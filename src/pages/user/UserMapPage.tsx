import { useEffect, useRef, useCallback } from "react";
import { useMapData } from "@/hooks/use-map-data";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DensityLevel } from "@/lib/types";

const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#eab308",
  HIGH: "#ef4444",
};

const UserMapPage = () => {
  const { data } = useMapData();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Init map
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
    return () => { map.remove(); mapRef.current = null; layersRef.current = null; };
  }, []);

  // Update markers + roads
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !data) return;
    layers.clearLayers();

    const junctionMap = new Map(data.junctions.map((j) => [j.id, j]));

    // Roads
    data.roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;
      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        {
          color: "hsl(210, 60%, 50%)",
          weight: Math.max(2, road.lanes),
          opacity: 0.5,
          dashArray: road.lanes <= 2 ? "6 4" : undefined,
        }
      );
      line.bindPopup(`<div class="text-sm"><strong>${road.name}</strong><br/>Lanes: ${road.lanes} · ${road.speed_limit} km/h · ${road.length_km} km</div>`);
      layers.addLayer(line);
    });

    // Junctions
    data.junctions.forEach((j) => {
      const color = j.density ? DENSITY_COLORS[j.density] : "#6b7280";
      const marker = L.circleMarker([j.lat, j.lng], {
        radius: 11,
        fillColor: color,
        fillOpacity: 0.85,
        color: "#fff",
        weight: 2,
      });
      const densityLabel = j.density || "No data";
      const pcuLine = j.vehicle_count != null && j.total_pcu != null
        ? `<br/>${j.vehicle_count} vehicles (${j.total_pcu} PCU)`
        : "";
      marker.bindPopup(
        `<div style="min-width:140px">
          <strong>${j.name}</strong> <span style="color:#888">(${j.id})</span><br/>
          <span style="color:#888">Type:</span> ${j.type}<br/>
          <span style="color:#888">Density:</span> <strong>${densityLabel}</strong>${pcuLine}
        </div>`
      );
      layers.addLayer(marker);
    });
  }, [data]);

  return (
    <div className="relative h-full w-full">
      {isUsingMockData() && <MockDataBanner />}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default UserMapPage;
