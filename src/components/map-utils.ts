import type { DensityLevel } from "@/lib/types";

// Enhanced density colors with gradients
export const DENSITY_COLORS: Record<DensityLevel, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#ef4444",
};

export const DENSITY_GLOW: Record<DensityLevel, string> = {
  LOW: "rgba(34,197,94,0.45)",
  MEDIUM: "rgba(245,158,11,0.45)",
  HIGH: "rgba(239,68,68,0.5)",
};

export const DENSITY_GRADIENT: Record<DensityLevel, string> = {
  LOW: "radial-gradient(circle, #4ade80 0%, #16a34a 100%)",
  MEDIUM: "radial-gradient(circle, #fbbf24 0%, #d97706 100%)",
  HIGH: "radial-gradient(circle, #f87171 0%, #dc2626 100%)",
};

export const NO_DATA_COLOR = "#94a3b8";
export const NO_DATA_GLOW = "rgba(148,163,184,0.3)";
export const NO_DATA_GRADIENT = "radial-gradient(circle, #cbd5e1 0%, #94a3b8 100%)";

// Road color based on density of connected junctions
export function getRoadColorByDensity(
  fromDensity?: DensityLevel | null,
  toDensity?: DensityLevel | null
): string {
  const densityRank: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  const maxRank = Math.max(
    densityRank[fromDensity || ""] || 0,
    densityRank[toDensity || ""] || 0
  );
  if (maxRank === 3) return "#ef4444";
  if (maxRank === 2) return "#f59e0b";
  if (maxRank === 1) return "#22c55e";
  return "#64748b";
}

// Road color by speed limit (fallback)
export const getRoadColor = (speedLimit: number) =>
  speedLimit >= 50 ? "#1e293b" : "#94a3b8";

// Marker size with better scaling
export function getMarkerSize(vehicleCount?: number, isSpecial = false): number {
  if (isSpecial) return 18;
  const base = 13;
  if (!vehicleCount || vehicleCount <= 0) return base;
  return Math.min(28, base + Math.sqrt(vehicleCount) * 1.5);
}

// Generate enhanced junction marker HTML
export function createJunctionMarkerHTML(options: {
  density?: DensityLevel | null;
  radius: number;
  borderColor?: string;
  borderWidth?: number;
  isSpecial?: boolean;
  specialColor?: string;
}): string {
  const {
    density,
    radius,
    borderColor = "rgba(255,255,255,0.9)",
    borderWidth = 2.5,
    isSpecial = false,
    specialColor,
  } = options;

  const color = specialColor || (density ? DENSITY_COLORS[density] : NO_DATA_COLOR);
  const glow = density ? DENSITY_GLOW[density] : NO_DATA_GLOW;
  const gradient = specialColor
    ? `radial-gradient(circle, ${specialColor} 0%, ${specialColor}cc 100%)`
    : density
      ? DENSITY_GRADIENT[density]
      : NO_DATA_GRADIENT;
  const size = radius * 2;

  return `<div class="junction-circle-enhanced" style="
    width: ${size}px; 
    height: ${size}px; 
    background: ${gradient};
    border: ${borderWidth}px solid ${borderColor};
    border-radius: 50%;
    box-shadow: 0 0 ${isSpecial ? 16 : 10}px ${isSpecial ? 5 : 3}px ${glow}, inset 0 -2px 4px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.3);
    position: relative;
  ">
    <div style="
      position: absolute;
      top: 2px; left: 2px; right: 2px; bottom: 50%;
      background: linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%);
      border-radius: 50% 50% 40% 40%;
    "></div>
  </div>`;
}

// Generate enhanced label HTML
export function createJunctionLabelHTML(name: string): string {
  return `<div class="junction-label-enhanced">${name}</div>`;
}

// Generate enhanced tooltip HTML for junctions
export function createJunctionTooltipHTML(options: {
  id: string;
  name: string;
  type?: string;
  density?: DensityLevel | null;
  vehicleCount?: number | null;
  totalPcu?: number | null;
}): string {
  const { id, name, type, density, vehicleCount, totalPcu } = options;
  const color = density ? DENSITY_COLORS[density] : NO_DATA_COLOR;
  const densityLabel = density || "No data";

  return `<div class="junction-tooltip-card">
    <div class="junction-tooltip-header">
      <span class="junction-tooltip-id">${id}</span>
      <span class="junction-tooltip-name">${name}</span>
    </div>
    ${type ? `<div class="junction-tooltip-row"><span class="junction-tooltip-label">Type</span><span>${type}</span></div>` : ""}
    <div class="junction-tooltip-row">
      <span class="junction-tooltip-label">Density</span>
      <span class="junction-tooltip-badge" style="background:${color}20; color:${color}; border:1px solid ${color}50">${densityLabel}</span>
    </div>
    ${vehicleCount != null ? `<div class="junction-tooltip-row"><span class="junction-tooltip-label">Vehicles</span><span class="junction-tooltip-value">${vehicleCount}</span></div>` : ""}
    ${totalPcu != null ? `<div class="junction-tooltip-row"><span class="junction-tooltip-label">PCU</span><span class="junction-tooltip-value">${totalPcu}</span></div>` : ""}
  </div>`;
}

// Generate enhanced popup HTML for junctions
export function createJunctionPopupHTML(options: {
  id: string;
  name: string;
  type?: string;
  density?: DensityLevel | null;
  vehicleCount?: number | null;
  totalPcu?: number | null;
  incomingRoads?: string;
  outgoingRoads?: string;
}): string {
  const { id, name, type, density, vehicleCount, totalPcu, incomingRoads, outgoingRoads } = options;
  const color = density ? DENSITY_COLORS[density] : NO_DATA_COLOR;
  const densityLabel = density || "No data";

  return `<div class="junction-popup-card">
    <div class="junction-popup-header" style="border-left: 3px solid ${color}">
      <div class="junction-popup-title">${name}</div>
      <div class="junction-popup-subtitle">${id}${type ? ` · ${type}` : ""}</div>
    </div>
    <div class="junction-popup-body">
      <div class="junction-popup-stats">
        <div class="junction-popup-stat">
          <div class="junction-popup-stat-value" style="color:${color}">${densityLabel}</div>
          <div class="junction-popup-stat-label">Density</div>
        </div>
        ${vehicleCount != null ? `<div class="junction-popup-stat">
          <div class="junction-popup-stat-value">${vehicleCount}</div>
          <div class="junction-popup-stat-label">Vehicles</div>
        </div>` : ""}
        ${totalPcu != null ? `<div class="junction-popup-stat">
          <div class="junction-popup-stat-value">${totalPcu}</div>
          <div class="junction-popup-stat-label">PCU</div>
        </div>` : ""}
      </div>
      ${incomingRoads || outgoingRoads ? `<div class="junction-popup-roads">
        ${incomingRoads ? `<div class="junction-popup-road-row"><span class="junction-popup-road-label">↙ In</span><span>${incomingRoads}</span></div>` : ""}
        ${outgoingRoads ? `<div class="junction-popup-road-row"><span class="junction-popup-road-label">↗ Out</span><span>${outgoingRoads}</span></div>` : ""}
      </div>` : ""}
    </div>
  </div>`;
}

// Generate enhanced road tooltip HTML
export function createRoadTooltipHTML(options: {
  name: string;
  from: string;
  to: string;
  lengthKm: number;
  speedLimit: number;
  lanes: number;
}): string {
  const { name, from, to, lengthKm, speedLimit, lanes } = options;
  const lengthM = (lengthKm * 1000).toFixed(0);
  const travelTime = ((lengthKm / speedLimit) * 3600).toFixed(1);

  return `<div class="road-tooltip-card">
    <div class="road-tooltip-header">${name}</div>
    <div class="road-tooltip-direction">${from} → ${to}</div>
    <div class="road-tooltip-stats">
      <span>📏 ${lengthM}m</span>
      <span>🚗 ${speedLimit} km/h</span>
      <span>🛣️ ${lanes}L</span>
      <span>⏱️ ${travelTime}s</span>
    </div>
  </div>`;
}

export function resolveCoords(junction: any): { lat: number; lng: number } | null {
  const lat = junction?.lat ?? junction?.latitude;
  const lng = junction?.lng ?? junction?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}
