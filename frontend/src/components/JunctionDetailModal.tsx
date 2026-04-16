import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DensityBadge } from "@/components/DensityBadge";
import { useJunctionDetail } from "@/hooks/use-map-data";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, Signal, Clock } from "lucide-react";

interface Props {
  junctionId: string | null;
  open: boolean;
  onClose: () => void;
}

export function JunctionDetailModal({ junctionId, open, onClose }: Props) {
  const { data, isLoading } = useJunctionDetail(junctionId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(var(--app-vh,100dvh)-var(--safe-area-inset-top)-var(--safe-area-inset-bottom)-1rem)] w-[calc(100vw-1rem)] max-w-sm xs:max-w-md md:max-w-lg lg:max-w-2xl overflow-y-auto">
        {isLoading || !data ? (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {data.junction.name}
                <DensityBadge level={data.junction.density} />
              </DialogTitle>
              <DialogDescription>
                {data.junction.type.charAt(0).toUpperCase() + data.junction.type.slice(1)} — {data.junction.id}
              </DialogDescription>
            </DialogHeader>

            {/* Incoming Roads */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ArrowDownLeft className="h-4 w-4 text-traffic-low" /> Incoming Roads
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Road</TableHead>
                    <TableHead>Lanes</TableHead>
                    <TableHead>Speed</TableHead>
                    <TableHead>Length</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.incoming_roads.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.lanes}</TableCell>
                      <TableCell>{r.speed_limit} km/h</TableCell>
                      <TableCell>{r.length_km} km</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Outgoing Roads */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ArrowUpRight className="h-4 w-4 text-primary" /> Outgoing Roads
              </h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Road</TableHead>
                    <TableHead>Lanes</TableHead>
                    <TableHead>Speed</TableHead>
                    <TableHead>Length</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.outgoing_roads.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.lanes}</TableCell>
                      <TableCell>{r.speed_limit} km/h</TableCell>
                      <TableCell>{r.length_km} km</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Signal Phases */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Signal className="h-4 w-4 text-traffic-medium" /> Signal Phases
              </h4>
              <div className="space-y-3">
                {data.signal_phases.map((phase) => (
                  <div key={phase.phase_name} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{phase.phase_name}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {phase.min_green}–{phase.max_green}s
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {phase.green_roads.map((rId) => (
                        <Badge key={rId} variant="secondary" className="text-xs">
                          {rId}
                        </Badge>
                      ))}
                    </div>
                    {/* Timeline bar */}
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="bg-traffic-low transition-all"
                        style={{ width: `${(phase.min_green / phase.max_green) * 100}%` }}
                      />
                      <div
                        className="bg-traffic-medium"
                        style={{ width: `${((phase.max_green - phase.min_green) / phase.max_green) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
