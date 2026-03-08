import { MapPin, ChevronRight, Signal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DensityBadge } from "@/components/DensityBadge";
import type { Junction, SignalPhase } from "@/lib/types";

interface Props {
  junctions: Junction[];
  signalPhases: SignalPhase[];
  onJunctionClick: (id: string) => void;
  onJunctionFly: (lat: number, lng: number) => void;
}

export function JunctionSidebar({ junctions, signalPhases, onJunctionClick, onJunctionFly }: Props) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {junctions.map((j) => {
          const phases = signalPhases.filter((s) => s.junction_id === j.id);
          return (
            <button
              key={j.id}
              onClick={() => {
                onJunctionFly(j.lat, j.lng);
                onJunctionClick(j.id);
              }}
              className="w-full rounded-lg border border-border/50 bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-card-foreground">{j.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DensityBadge level={j.density} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <span className="uppercase">{j.type}</span>
                <span>•</span>
                <span>{j.id}</span>
              </div>
              {phases.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {phases.map((p) => (
                    <span
                      key={p.phase_name}
                      className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                    >
                      <Signal className="h-3 w-3" />
                      {(p.phase_name ?? "").replace(j.name + " ", "")}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
