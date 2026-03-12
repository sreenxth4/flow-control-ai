import { useEffect, useRef, useState } from "react";
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

// Fixed compact marker size matching Upload & Analyze map style
const getMarkerSize = (_vehicleCount?: number) => 10;

// One-way roads
const ONE_WAY_ROADS = ["R14", "R38", "R42", "R49", "R58", "R72", "R83", "R85", "R93", "R94"];

const resolveCoords = (junction: any): { lat: number; lng: number } | null => {
  const lat = junction?.lat ?? junction?.latitude;
  const lng = junction?.lng ?? junction?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

const UserMapPage = () => {
  const { data } = useMapData();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

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
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; layersRef.current = null; setMapReady(false); };
  }, []);

  // Update markers + roads
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !data || !mapReady) return;
    // Defensive: ensure junctions and roads are arrays
    if (!Array.isArray(data.junctions) || !Array.isArray(data.roads)) return;
    layers.clearLayers();

    const safeJunctions = data.junctions;
    const safeRoads = data.roads;

    const junctionMap = new Map(
      safeJunctions
        .map((j) => {
          const coords = resolveCoords(j);
          if (!coords) return null;
          return [j.id, { ...j, lat: coords.lat, lng: coords.lng }] as const;
        })
        .filter((entry): entry is readonly [string, (typeof safeJunctions)[number] & { lat: number; lng: number }] => entry !== null)
    );

    // Roads
    safeRoads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) {
        // Log missing junctions for debugging, but skip drawing
        // eslint-disable-next-line no-console
        console.warn(`Missing junction for road ${road.id}: from=${road.from_junction}, to=${road.to_junction}`);
        return;
      }

      // Validate lat/lng values
      if ([from.lat, from.lng, to.lat, to.lng].some(v => typeof v !== "number" || isNaN(v))) {
        console.warn(`Invalid lat/lng for road ${road.id}`);
        return;
      }
      const latlngs: L.LatLngTuple[] = [[from.lat, from.lng], [to.lat, to.lng]];

      const roadColor = getRoadColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      const line = L.polyline(
        latlngs,
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
    safeJunctions.forEach((j) => {
      const coords = resolveCoords(j);

      // Validate lat/lng values for junction marker
      if (!coords) {
        // eslint-disable-next-line no-console
        console.warn(`Invalid lat/lng for junction ${j.id}`);
        return;
      }

      const currentDensity = j.density;
      const color = currentDensity ? DENSITY_COLORS[currentDensity] : "#CCCCCC";
      const radius = Math.max(8, getMarkerSize(j.vehicle_count));

      // Reliable junction rendering with vector marker
      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius,
        fillColor: color,
        fillOpacity: 0.95,
        color: "#ffffff",
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

      const labelText = (j.name || j.id || "").trim() || j.id;
      const labelWidth = Math.min(240, Math.max(64, labelText.length * 7));
      const labelIcon = L.divIcon({
        className: "junction-name-label",
        html: `<div style="display:inline-block; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.96); color:#111827; border:1px solid rgba(17,24,39,0.15); font-size:11px; font-weight:700; line-height:1.2; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,0.2);">${labelText}</div>`,
        iconSize: [labelWidth, 20],
        iconAnchor: [Math.floor(labelWidth / 2), -12],
      });
      L.marker([coords.lat, coords.lng], {
        icon: labelIcon,
        interactive: false,
        keyboard: false,
      }).addTo(layers);
    });
  }, [data, mapReady]);

  return (
    <div className="relative h-full w-full">
      {isUsingMockData() && <MockDataBanner />}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default UserMapPage;
