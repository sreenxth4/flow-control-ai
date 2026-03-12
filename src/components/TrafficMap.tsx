import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Junction, Road, DensityLevel, TurnRestriction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import "./map-styles.css";

// Density colors: GREEN/ORANGE/RED
const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#00AA00",
  MEDIUM: "#FF8800",
  HIGH: "#FF0000",
};

// Road colors: BLACK for major roads (50+), GREY for local roads (40)
const getRoadColor = (speedLimit: number) => speedLimit >= 50 ? "#1a1a1a" : "#999999";

// Fixed compact marker size matching Upload & Analyze map style
const getMarkerSize = (_vehicleCount?: number) => 10;

// Turn restriction icons
const RESTRICTION_ICONS: Record<string, string> = {
  no_left: "🚫⬅",
  no_right: "🚫➡",
  no_uturn: "🚫↩",
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

    // Build route road set for highlighting (single route)
    const routeRoadSet = new Set<string>();
    if (routePath && routePath.length > 1) {
      for (let i = 0; i < routePath.length - 1; i++) {
        routeRoadSet.add(`${routePath[i]}-${routePath[i + 1]}`);
      }
    }

    // Build multi-route road sets
    const multiRouteRoadSets = multiRoutePaths.map(r => {
      const set = new Set<string>();
      for (let i = 0; i < r.path.length - 1; i++) {
        set.add(`${r.path[i]}-${r.path[i + 1]}`);
      }
      return { set, color: r.color };
    });

    // Draw roads first (under markers)
    roads.forEach((road) => {
      const from = junctionMap.get(road.from_junction);
      const to = junctionMap.get(road.to_junction);
      if (!from || !to) return;

      const isOnRoute = routeRoadSet.has(`${road.from_junction}-${road.to_junction}`);
      const multiRouteMatch = multiRouteRoadSets.find(r => r.set.has(`${road.from_junction}-${road.to_junction}`));
      const roadColor = getRoadColor(road.speed_limit);
      const weight = 1.5 + road.lanes * 0.75;

      const lineColor = multiRouteMatch ? multiRouteMatch.color : isOnRoute ? "#FF0000" : roadColor;
      const lineWeight = multiRouteMatch || isOnRoute ? 6 : weight;
      const lineOpacity = multiRouteMatch || isOnRoute ? 1 : 0.7;

      const line = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        {
          color: lineColor,
          weight: lineWeight,
          opacity: lineOpacity,
        }
      );

      // Road details tooltip on hover
      const lengthM = (road.length_km * 1000).toFixed(0);
      const baseCost = ((road.length_km / road.speed_limit) * 3600).toFixed(1);
      line.bindTooltip(
        `<div style="min-width:140px; font-size: 12px;">
          <strong>${road.name}</strong><br/>
          <span style="color:#666">${road.from_junction} → ${road.to_junction}</span><br/>
          📏 ${lengthM}m | 🚗 ${road.speed_limit} km/h<br/>
          🛣️ ${road.lanes} lanes | ⏱️ ${baseCost}s
        </div>`,
        { sticky: true, direction: "top" }
      );
      
      // Popup on click with more details
      line.bindPopup(
        `<div style="min-width:160px">
          <strong>${road.name}</strong><br/>
          <span style="color:#666">${road.from_junction} → ${road.to_junction}</span><br/>
          Length: ${lengthM}m | Speed: ${road.speed_limit} km/h<br/>
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
          html: `<div style="transform: rotate(${angle}deg); color: ${lineColor}; opacity: 0.6; font-size: 14px;">▲</div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }).addTo(layers);
      }
    });

    // All route paths for junction highlighting
    const allRoutePaths = new Set<string>(routePath || []);
    multiRoutePaths.forEach(r => r.path.forEach(p => allRoutePaths.add(p)));

    // Draw junctions
    junctions.forEach((j) => {
      const isSource = sourceJunction === j.id;
      const isDest = destinationJunction === j.id;
      const isOnRoute = allRoutePaths.has(j.id);

      const currentDensity = j.density;
      const color = !currentDensity ? "#CCCCCC" : isSource ? "#3b82f6" : isDest ? "#ef4444" : DENSITY_COLORS[currentDensity];
      const radius = isSource || isDest ? 16 : getMarkerSize(j.vehicle_count);
      const weight = isSource || isDest ? 3 : 2;

      // Create pulsing div icon for animated density
      const markerIcon = L.divIcon({
        className: "junction-marker",
        html: `<div class="junction-circle animate-density-pulse" style="
          width: ${radius * 2}px; 
          height: ${radius * 2}px; 
          background-color: ${color}; 
          border: ${weight}px solid ${isOnRoute ? '#FFD700' : '#fff'};
          border-radius: 50%;
          opacity: 0.9;
        "></div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });

      const marker = L.marker([j.lat, j.lng], { icon: markerIcon });

      const incomingRoads = roads.filter(r => r.to_junction === j.id).map(r => r.id).join(", ");
      const outgoingRoads = roads.filter(r => r.from_junction === j.id).map(r => r.id).join(", ");

      marker.bindPopup(
        `<div style="min-width:180px">
          <strong>${j.id}: ${j.name}</strong><br/>
          Vehicles: ${j.vehicle_count ?? 0} | Density: <strong>${currentDensity || "N/A"}</strong><br/>
          ${j.total_pcu ? `PCU: ${j.total_pcu}<br/>` : ""}
          <span style="color:#666">Incoming:</span> ${incomingRoads || "none"}<br/>
          <span style="color:#666">Outgoing:</span> ${outgoingRoads || "none"}
        </div>`
      );
      marker.on("click", () => onJunctionClick(j.id));
      layers.addLayer(marker);

      const labelText = (j.name || j.id || "").trim() || j.id;
      const labelWidth = Math.min(240, Math.max(64, labelText.length * 7));
      const labelIcon = L.divIcon({
        className: "junction-name-label",
        html: `<div style="display:inline-block; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.96); color:#111827; border:1px solid rgba(17,24,39,0.15); font-size:11px; font-weight:700; line-height:1.2; white-space:nowrap; box-shadow:0 1px 3px rgba(0,0,0,0.2);">${labelText}</div>`,
        iconSize: [labelWidth, 20],
        iconAnchor: [Math.floor(labelWidth / 2), -12],
      });
      L.marker([j.lat, j.lng], {
        icon: labelIcon,
        interactive: false,
        keyboard: false,
      }).addTo(layers);
    });

    // Draw turn restrictions at zoom 15+
    if (showTurnRestrictions && mapRef.current && mapRef.current.getZoom() >= 15) {
      turnRestrictions.forEach((tr) => {
        const junction = junctionMap.get(tr.junction_id);
        if (!junction) return;

        const icon = RESTRICTION_ICONS[tr.restriction_type] || "🚫";
        
        // Offset based on restriction type
        const offsetLat = tr.restriction_type === "no_uturn" ? 0.0005 : 0.0003;
        const offsetLng = tr.restriction_type === "no_left" ? -0.0005 : 0.0005;

        const restrictionIcon = L.divIcon({
          className: 'turn-restriction',
          html: `<div style="
            font-size: 16px; 
            background: rgba(255,255,255,0.9); 
            padding: 2px 4px; 
            border-radius: 4px; 
            border: 1px solid #ef4444;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          ">${icon}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        
        L.marker([junction.lat + offsetLat, junction.lng + offsetLng], { 
          icon: restrictionIcon, 
          interactive: true 
        })
          .bindTooltip(`${tr.restriction_type.replace(/_/g, ' ').toUpperCase()}<br/>From: ${tr.from_road} → ${tr.to_road}`)
          .addTo(layers);
      });
    }
  }, [junctions, roads, onJunctionClick, routePath, sourceJunction, destinationJunction, showTurnRestrictions, turnRestrictions, multiRoutePaths]);

  // Fly to with enhanced zoom and highlight animation
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 16, { duration: 0.8 });
      
      // Remove previous highlight
      if (highlightRef.current && layersRef.current) {
        layersRef.current.removeLayer(highlightRef.current);
      }

      // Add temporary highlight circle that fades
      const highlight = L.circleMarker(flyTo, {
        radius: 30,
        fillColor: "#FFD700",
        fillOpacity: 0.5,
        color: "#FFD700",
        weight: 3,
        className: "junction-highlight-pulse",
      });
      
      if (layersRef.current) {
        highlight.addTo(layersRef.current);
        highlightRef.current = highlight;
        
        // Fade out and remove after 2 seconds
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
    setShowTurnRestrictions(prev => !prev);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      
      {/* Turn restrictions toggle */}
      <div className="absolute top-4 left-4 z-[1000]">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleTurnRestrictions}
          className="shadow-lg"
        >
          {showTurnRestrictions ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
          Turn Restrictions
        </Button>
      </div>
    </div>
  );
}
