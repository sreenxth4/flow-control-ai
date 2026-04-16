import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-polylinedecorator";
import type { Junction, Road, DensityLevel, TurnRestriction } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import "./junction-label.css";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000";

// Import static road geometries
import roadGeometries from "@/data/road_geometries.json";

// ─── Constants ───────────────────────────────────────────────────────────────

// Signal colors represent traffic CONDITION, not phase
// GREEN = flowing (LOW/MEDIUM), RED = congested (HIGH)
const DENSITY_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#22c55e",
  HIGH: "#ef4444",
};

const GRAY = "#9ca3af";
const NEUTRAL_JUNCTION = "#1f2937"; // dark neutral color for junction markers

const getDensityColor = (density?: string | null): string =>
  density ? DENSITY_COLORS[density] || GRAY : GRAY;

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrafficMapProps {
  junctions: Junction[];
  roads: Road[];
  flyTo: [number, number] | null;
  onJunctionClick: (id: string) => void;
  routePath?: string[];
  sourceJunction?: string | null;
  destinationJunction?: string | null;
  turnRestrictions?: TurnRestriction[];
  multiRoutePaths?: { path: string[]; roads?: string[]; color: string }[];
  highlightJunctionId?: string;
  roadStates?: Record<string, { density?: string; pcu?: number; source?: string; signal?: string; vehicles?: number }>;
}

interface JunctionSignalData {
  density_level?: string;
  total_pcu?: number;
  green_duration?: number;
  active_green_road?: string;
  time_remaining?: number;
  phase_schedule?: any[];
  roads?: Record<
    string,
    {
      pcu: number;
      density: string;
      source: string;
      queue: number;
      vehicles: number;
      signal?: string;
      wait_time?: number;
    }
  >;
}

type RoadGeometries = Record<string, [number, number][]>;
const typedGeometries: RoadGeometries = roadGeometries as any;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeJunctionCenter(
  junctionId: string,
  junctionData: { incoming_roads?: string[]; outgoing_roads?: string[] },
  geoms: RoadGeometries
): [number, number] | null {
  const points: [number, number][] = [];

  for (const roadId of junctionData.incoming_roads || []) {
    const coords = geoms[roadId];
    if (coords && coords.length > 0) {
      points.push(coords[coords.length - 1]);
    }
  }

  for (const roadId of junctionData.outgoing_roads || []) {
    const coords = geoms[roadId];
    if (coords && coords.length > 0) {
      points.push(coords[0]);
    }
  }

  if (points.length === 0) return null;

  const avgLat = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const avgLng = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [avgLat, avgLng];
}

/**
 * Walk backwards along a road geometry polyline by a given distance (in degrees).
 * Returns a point that is guaranteed to be ON the road, not extrapolated off it.
 */
function walkBackAlongGeometry(
  geom: [number, number][],
  distBack: number
): [number, number] {
  let remaining = distBack;
  for (let i = geom.length - 1; i > 0; i--) {
    const [lat1, lng1] = geom[i];
    const [lat2, lng2] = geom[i - 1];
    const segDist = Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
    if (remaining <= segDist && segDist > 0) {
      const ratio = remaining / segDist;
      return [lat1 + ratio * (lat2 - lat1), lng1 + ratio * (lng2 - lng1)];
    }
    remaining -= segDist;
  }
  // If road is shorter than desired pullback, return a point near the start
  return geom[Math.min(1, geom.length - 1)];
}

/**
 * Walk FORWARD along a road geometry polyline from the START by a given distance.
 * Used to find a point on the road a short distance from the junction.
 */
function walkForwardAlongGeometry(
  geom: [number, number][],
  distForward: number
): [number, number] {
  let remaining = distForward;
  for (let i = 0; i < geom.length - 1; i++) {
    const [lat1, lng1] = geom[i];
    const [lat2, lng2] = geom[i + 1];
    const segDist = Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
    if (remaining <= segDist && segDist > 0) {
      const ratio = remaining / segDist;
      return [lat1 + ratio * (lat2 - lat1), lng1 + ratio * (lng2 - lng1)];
    }
    remaining -= segDist;
  }
  return geom[Math.max(geom.length - 2, 0)];
}

/**
 * Find the first point in a road's geometry (walking from junction end)
 * that is NOT shared by any of the other roads.
 * This places the signal dot exactly where the road visually diverges from others.
 */
function findDivergencePoint(
  roadId: string,
  allRoadIds: string[],
  geoms: RoadGeometries
): [number, number] | null {
  const geom = geoms[roadId];
  if (!geom || geom.length < 2) return null;

  // Build a set of coordinate strings from OTHER roads for fast lookup
  const otherCoords = new Set<string>();
  for (const otherId of allRoadIds) {
    if (otherId === roadId) continue;
    const otherGeom = geoms[otherId];
    if (!otherGeom) continue;
    for (const pt of otherGeom) {
      otherCoords.add(`${pt[0].toFixed(5)},${pt[1].toFixed(5)}`);
    }
  }

  // Walk from the junction end backwards to find first unique point
  for (let i = geom.length - 1; i >= 0; i--) {
    const key = `${geom[i][0].toFixed(5)},${geom[i][1].toFixed(5)}`;
    if (!otherCoords.has(key)) {
      // Found a unique point — use the midpoint between this and the next shared point
      // for smoother placement on the road
      if (i < geom.length - 1) {
        return [
          (geom[i][0] + geom[i + 1][0]) / 2,
          (geom[i][1] + geom[i + 1][1]) / 2,
        ];
      }
      return geom[i];
    }
  }

  // All points shared — fallback to a point near the start
  return geom[Math.min(2, geom.length - 1)];
}

// ─── Component ───────────────────────────────────────────────────────────────

const EMPTY_ARRAY: any[] = [];

export function TrafficMap({
  junctions,
  roads,
  flyTo,
  onJunctionClick,
  routePath,
  sourceJunction,
  destinationJunction,
  turnRestrictions = EMPTY_ARRAY,
  multiRoutePaths = EMPTY_ARRAY,
  highlightJunctionId,
  roadStates = {},
}: TrafficMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const highlightRef = useRef<L.CircleMarker | null>(null);
  const signalDotsRef = useRef<Record<string, L.CircleMarker>>({}); // main dot per road
  const signalDotLayerRef = useRef<L.LayerGroup | null>(null);
  const openPopupJunctionRef = useRef<string | null>(null); // track which junction popup is open
  const junctionMarkersRef = useRef<Record<string, L.CircleMarker>>({}); // junction markers by ID
  const roadLinesRef = useRef<Record<string, L.Polyline>>({}); // road polylines by ID
  const [showTurnRestrictions, setShowTurnRestrictions] = useState(true);
  const [routeRenderError, setRouteRenderError] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [isSheetDragging, setIsSheetDragging] = useState(false);

  // Internal state: junction signal data from polling + map region metadata
  const [signalData, setSignalData] = useState<Record<string, JunctionSignalData>>({});
  const [mapRegion, setMapRegion] = useState<any>(null);

  const invalidateMapSize = useCallback(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || container.offsetParent === null) {
      return;
    }

    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
  }, []);

  // ── Fetch map region metadata once (provides incoming_roads / outgoing_roads) ──
  useEffect(() => {
    fetch(`${BASE_URL}/api/v1/map`)
      .then((r) => r.json())
      .then((data) => setMapRegion(data))
      .catch(() => { });
  }, []);

  // ── Poll junction_signals every 5 seconds for live per-road signal data ──
  useEffect(() => {
    const poll = () => {
      fetch(`${BASE_URL}/api/junction_signals`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.junctions) {
            setSignalData(data.junctions);
          } else if (data?.junction_signal_history) {
            setSignalData(data.junction_signal_history);
          }
        })
        .catch(() => { });
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Initialize Leaflet map once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [17.494, 78.388],
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);

    // Create a custom pane for signal dots so they render ABOVE junction markers
    if (!map.getPane("signalPane")) {
      const pane = map.createPane("signalPane");
      const markerZ = getComputedStyle(document.documentElement)
        .getPropertyValue("--z-map-markers")
        .trim();
      pane.style.zIndex = markerZ || "650"; // above markers (default 600)
      pane.style.pointerEvents = "auto";
    }

    // Force size invalidation after initial render (common Leaflet fix for mobile)
    setTimeout(() => {
      invalidateMapSize();
    }, 100);

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [invalidateMapSize]);

  // ── Resize observer: fix Leaflet grey tiles when container resizes ──
  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) return;
    
    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          invalidateMapSize();
        } catch {
          // Map may have been removed — ignore
        }
      }, 60); // Keep map in sync during viewport and sheet transitions.
    });
    ro.observe(container);
    return () => {
      clearTimeout(resizeTimer);
      ro.disconnect();
    };
  }, [invalidateMapSize]); // VERY IMPORTANT: keep dependency array so it only runs on mount

  // ── Explicit map resize triggers for mobile viewport + bottom-sheet lifecycle ──
  useEffect(() => {
    const onViewportChange = () => invalidateMapSize();
    const onSheetSnap = () => invalidateMapSize();
    const onSheetDrag = (event: Event) => {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      setIsSheetDragging(active);
      if (!active) {
        invalidateMapSize();
      }
    };

    const vv = window.visualViewport;
    window.addEventListener("resize", onViewportChange, { passive: true });
    window.addEventListener("orientationchange", onViewportChange, { passive: true });
    window.addEventListener("traffic:sheet-snap", onSheetSnap as EventListener);
    window.addEventListener("traffic:sheet-drag", onSheetDrag as EventListener);
    if (vv) {
      vv.addEventListener("resize", onViewportChange, { passive: true });
      vv.addEventListener("scroll", onViewportChange, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      window.removeEventListener("traffic:sheet-snap", onSheetSnap as EventListener);
      window.removeEventListener("traffic:sheet-drag", onSheetDrag as EventListener);
      if (vv) {
        vv.removeEventListener("resize", onViewportChange);
        vv.removeEventListener("scroll", onViewportChange);
      }
    };
  }, [invalidateMapSize]);

  // ── Gesture arbitration: lock map pan/zoom while sheet drag is active ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isSheetDragging) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      return;
    }

    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
  }, [isSheetDragging]);

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN RENDERING EFFECT
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers) return;

    setRouteRenderError(null);

    layers.clearLayers();
    junctionMarkersRef.current = {};
    roadLinesRef.current = {};

    // Build lookups
    const regionJunctions: any[] = mapRegion?.junctions || [];
    const regionJunctionMap = new Map<string, any>();
    regionJunctions.forEach((j: any) => regionJunctionMap.set(j.id, j));

    const junctionPropMap = new Map<string, Junction>();
    junctions.forEach((j) => junctionPropMap.set(j.id, j));

    const edgeToRoadId = new Map<string, string>();
    roads.forEach((road) => {
      edgeToRoadId.set(`${road.from_junction}->${road.to_junction}`, road.id);
    });

    const roadById = new Map<string, Road>();
    roads.forEach((road) => {
      roadById.set(road.id, road);
    });

    const getRoadGeometry = (roadId: string): [number, number][] | null => {
      const directGeom = typedGeometries[roadId];
      if (directGeom && directGeom.length >= 2) {
        return directGeom;
      }

      const road = roadById.get(roadId);
      if (!road) {
        return null;
      }

      const reverseRoad = roads.find(
        (r) => r.from_junction === road.to_junction && r.to_junction === road.from_junction
      );
      if (!reverseRoad) {
        return null;
      }

      const reverseGeom = typedGeometries[reverseRoad.id];
      if (!reverseGeom || reverseGeom.length < 2) {
        return null;
      }

      return [...reverseGeom].reverse() as [number, number][];
    };

    const resolveRoadIds = (path: string[], explicitRoadIds?: string[]): string[] => {
      if (explicitRoadIds && explicitRoadIds.length > 0) {
        if (explicitRoadIds.length !== Math.max(0, path.length - 1)) {
          throw new Error("Route road mapping mismatch: roads length does not match path hops");
        }
        return explicitRoadIds;
      }

      const resolved: string[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const key = `${path[i]}->${path[i + 1]}`;
        const roadId = edgeToRoadId.get(key);
        if (!roadId) {
          throw new Error(`Route mapping failed for hop ${path[i]} -> ${path[i + 1]}`);
        }
        resolved.push(roadId);
      }
      return resolved;
    };

    let routeRoadSet = new Set<string>();
    let multiRouteRoadSets: { set: Set<string>; color: string }[] = [];
    try {
      if (routePath && routePath.length > 1) {
        routeRoadSet = new Set(resolveRoadIds(routePath));
      }

      multiRouteRoadSets = multiRoutePaths.map((r) => {
        const resolvedRoads = resolveRoadIds(r.path, r.roads);
        return { set: new Set(resolvedRoads), color: r.color };
      });

      const activeRouteRoads = new Set<string>(routeRoadSet);
      multiRouteRoadSets.forEach((mrs) => mrs.set.forEach((roadId) => activeRouteRoads.add(roadId)));
      for (const roadId of activeRouteRoads) {
        const geom = getRoadGeometry(roadId);
        if (!geom || geom.length < 2) {
          throw new Error(`Missing geometry for road: ${roadId}`);
        }
      }
    } catch (err) {
      setRouteRenderError(err instanceof Error ? err.message : "Route rendering failed");
      return;
    }

    // ── Compute snapped junction centers ──
    const snappedCoords = new Map<string, [number, number]>();
    const allJunctionIds = new Set<string>();
    junctions.forEach((j) => allJunctionIds.add(j.id));
    regionJunctions.forEach((j: any) => allJunctionIds.add(j.id));

    allJunctionIds.forEach((jId) => {
      // First try explicit coordinates from map_region.json or junctions prop
      const regionJ = regionJunctionMap.get(jId);
      if (regionJ) {
        const lat = regionJ.latitude ?? regionJ.lat;
        const lng = regionJ.longitude ?? regionJ.lng;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          snappedCoords.set(jId, [lat, lng]);
          return;
        }
      }
      const propJ = junctionPropMap.get(jId);
      if (propJ) {
        const lat = propJ.lat ?? (propJ as any).latitude;
        const lng = propJ.lng ?? (propJ as any).longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          snappedCoords.set(jId, [lat, lng]);
          return;
        }
      }
      // Fallback: compute from road geometry
      if (regionJ) {
        const center = computeJunctionCenter(jId, regionJ, typedGeometries);
        if (center) {
          snappedCoords.set(jId, center);
        }
      }
    });

    // ─────────────────────────────────────────────────────────────────────
    // DRAW ROAD LINES — colored by per-road density from roadStates
    // ─────────────────────────────────────────────────────────────────────
    const drawnCenterlines = new Set<string>();

    const getOffsetGeom = (coords: number[][], offsetDegrees: number): number[][] => {
      if (coords.length < 2) return coords;
      const result: number[][] = [];
      for (let i = 0; i < coords.length; i++) {
        const pPrev = i > 0 ? coords[i - 1] : null;
        const pCurr = coords[i];
        const pNext = i < coords.length - 1 ? coords[i + 1] : null;

        let dx = 0, dy = 0;
        if (pPrev && pNext) {
          dx = pNext[1] - pPrev[1];
          dy = pNext[0] - pPrev[0];
        } else if (pNext) {
          dx = pNext[1] - pCurr[1];
          dy = pNext[0] - pCurr[0];
        } else if (pPrev) {
          dx = pCurr[1] - pPrev[1];
          dy = pCurr[0] - pPrev[0];
        }

        // Adjust aspect ratio for latitude
        const latCos = Math.cos((pCurr[0] * Math.PI) / 180);
        dx *= latCos;

        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        // Normal vector (left side of travel - LHT)
        const nx = -dy / len;
        const ny = dx / len;

        // Scale back the longitude offset by 1/latCos
        result.push([
          pCurr[0] + ny * offsetDegrees,
          pCurr[1] + (nx * offsetDegrees) / (latCos || 1)
        ]);
      }
      return result;
    };

    roads.forEach((road) => {
      const geom = getRoadGeometry(road.id);
      if (!geom || geom.length < 2) return;

      const DEFAULT_ROAD_COLOR = "#9ca3af";

      const isOnRoute = routeRoadSet.has(road.id);
      const multiRouteMatch = multiRouteRoadSets.find((r) => r.set.has(road.id));

      const lineColor = multiRouteMatch
        ? multiRouteMatch.color
        : isOnRoute
          ? "#2962ff"
          : DEFAULT_ROAD_COLOR;
      
      const lineWeight = multiRouteMatch || isOnRoute ? 6 : 5;
      const lineOpacity = multiRouteMatch || isOnRoute ? 1 : 0.85;

      // Check if this road has a reverse pair
      const pairKey = [road.from_junction, road.to_junction].sort().join("-");
      const hasReverse = roads.some(r => r.from_junction === road.to_junction && r.to_junction === road.from_junction);
      
      // Calculate offset geometry
      const offsetDeg = hasReverse ? 0.000035 : 0; // ~4 meters left offset
      const offsetCoords = getOffsetGeom(geom, offsetDeg);
      const latLngs = offsetCoords.map((c) => L.latLng(c[0], c[1]));

      // 1. Dark outline background for the lane
      const outline = L.polyline(latLngs, {
        color: "#1f2937",
        weight: lineWeight + 3,
        opacity: 0.6,
      });
      layers.addLayer(outline);

      // 2. Colored road line on top
      const line = L.polyline(latLngs, {
        color: lineColor,
        weight: lineWeight,
        opacity: lineOpacity,
      });

      roadLinesRef.current[road.id] = line;
      layers.addLayer(line);

      // 3. Central Yellow Divider (Draw once per undirected pair)
      if (hasReverse && !drawnCenterlines.has(pairKey)) {
        drawnCenterlines.add(pairKey);
        const centerLatLngs = geom.map((c) => L.latLng(c[0], c[1]));
        const centerLine = L.polyline(centerLatLngs, {
          color: "#eab308", // Yellow-500
          weight: 1.5,
          dashArray: "4, 6",
          opacity: 0.8,
        });
        layers.addLayer(centerLine);
      }

      // 4. Directional arrow decorators
      try {
        const decorator = (L as any).polylineDecorator(line, {
          patterns: [
            {
              offset: "50px",
              repeat: 180,
              symbol: (L as any).Symbol.arrowHead({
                pixelSize: 5,
                polygon: true,
                pathOptions: {
                  stroke: false,
                  fillOpacity: 0.9,
                  color: "#ffffff"
                },
              }),
            },
          ],
        });
        layers.addLayer(decorator);
      } catch {
        // polylineDecorator may not be loaded
      }
    });

    // ─────────────────────────────────────────────────────────────────────
    // JUNCTION MARKERS — NEUTRAL color, NO density coloring
    // ─────────────────────────────────────────────────────────────────────
    allJunctionIds.forEach((jId) => {
      const coords = snappedCoords.get(jId);
      if (!coords) return;

      const propJ = junctionPropMap.get(jId);
      const regionJ = regionJunctionMap.get(jId);
      const popupId = `popup-countdown-${jId}`;

      // Junction marker — static, neutral
      const isHighlighted = highlightJunctionId === jId;
      const marker = L.circleMarker(coords, {
        radius: isHighlighted ? 11 : 8,
        fillColor: NEUTRAL_JUNCTION,
        fillOpacity: 0.95,
        color: isHighlighted ? "#FFD700" : "#e5e7eb",
        weight: isHighlighted ? 3 : 1.5,
      });

      // Permanent tooltip with junction name
      marker.bindTooltip(propJ?.name || regionJ?.name || jId, {
        permanent: true,
        direction: "top",
        offset: [0, -12],
        className: "junction-label-tag",
      });

      marker.bindPopup(`<div id="popup-wrapper-${jId}">Loading data...</div>`, { maxWidth: 340 });

      // Track popup open/close to preserve across re-renders
      marker.on("popupopen", () => {
        openPopupJunctionRef.current = jId;

        const tick = () => {
          const el = document.getElementById(popupId);
          if (!el) return;

          const dataTime = parseInt(el.getAttribute("data-time") || "0", 10);
          if (!dataTime) return; // not yet loaded

          const elapsed = Math.floor((Date.now() - dataTime) / 1000);

          // 1. Update main countdown
          const initialRemaining = parseInt(el.getAttribute("data-initial-time") || "0", 10);
          const remaining = Math.max(0, initialRemaining - elapsed);
          el.textContent = `Re-evaluates in: ${remaining}s`;

          // 2. Interpolate wait times for all RED roads
          const waitCells = document.querySelectorAll(`[id^="wait-time-${jId}-"]`);
          waitCells.forEach(waitEl => {
            const rowDataTime = parseInt(waitEl.getAttribute("data-time") || "0", 10);
            if (!rowDataTime) return;
            const elapsedRow = Math.floor((Date.now() - rowDataTime) / 1000);
            const baseWait = parseInt(waitEl.getAttribute("data-base-wait") || "0", 10);
            waitEl.textContent = `${baseWait + elapsedRow}s`;
          });
        };

        tick();
        const iv = setInterval(tick, 1000);
        marker.on("popupclose", () => {
          clearInterval(iv);
          openPopupJunctionRef.current = null;
        }, { once: true } as any);
      });

      marker.on("click", () => onJunctionClick(jId));
      layers.addLayer(marker);
      junctionMarkersRef.current[jId] = marker;
    });

    // ── Turn Restrictions (only at high zoom to avoid clutter) ──
    if (showTurnRestrictions && mapRef.current && mapRef.current.getZoom() >= 16) {
      turnRestrictions.forEach((tr) => {
        const coords = snappedCoords.get(tr.junction_id);
        if (!coords) return;

        const icon = RESTRICTION_ICONS[tr.restriction_type] || "🚫";
        const offsetLat = tr.restriction_type === "no_uturn" ? 0.0005 : 0.0003;
        const offsetLng = tr.restriction_type === "no_left" ? -0.0005 : 0.0005;

        const restrictionIcon = L.divIcon({
          className: "turn-restriction",
          html: `<div class="turn-restriction-badge">${icon}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        L.marker([coords[0] + offsetLat, coords[1] + offsetLng], {
          icon: restrictionIcon,
          interactive: true,
        })
          .bindTooltip(
            `${tr.restriction_type.replace(/_/g, " ").toUpperCase()}<br/>From: ${tr.from_road} → ${tr.to_road}`
          )
          .addTo(layers);
      });
    }

    // ── Animated Source / Destination Endpoint Markers ──
    const endpointMarkers: { jId: string; type: "source" | "destination" }[] = [];
    if (sourceJunction) endpointMarkers.push({ jId: sourceJunction, type: "source" });
    if (destinationJunction) endpointMarkers.push({ jId: destinationJunction, type: "destination" });

    endpointMarkers.forEach(({ jId, type }) => {
      const coords = snappedCoords.get(jId);
      if (!coords) return;

      const icon = type === "source" ? "⭐" : "📍";
      const label = type === "source" ? "START" : "END";

      const divIcon = L.divIcon({
        className: "",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        html: `
          <div class="endpoint-marker">
            <div class="endpoint-glow ${type}"></div>
            <div class="endpoint-ring1 ${type}"></div>
            <div class="endpoint-ring2 ${type}"></div>
            <div class="endpoint-core ${type}"></div>
            <div class="endpoint-icon">${icon}</div>
            <div class="endpoint-badge ${type}">${label}</div>
          </div>
        `,
      });

      L.marker(coords, { icon: divIcon, zIndexOffset: 9999, interactive: false }).addTo(layers);
    });

  }, [
    junctions,
    roads,
    onJunctionClick,
    routePath,
    sourceJunction,
    destinationJunction,
    showTurnRestrictions,
    turnRestrictions,
    multiRoutePaths,
    highlightJunctionId,
    mapRegion,
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNAL DOTS — created per incoming road, colored per-road density
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapRegion) return;

    // Remove old dot layer
    if (signalDotLayerRef.current) {
      map.removeLayer(signalDotLayerRef.current);
    }
    signalDotsRef.current = {};
    const dotLayer = L.layerGroup().addTo(map);
    signalDotLayerRef.current = dotLayer;

    const regionJunctions: any[] = mapRegion?.junctions || [];
    const roadMap = new Map(roads.map((r) => [r.id, r]));

    const getRoadGeometry = (roadId: string): [number, number][] | null => {
      const directGeom = typedGeometries[roadId];
      if (directGeom && directGeom.length >= 2) {
        return directGeom;
      }

      const road = roadMap.get(roadId);
      if (!road) {
        return null;
      }

      const reverseRoad = roads.find(
        (r) => r.from_junction === road.to_junction && r.to_junction === road.from_junction
      );
      if (!reverseRoad) {
        return null;
      }

      const reverseGeom = typedGeometries[reverseRoad.id];
      if (!reverseGeom || reverseGeom.length < 2) {
        return null;
      }

      return [...reverseGeom].reverse() as [number, number][];
    };

    regionJunctions.forEach((rj: any) => {
      const jName = rj.name || rj.id;
      const jId = rj.id;
      const incomingRoads: string[] = rj.incoming_roads || [];
      const outgoingRoads: string[] = rj.outgoing_roads || [];

      const SIGNAL_OFFSET = 0.00015; // ~17m from junction

      // Manual overrides for signal positions that automatic logic can't place correctly
      const MANUAL_SIGNAL_POS: Record<string, [number, number]> = {
        R98: [17.501943, 78.386014],
        R57: [17.489401, 78.379697],
        R107: [17.489375, 78.379547],
        R75: [17.485428, 78.383042],
        R14: [17.496198, 78.383884],
        R54: [17.496244, 78.383659],
        R49: [17.498183, 78.386330],
        R89: [17.498431, 78.386368],
        R26: [17.497776, 78.389567],
        R106: [17.497924, 78.389685],
      };

      // PASS 1: Compute signal positions using outgoing road geometry
      const signalPositions: { rId: string; lat: number; lng: number; method: string }[] = [];

      incomingRoads.forEach((rId: string) => {
        const inRoad = roadMap.get(rId);
        if (!inRoad) return;

        // Check manual override first
        if (MANUAL_SIGNAL_POS[rId]) {
          const [mLat, mLng] = MANUAL_SIGNAL_POS[rId];
          signalPositions.push({ rId, lat: mLat, lng: mLng, method: "manual" });
          return;
        }

        const reverseRoad = outgoingRoads.find((outId: string) => {
          const outRoad = roadMap.get(outId);
          return outRoad && outRoad.to_junction === inRoad.from_junction;
        });

        let dotLat: number, dotLng: number;

        const reverseGeom = reverseRoad ? getRoadGeometry(reverseRoad) : null;
        if (reverseGeom) {
          [dotLat, dotLng] = walkForwardAlongGeometry(reverseGeom, SIGNAL_OFFSET);
        } else {
          const geom = getRoadGeometry(rId);
          if (!geom || geom.length < 2) return;
          [dotLat, dotLng] = walkBackAlongGeometry(geom, SIGNAL_OFFSET);
        }

        signalPositions.push({ rId, lat: dotLat, lng: dotLng, method: "outgoing" });
      });

      // PASS 2: Detect overlap — if both signals are at the same position,
      // move the SECOND signal to use the incoming road's walkback instead.
      // This places it on the OPPOSITE side of the junction.
      if (signalPositions.length === 2) {
        const a = signalPositions[0], b = signalPositions[1];
        const overlapDist = Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2);

        if (overlapDist < 0.00005) { // ~5m overlap threshold
          // Both signals landed at the same spot (shared outgoing geometry).
          // Mirror the 2nd signal along the ROAD DIRECTION axis through the junction endpoint.
          // This keeps both signals ON the actual road, not off on buildings.

          // Get the first outgoing road's geometry to determine road direction
          const firstInRoad = roadMap.get(a.rId);
          const firstReverseId = firstInRoad && outgoingRoads.find((outId: string) => {
            const outRoad = roadMap.get(outId);
            return outRoad && outRoad.to_junction === firstInRoad.from_junction;
          });
          const refGeom = firstReverseId ? getRoadGeometry(firstReverseId) : null;

          if (refGeom && refGeom.length >= 2) {
            // Road direction from junction endpoint (geom[0]) outward
            const dx = refGeom[1][0] - refGeom[0][0];
            const dy = refGeom[1][1] - refGeom[0][1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
              // Junction endpoint = first geometry point (where road starts at junction)
              const jEndLat = refGeom[0][0];
              const jEndLng = refGeom[0][1];
              // Second signal = junction endpoint MINUS road direction (opposite side)
              b.lat = jEndLat - (dx / len) * SIGNAL_OFFSET;
              b.lng = jEndLng - (dy / len) * SIGNAL_OFFSET;
              b.method = "road-axis-mirror";
            }
          }
        }
      }

      // PASS 3: Create the markers
      signalPositions.forEach(({ rId, lat, lng }) => {
        const road = roadMap.get(rId);
        const mainDot = L.circleMarker([lat, lng], {
          radius: 5,
          fillColor: GRAY,
          fillOpacity: 1.0,
          color: "#374151",
          weight: 1.5,
          pane: "signalPane",
        });

        const tooltipHtml = `<div class="map-tooltip">
            <strong>${rId}</strong> — ${road?.name || "Unknown"}<br/>
            Junction: ${jName}<br/>
            PCU: —<br/>
            Density: N/A
          </div>`;

        mainDot.bindTooltip(tooltipHtml, { direction: "top" });
        dotLayer.addLayer(mainDot);
        signalDotsRef.current[rId] = mainDot;
      });
    });

    return () => {
      if (signalDotLayerRef.current && map) {
        map.removeLayer(signalDotLayerRef.current);
      }
      signalDotsRef.current = {};
      signalDotLayerRef.current = null;
    };
  }, [mapRegion, roads]);

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE SIGNAL DOT COLORS — uses per-road density from signalData + roadStates
  // Each road's dot is colored by ITS OWN density, NOT the junction's density
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (Object.keys(signalDotsRef.current).length === 0) return;

    const edgeToRoadId = new Map<string, string>();
    roads.forEach((road) => {
      edgeToRoadId.set(`${road.from_junction}->${road.to_junction}`, road.id);
    });

    const resolveRoadIds = (path: string[], explicitRoadIds?: string[]): string[] => {
      if (explicitRoadIds && explicitRoadIds.length > 0) {
        return explicitRoadIds;
      }

      const resolved: string[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const key = `${path[i]}->${path[i + 1]}`;
        const roadId = edgeToRoadId.get(key);
        if (!roadId) {
          return [];
        }
        resolved.push(roadId);
      }
      return resolved;
    };

    const routeRoadSet = new Set<string>();
    if (routePath && routePath.length > 1) {
      resolveRoadIds(routePath).forEach((roadId) => routeRoadSet.add(roadId));
    }

    const multiRouteRoadSets = multiRoutePaths.map((r) => ({
      set: new Set(resolveRoadIds(r.path, r.roads)),
      color: r.color,
    }));

    const roadMap = new Map(roads.map((r) => [r.id, r]));
    const regionJunctions: any[] = mapRegion?.junctions || [];

    regionJunctions.forEach((rj: any) => {
      const jId = rj.id;
      const jName = rj.name || jId;
      const sig = signalData[jId];
      const junctionRoads = sig?.roads || {};
      const incomingRoads: string[] = rj.incoming_roads || [];

      incomingRoads.forEach((rId: string) => {
        const dot = signalDotsRef.current[rId];
        if (!dot) return;

        // ★ KEY: use per-ROAD signal state (GREEN/RED) from competitive junction model
        const sigRoad = junctionRoads[rId];
        const rsRoad = roadStates[rId];
        const roadSignal = sigRoad?.signal || rsRoad?.signal || "RED";
        const roadDensity = sigRoad?.density || rsRoad?.density;
        const roadPcu = sigRoad?.pcu ?? rsRoad?.pcu ?? "—";
        const roadSource = sigRoad?.source || rsRoad?.source || "unknown";

        // Signal dot color: GREEN or RED based on junction signal state
        const roadFillColor = roadSignal === "GREEN" ? "#22c55e" : "#ef4444";
        dot.setStyle({ fillColor: roadFillColor });

        // Pulse animation for RED + HIGH density (congested and waiting)
        const el = dot.getElement?.();
        if (el) {
          if (roadSignal === "RED" && roadDensity === "HIGH") {
            el.classList.add("signal-pulse-red");
          } else {
            el.classList.remove("signal-pulse-red");
          }
        }

        const road = roadMap.get(rId);
        const signalEmoji = roadSignal === "GREEN" ? "🟢" : "🔴";
        const tooltipHtml = `<div class="map-tooltip">
            <strong>${rId}</strong> — ${road?.name || "Unknown"}<br/>
            Junction: ${jName}<br/>
            Signal: ${signalEmoji} ${roadSignal}<br/>
            PCU: ${roadPcu}<br/>
            Density: ${roadDensity || "N/A"}<br/>
          <span class="map-tooltip-meta">Source: ${roadSource}</span>
          </div>`;

        dot.unbindTooltip();
        dot.bindTooltip(tooltipHtml, { direction: "top" });
      });

      // Update Junction Popups
      const marker = junctionMarkersRef.current[jId];
      if (marker) {
        const propJ = junctions.find(j => j.id === jId);
        const sig = signalData[jId];
        const activeGreen = sig?.active_green_road || "";
        const greenDuration = sig?.green_duration ?? 15;
        const timeRemaining = sig?.time_remaining ?? 0;
        const incomingRoadIds: string[] = rj.incoming_roads || [];
        const outgoingRoadIds: string[] = rj.outgoing_roads || [];

        const incomingRows = incomingRoadIds.map((rId: string) => {
          const road = roads.find((r) => r.id === rId);
          const sigRoad = sig?.roads?.[rId];
          const rd = roadStates[rId];
          const rdDensity = sigRoad?.density || rd?.density;
          const rdPcu = sigRoad?.pcu ?? rd?.pcu ?? "—";
          const rdVehicles = sigRoad?.vehicles ?? rd?.vehicles ?? "—";
          const signal = sigRoad?.signal || "RED";
          const waitTime = sigRoad?.wait_time ?? 0;
          const signalEmoji = signal === "GREEN" ? "🟢" : "🔴";
          const dotColor = getDensityColor(rdDensity);
          const now = Date.now();
          return `<tr class="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td class="p-1 px-1.5">${signalEmoji}</td>
            <td class="p-1 px-1.5 font-medium">${rId}</td>
            <td class="p-1 px-1.5 truncate max-w-[120px]" title="${road?.name || ""}">${road?.name || "—"}</td>
            <td id="pcu-${jId}-${rId}" class="p-1 px-1.5 text-right font-mono">${rdPcu}</td>
            <td id="veh-${jId}-${rId}" class="p-1 px-1.5 text-right font-mono">${rdVehicles}</td>
            <td id="wait-time-${jId}-${rId}" data-time="${now}" data-base-wait="${waitTime}" class="p-1 px-1.5 text-right font-mono" style="color:${signal === "RED" ? "#ef4444" : "var(--muted-foreground)"};">${signal === "RED" ? waitTime + "s" : "—"}</td>
            <td class="p-1 px-1.5 text-center"><span class="inline-block w-2.5 h-2.5 rounded-full ring-1 ring-background" style="background:${dotColor};"></span></td>
          </tr>`;
        }).join("");

        const outgoingRows = outgoingRoadIds.map((rId: string) => {
          const road = roads.find((r) => r.id === rId);
          return `<tr class="border-b border-border/50 hover:bg-muted/30 transition-colors"><td class="p-1 px-1.5 font-medium">${rId}</td><td class="p-1 px-1.5">${road?.name || "—"}</td></tr>`;
        }).join("");

        const activeGreenRoad = roads.find((r) => r.id === activeGreen);
        const activeGreenName = activeGreenRoad?.name || activeGreen || "—";
        const popupId = `popup-countdown-${jId}`;

        const html = `<div class="min-w-[280px] text-sm text-foreground">
          <h3 class="m-0 mb-2 text-base font-bold">${propJ?.name || rj.name || jId}</h3>
          <hr class="my-2 border-border"/>
          <strong class="text-xs text-muted-foreground uppercase tracking-wider">Incoming Roads</strong>
          <table class="w-full text-xs border-collapse mt-1 mb-2">
            <tr class="bg-muted/50 text-muted-foreground border-b border-border"><th class="p-1 px-1.5 font-medium text-left">⚡</th><th class="p-1 px-1.5 font-medium text-left">ID</th><th class="p-1 px-1.5 font-medium text-left">Name</th><th class="p-1 px-1.5 font-medium text-right">PCU</th><th class="p-1 px-1.5 font-medium text-right">Vehs</th><th class="p-1 px-1.5 font-medium text-right">Wait</th><th class="p-1 px-1.5 font-medium text-center">Dens</th></tr>
            ${incomingRows || '<tr><td colspan="7" class="p-1 px-1.5 text-muted-foreground italic text-center">none</td></tr>'}
          </table>
          <strong class="text-xs text-muted-foreground uppercase tracking-wider">Outgoing Roads</strong>
          <table class="w-full text-xs border-collapse mt-1 mb-2">
            <tr class="bg-muted/50 text-muted-foreground border-b border-border"><th class="p-1 px-1.5 font-medium text-left">ID</th><th class="p-1 px-1.5 font-medium text-left">Name</th></tr>
            ${outgoingRows || '<tr><td colspan="2" class="p-1 px-1.5 text-muted-foreground italic text-center">none</td></tr>'}
          </table>
          <hr class="my-2 border-border"/>
          <div class="bg-primary/10 border border-primary/20 p-2.5 rounded-md mt-2 shadow-sm">
            <div class="text-[12px] font-bold text-primary flex items-center gap-1.5">🚦 Adaptive Signal</div>
            <div id="active-green-${jId}" class="text-micro mt-1.5 text-foreground">🟢 <strong>${activeGreenName}</strong> — ${greenDuration}s green</div>
            <div id="${popupId}" data-time="${Date.now()}" data-initial-time="${timeRemaining}" class="text-micro mt-0.5 text-muted-foreground font-medium">Re-evaluates in: <span class="font-mono">${timeRemaining}s</span></div>
          </div>
        </div>`;

        if (openPopupJunctionRef.current === jId && marker.getPopup()?.isOpen()) {
          // Live update the DOM directly to avoid Leaflet popup flicker
          incomingRoadIds.forEach((rId: string) => {
            const sigRoad = sig?.roads?.[rId];
            const pcuEl = document.getElementById(`pcu-${jId}-${rId}`);
            if (pcuEl) pcuEl.textContent = String(sigRoad?.pcu ?? roadStates[rId]?.pcu ?? "—");
            const vehEl = document.getElementById(`veh-${jId}-${rId}`);
            if (vehEl) vehEl.textContent = String(sigRoad?.vehicles ?? roadStates[rId]?.vehicles ?? "—");
            const waitEl = document.getElementById(`wait-time-${jId}-${rId}`);
            if (waitEl) {
              const signal = sigRoad?.signal || "RED";
              waitEl.setAttribute("data-base-wait", String(sigRoad?.wait_time ?? 0));
              waitEl.setAttribute("data-time", String(Date.now()));
              if (signal === "GREEN") {
                waitEl.textContent = "—";
                waitEl.style.color = "var(--muted-foreground)";
              } else {
                waitEl.style.color = "#ef4444";
              }
            }
          });
          const activeGreenEl = document.getElementById(`active-green-${jId}`);
          if (activeGreenEl) activeGreenEl.innerHTML = `🟢 <strong>${activeGreenName}</strong> — ${greenDuration}s green`;

          const popupCountEl = document.getElementById(popupId);
          if (popupCountEl) {
            popupCountEl.setAttribute("data-initial-time", String(timeRemaining));
            popupCountEl.setAttribute("data-time", String(Date.now()));
            // the tick() handles innerHTML update, but we can do it so it doesn't flicker on 3rd sec
            popupCountEl.innerHTML = `Re-evaluates in: <span class="font-mono">${timeRemaining}s</span>`;
          }
        } else {
          marker.setPopupContent(html);
        }
      }
    });

    // Update Road Polylines
    roads.forEach(road => {
      const line = roadLinesRef.current[road.id];
      if (!line) return;
      const roadData = roadStates[road.id];
      const roadDensity = roadData?.density;
      const lengthM = ((road.length_km || 0) * 1000).toFixed(0);
      const speed = road.speed_limit || 40;
      const baseCost = (((road.length_km || 0) / speed) * 3600).toFixed(1);
      const pcuLabel = roadData?.pcu != null ? roadData.pcu : "—";

      const isOnRoute = routeRoadSet.has(road.id);
      const multiRouteMatch = multiRouteRoadSets.find((r) => r.set.has(road.id));
      const DEFAULT_ROAD_COLOR = "#9ca3af";
      const lineColor = multiRouteMatch ? multiRouteMatch.color : isOnRoute ? "#2962ff" : DEFAULT_ROAD_COLOR;
      const DEFAULT_ROAD_WEIGHT = road.lanes >= 3 ? 5 : 4;
      const isRoute = !!multiRouteMatch || isOnRoute;
      const lineWeight = isRoute ? 8 : DEFAULT_ROAD_WEIGHT;
      const lineOpacity = isRoute ? 1 : 0.85;

      line.setStyle({ color: lineColor, weight: lineWeight, opacity: lineOpacity });
      line.setTooltipContent(
        `<div class="map-tooltip" style="min-width:140px;">
          <strong>${road.name}</strong>
          <span class="map-tooltip-meta">${road.from_junction} → ${road.to_junction}</span><br/><br/>
          <span style="display:inline-block; width:50%;">📏 ${lengthM}m</span> <span style="display:inline-block; width:45%;">🚗 ${speed} km/h</span><br/>
          <span style="display:inline-block; width:50%;">🛣️ ${road.lanes}L</span> <span style="display:inline-block; width:45%;">⏱️ ${baseCost}s</span><br/>
          <span style="display:inline-block; width:50%;">🚦 ${roadDensity || "—"}</span> <span style="display:inline-block; width:45%;">📊 PCU: ${pcuLabel}</span>
        </div>`
      );
    });

    // Second pass: bring route roads to front so they render on top
    roads.forEach(road => {
      const line = roadLinesRef.current[road.id];
      if (!line) return;
      const isOnRoute = routeRoadSet.has(road.id);
      const isOnMultiRoute = multiRouteRoadSets.some((r) => r.set.has(road.id));
      if (isOnRoute || isOnMultiRoute) {
        line.bringToFront();
      }
    });

  }, [signalData, roadStates, mapRegion, roads, junctions, routePath, multiRoutePaths]);

  // ── Fly-to with highlight animation ──
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 16, { duration: 0.8 });

      if (highlightRef.current && layersRef.current) {
        layersRef.current.removeLayer(highlightRef.current);
      }

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

  if (routeRenderError) {
    throw new Error(routeRenderError);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* ── Adaptive Signal Legend ── */}
      {/* Desktop: bottom-left, always expanded */}
      <div 
        className="hidden md:block absolute bottom-6 left-4 pointer-events-auto min-w-[170px] bg-card/95 text-card-foreground border border-border rounded-xl shadow-lg p-3 backdrop-blur-sm"
        style={{
          transform: "translateZ(0)",
          zIndex: "var(--z-map-overlays)",
          bottom: "calc(var(--safe-area-inset-bottom) + 1.5rem)",
          left: "calc(var(--safe-area-inset-left) + 1rem)",
        }}
      >
        <div className="font-bold text-[13px] mb-1.5 flex items-center gap-1.5 text-foreground">🚦 SIGNAL CONTROL</div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-foreground">Active Green</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-foreground">Waiting (RED)</span>
        </div>
        <div className="text-micro text-muted-foreground mt-2 font-medium">Adaptive timing: 15–45s</div>
        <div className="text-micro text-muted-foreground font-medium">Click junction for live countdown</div>
      </div>

      {/* Mobile: top-left (below header), compact + collapsible */}
      <div 
        className="md:hidden absolute top-2 left-2 pointer-events-auto"
        style={{
          transform: "translateZ(0)",
          zIndex: "var(--z-map-overlays)",
          top: "calc(var(--safe-area-inset-top) + 0.5rem)",
          left: "calc(var(--safe-area-inset-left) + 0.5rem)",
        }}
      >
        <button
          onClick={() => setLegendOpen(prev => !prev)}
          className="flex items-center gap-1.5 bg-card/95 backdrop-blur-sm text-card-foreground border border-border rounded-lg shadow-lg px-2.5 py-1.5 text-micro font-semibold"
        >
          🚦
          {legendOpen && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-micro">Green</span>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              <span className="text-micro">Red</span>
            </span>
          )}
          {!legendOpen && <span>Traffic Signals</span>}
        </button>
        {legendOpen && (
          <div className="mt-1 bg-card/95 backdrop-blur-sm text-card-foreground border border-border rounded-lg shadow-lg p-2.5 min-w-[155px]">
            <div className="font-bold text-micro mb-1 text-foreground">SIGNAL CONTROL</div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-micro font-medium text-foreground">Active Green</span>
            </div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              <span className="text-micro font-medium text-foreground">Waiting (RED)</span>
            </div>
            <div className="text-[9px] text-muted-foreground mt-1 font-medium">Adaptive timing: 15–45s</div>
          </div>
        )}
      </div>
    </div>
  );
}

