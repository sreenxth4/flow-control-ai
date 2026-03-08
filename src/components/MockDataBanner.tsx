import { AlertTriangle } from "lucide-react";

export function MockDataBanner() {
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 rounded-lg border border-traffic-medium/50 bg-card/95 px-4 py-2 shadow-lg backdrop-blur-sm">
      <AlertTriangle className="h-4 w-4 text-traffic-medium" />
      <span className="text-sm font-medium text-muted-foreground">
        Using mock data — backend unavailable
      </span>
    </div>
  );
}
