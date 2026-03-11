import { useEffect, useRef } from "react";
import { useMapData } from "@/hooks/use-map-data";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DensityLevel } from "@/lib/types";

// Density colors: GREEN/ORANGE/RED
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#00AA00",
  MEDIUM: "#FF8800",
  HIGH: "#FF0000",
};

// Road colors: BLACK for major (50+ km/h), GREY for local (40 km/h)
const getRoadColor = (speedLimit: number) => speedLimit >= 50 ? "#1a1a1a" : "#999999";

// Marker size by vehicle count
const getMarkerSize = (vehicleCount?: number) => {
  const count = vehicleCount || 0;
  return Math.min(35, 12 + count * 0.8);
};

// One-way roads
const ONE_WAY_ROADS = ["R14", "R38", "R42", "R49", "R58", "R72", "R83", "R85", "R93", "R94"];

const UserMapPage = () => {
  const { data } = useMapData();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Init map - Kukatpally center
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

      const roadColor = getRoadColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        {
          color: roadColor,
          weight,
          opacity: 0.7,
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
    });

    // Junctions
    data.junctions.forEach((j) => {
      const color = j.density ? DENSITY_COLORS[j.density] : "#CCCCCC";
      const radius = getMarkerSize(j.vehicle_count);
      
      const marker = L.circleMarker([j.lat, j.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.9,
        color: "#fff",
        weight: 2,
      });
      
      const densityLabel = j.density || "No data";
      const pcuLine = j.vehicle_count != null && j.total_pcu != null
        ? `<br/>${j.vehicle_count} vehicles (${j.total_pcu} PCU)`
        : "";
      marker.bindPopup(
        `<div style="min-width:160px">
          <strong>${j.id}: ${j.name}</strong><br/>
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
