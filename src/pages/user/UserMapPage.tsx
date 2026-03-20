import { useEffect, useRef, useState } from "react";
import { useMapData } from "@/hooks/use-map-data";
import { MockDataBanner } from "@/components/MockDataBanner";
import { isUsingMockData } from "@/lib/api";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@/components/map-styles.css";
import {
  getRoadColorByDensity,
  getMarkerSize,
  createJunctionMarkerHTML,
  createJunctionLabelHTML,
  createJunctionTooltipHTML,
  createJunctionPopupHTML,
  createRoadTooltipHTML,
  createSignalDotHTML,
  getSignalDotOffsets,
  resolveCoords,
} from "@/components/map-utils";
import { fetchAllRoadGeometries } from "@/lib/osrm";
import type { DensityLevel } from "@/lib/types";

const UserMapPage = () => {
  const { data } = useMapData();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

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

  useEffect(() => {
    const layers = layersRef.current;
    if (!layers || !data || !mapReady) return;
    if (!Array.isArray(data.junctions) || !Array.isArray(data.roads)) return;

    let cancelled = false;

    const draw = async () => {
      const junctionMap = new Map(
        data.junctions
          .map((j) => {
            const coords = resolveCoords(j);
            if (!coords) return null;
            return [j.id, { ...j, lat: coords.lat, lng: coords.lng }] as const;
          })
          .filter((e): e is NonNullable<typeof e> => e !== null)
      );

      // Fetch real road geometries
      const coordsMap = new Map<string, { lat: number; lng: number }>();
      junctionMap.forEach((v, k) => coordsMap.set(k, { lat: v.lat, lng: v.lng }));
      const geometries = await fetchAllRoadGeometries(data.roads, coordsMap);

      if (cancelled) return;
      layers.clearLayers();

      // Roads with OSRM geometry
      data.roads.forEach((road) => {
        const from = junctionMap.get(road.from_junction);
        const to = junctionMap.get(road.to_junction);
        if (!from || !to) return;

        const lineColor = getRoadColorByDensity(from.density, to.density);
        const weight = 2 + road.lanes * 0.8;
        const routeCoords = geometries.get(road.id) || [[from.lat, from.lng], [to.lat, to.lng]];

        const line = L.polyline(routeCoords as L.LatLngTuple[], { color: lineColor, weight, opacity: 0.65 });
        line.bindTooltip(
          createRoadTooltipHTML({ name: road.name, from: road.from_junction, to: road.to_junction, lengthKm: road.length_km, speedLimit: road.speed_limit, lanes: road.lanes }),
          { sticky: true, direction: "top" }
        );
        line.bindPopup(
          createRoadTooltipHTML({ name: road.name, from: road.from_junction, to: road.to_junction, lengthKm: road.length_km, speedLimit: road.speed_limit, lanes: road.lanes })
        );
        layers.addLayer(line);
      });

      // Junctions + signal dots
      const densityMap = new Map<string, { lat: number; lng: number; density?: DensityLevel }>();
      junctionMap.forEach((v, k) => densityMap.set(k, { lat: v.lat, lng: v.lng, density: v.density }));

      data.junctions.forEach((j) => {
        const coords = resolveCoords(j);
        if (!coords) return;

        const radius = getMarkerSize(j.vehicle_count);
        const markerIcon = L.divIcon({
          className: "junction-marker",
          html: createJunctionMarkerHTML({ density: j.density, radius }),
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        });

        const marker = L.marker([coords.lat, coords.lng], { icon: markerIcon });
        marker.bindTooltip(
          createJunctionTooltipHTML({ id: j.id, name: j.name, type: j.type, density: j.density, vehicleCount: j.vehicle_count, totalPcu: j.total_pcu }),
          { direction: "top", offset: [0, -12] }
        );
        marker.bindPopup(
          createJunctionPopupHTML({ id: j.id, name: j.name, type: j.type, density: j.density, vehicleCount: j.vehicle_count, totalPcu: j.total_pcu })
        );
        layers.addLayer(marker);

        // Label
        const labelText = (j.name || j.id || "").trim() || j.id;
        const labelWidth = Math.min(240, Math.max(64, labelText.length * 7.5));
        const labelIcon = L.divIcon({
          className: "junction-name-label",
          html: createJunctionLabelHTML(labelText),
          iconSize: [labelWidth, 20],
          iconAnchor: [Math.floor(labelWidth / 2), -16],
        });
        L.marker([coords.lat, coords.lng], { icon: labelIcon, interactive: false, keyboard: false }).addTo(layers);

        // Signal direction dots
        const dots = getSignalDotOffsets(j.id, coords.lat, coords.lng, data.roads, densityMap);
        dots.forEach((dot) => {
          const dotIcon = L.divIcon({
            className: "signal-dot",
            html: createSignalDotHTML(dot.density),
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          });
          L.marker([dot.lat, dot.lng], { icon: dotIcon, interactive: false, keyboard: false }).addTo(layers);
        });
      });
    };

    draw();
    return () => { cancelled = true; };
  }, [data, mapReady]);

  return (
    <div className="relative h-full w-full">
      {isUsingMockData() && <MockDataBanner />}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

export default UserMapPage;
