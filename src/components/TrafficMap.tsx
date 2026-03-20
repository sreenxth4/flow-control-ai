import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel, TurnRestriction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import "./map-styles.css";
import {
  DENSITY_COLORS,
  getRoadColorByDensity,
  getMarkerSize,
  createJunctionMarkerHTML,
  createJunctionLabelHTML,
  createJunctionTooltipHTML,
  createJunctionPopupHTML,
  createRoadTooltipHTML,
  createSignalDotHTML,
  getSignalDotOffsets,
} from "./map-utils";
import { fetchAllRoadGeometries } from "@/lib/osrm";

const RESTRICTION_ICONS: Record<string, string> = {
  no_left: "🚫⬅",
  no_right: "🚫➡",
  no_uturn: "🚫↩",
};

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
  turnRestrictions?: TurnRestriction[];
  multiRoutePaths?: { path: string[]; color: string }[];
}

export function TrafficMap({
  junctions,
  roads,
  flyTo,
  onJunctionClick,
  routePath,
  sourceJunction,
  destinationJunction,
  turnRestrictions = [],
  multiRoutePaths = [],
}: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const highlightRef = useRef<L.CircleMarker | null>(null);
  const [showTurnRestrictions, setShowTurnRestrictions] = useState(true);

  // Initialize map
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

  // Update markers and roads with OSRM geometry
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;

    let cancelled = false;

    const draw = async () => {
      const junctionMap = new Map<string, Junction>();
      junctions.forEach((j) => junctionMap.set(j.id, j));

      // Fetch real road geometries (cached after first call)
      const coordsMap = new Map<string, { lat: number; lng: number }>();
      junctions.forEach((j) => coordsMap.set(j.id, { lat: j.lat, lng: j.lng }));
      const geometries = await fetchAllRoadGeometries(roads, coordsMap);

      if (cancelled) return;
      layers.clearLayers();

      // Route highlighting sets
      const routeRoadSet = new Set<string>();
      if (routePath && routePath.length > 1) {
        for (let i = 0; i < routePath.length - 1; i++) {
          routeRoadSet.add(`${routePath[i]}-${routePath[i + 1]}`);
        }
      }
      const multiRouteRoadSets = multiRoutePaths.map((r) => {
        const set = new Set<string>();
        for (let i = 0; i < r.path.length - 1; i++) {
          set.add(`${r.path[i]}-${r.path[i + 1]}`);
        }
        return { set, color: r.color };
      });

      // Draw roads with real geometry
      roads.forEach((road) => {
        const from = junctionMap.get(road.from_junction);
        const to = junctionMap.get(road.to_junction);
        if (!from || !to) return;

        const isOnRoute = routeRoadSet.has(`${road.from_junction}-${road.to_junction}`);
        const multiRouteMatch = multiRouteRoadSets.find((r) =>
          r.set.has(`${road.from_junction}-${road.to_junction}`)
        );

        const lineColor = multiRouteMatch
          ? multiRouteMatch.color
          : isOnRoute
            ? "#FF0000"
            : getRoadColorByDensity(from.density, to.density);
        const weight = multiRouteMatch || isOnRoute ? 6 : 2 + road.lanes * 0.8;
        const lineOpacity = multiRouteMatch || isOnRoute ? 1 : 0.65;

        // Use OSRM geometry or fallback to straight line
        const routeCoords = geometries.get(road.id) || [[from.lat, from.lng], [to.lat, to.lng]];
        const line = L.polyline(routeCoords as L.LatLngTuple[], {
          color: lineColor,
          weight,
          opacity: lineOpacity,
        });

        line.bindTooltip(
          createRoadTooltipHTML({ name: road.name, from: road.from_junction, to: road.to_junction, lengthKm: road.length_km, speedLimit: road.speed_limit, lanes: road.lanes }),
          { sticky: true, direction: "top" }
        );
        line.bindPopup(
          createRoadTooltipHTML({ name: road.name, from: road.from_junction, to: road.to_junction, lengthKm: road.length_km, speedLimit: road.speed_limit, lanes: road.lanes })
        );
        layers.addLayer(line);

        // Direction arrow at 60% along the OSRM path
        if (mapRef.current && mapRef.current.getZoom() >= 14 && routeCoords.length >= 2) {
          const midIdx = Math.floor(routeCoords.length * 0.6);
          const prevIdx = Math.max(0, midIdx - 1);
          const midPoint = routeCoords[midIdx];
          const prevPoint = routeCoords[prevIdx];
          const angle = Math.atan2(midPoint[1] - prevPoint[1], midPoint[0] - prevPoint[0]) * (180 / Math.PI);

          const arrowIcon = L.divIcon({
            className: "road-arrow",
            html: `<div style="transform: rotate(${angle}deg); color: ${lineColor}; opacity: 0.6; font-size: 14px;">▲</div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker([midPoint[0], midPoint[1]], { icon: arrowIcon, interactive: false }).addTo(layers);
        }
      });

      // All route paths for junction highlighting
      const allRoutePaths = new Set<string>(routePath || []);
      multiRoutePaths.forEach((r) => r.path.forEach((p) => allRoutePaths.add(p)));

      // Draw junctions
      const densityJunctionMap = new Map<string, { lat: number; lng: number; density?: DensityLevel }>();
      junctions.forEach((j) => densityJunctionMap.set(j.id, { lat: j.lat, lng: j.lng, density: j.density }));

      junctions.forEach((j) => {
        const isSource = sourceJunction === j.id;
        const isDest = destinationJunction === j.id;
        const isOnRoute = allRoutePaths.has(j.id);

        const radius = isSource || isDest ? 18 : getMarkerSize(j.vehicle_count);
        const borderColor = isOnRoute ? "#FFD700" : "rgba(255,255,255,0.9)";
        const borderWidth = isSource || isDest ? 3.5 : isOnRoute ? 3 : 2.5;
        const specialColor = isSource ? "#3b82f6" : isDest ? "#ef4444" : undefined;

        const markerIcon = L.divIcon({
          className: "junction-marker",
          html: createJunctionMarkerHTML({ density: j.density, radius, borderColor, borderWidth, isSpecial: isSource || isDest, specialColor }),
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        });

        const marker = L.marker([j.lat, j.lng], { icon: markerIcon });

        const incomingRoads = roads.filter((r) => r.to_junction === j.id).map((r) => r.id).join(", ");
        const outgoingRoads = roads.filter((r) => r.from_junction === j.id).map((r) => r.id).join(", ");

        marker.bindTooltip(
          createJunctionTooltipHTML({ id: j.id, name: j.name, density: j.density, vehicleCount: j.vehicle_count, totalPcu: j.total_pcu }),
          { direction: "top", offset: [0, -12] }
        );
        marker.bindPopup(
          createJunctionPopupHTML({ id: j.id, name: j.name, density: j.density, vehicleCount: j.vehicle_count, totalPcu: j.total_pcu, incomingRoads, outgoingRoads })
        );
        marker.on("click", () => onJunctionClick(j.id));
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
        L.marker([j.lat, j.lng], { icon: labelIcon, interactive: false, keyboard: false }).addTo(layers);

        // Signal direction dots
        const dots = getSignalDotOffsets(j.id, j.lat, j.lng, roads, densityJunctionMap);
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

      // Turn restrictions
      if (showTurnRestrictions && mapRef.current && mapRef.current.getZoom() >= 15) {
        turnRestrictions.forEach((tr) => {
          const junction = junctionMap.get(tr.junction_id);
          if (!junction) return;
          const icon = RESTRICTION_ICONS[tr.restriction_type] || "🚫";
          const offsetLat = tr.restriction_type === "no_uturn" ? 0.0005 : 0.0003;
          const offsetLng = tr.restriction_type === "no_left" ? -0.0005 : 0.0005;
          const restrictionIcon = L.divIcon({
            className: "turn-restriction",
            html: `<div style="font-size:16px;background:rgba(255,255,255,0.9);padding:2px 4px;border-radius:4px;border:1px solid #ef4444;box-shadow:0 1px 3px rgba(0,0,0,0.2)">${icon}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          L.marker([junction.lat + offsetLat, junction.lng + offsetLng], { icon: restrictionIcon, interactive: true })
            .bindTooltip(`${tr.restriction_type.replace(/_/g, " ").toUpperCase()}<br/>From: ${tr.from_road} → ${tr.to_road}`)
            .addTo(layers);
        });
      }
    };

    draw();
    return () => { cancelled = true; };
  }, [junctions, roads, onJunctionClick, routePath, sourceJunction, destinationJunction, showTurnRestrictions, turnRestrictions, multiRoutePaths]);

  // Fly to
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 16, { duration: 0.8 });
      if (highlightRef.current && layersRef.current) {
        layersRef.current.removeLayer(highlightRef.current);
      }
      const highlight = L.circleMarker(flyTo, {
        radius: 30, fillColor: "#FFD700", fillOpacity: 0.5, color: "#FFD700", weight: 3,
        className: "junction-highlight-pulse",
      });
      if (layersRef.current) {
        highlight.addTo(layersRef.current);
        highlightRef.current = highlight;
        setTimeout(() => {
          if (layersRef.current && highlightRef.current) {
            layersRef.current.removeLayer(highlightRef.current);
            highlightRef.current = null;
          }
        }, 2000);
      }
    }
  }, [flyTo]);

  const toggleTurnRestrictions = useCallback(() => {
    setShowTurnRestrictions((prev) => !prev);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-4 left-4 z-[1000]">
        <Button variant="secondary" size="sm" onClick={toggleTurnRestrictions} className="shadow-lg">
          {showTurnRestrictions ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
          Turn Restrictions
        </Button>
      </div>
    </div>
  );
}
