import { Badge } from "@/components/ui/badge";
import type { DensityLevel } from "@/lib/types";

const densityConfig: Record<DensityLevel, { label: string; className: string }> = {
  LOW: { label: "Low", className: "bg-traffic-low text-traffic-low-foreground" },
  MEDIUM: { label: "Medium", className: "bg-traffic-medium text-traffic-medium-foreground" },
  HIGH: { label: "High", className: "bg-traffic-high text-traffic-high-foreground animate-density-pulse" },
};

export function DensityBadge({ level }: { level?: DensityLevel }) {
  const d = level || "LOW";
  const cfg = densityConfig[d];
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}
