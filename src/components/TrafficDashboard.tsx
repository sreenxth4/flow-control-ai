import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DensityBadge } from "@/components/DensityBadge";
import { useMapData, usePerformance, useHealth } from "@/hooks/use-map-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Signal, Gauge, Heart, Clock, Cpu } from "lucide-react";

export function TrafficDashboard() {
  const { data: mapData, isLoading: mapLoading } = useMapData();
  const { data: perf, isLoading: perfLoading } = usePerformance();
  const { data: health, isLoading: healthLoading } = useHealth();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Traffic Dashboard</h1>
        <p className="text-muted-foreground">Real-time system monitoring and signal overview</p>
      </div>

      {/* Health + Performance cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* System Health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="h-4 w-4 text-traffic-low" /> System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-20" />
            ) : health ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={health.status === "healthy" ? "bg-traffic-low text-traffic-low-foreground" : "bg-traffic-high text-traffic-high-foreground"}>
                    {health.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Detector</span>
                  <span className="text-foreground">{health.detector}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model</span>
                  <span className="text-foreground">{health.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Video</span>
                  <span className="text-foreground">{health.video_support ? "Enabled" : "Disabled"}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4 text-primary" /> Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {perfLoading ? (
              <Skeleton className="h-20" />
            ) : perf ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frames</span>
                  <span className="text-foreground">{perf.summary.total_frames}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg FPS</span>
                  <span className="text-foreground">{perf.summary.average_fps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Time</span>
                  <span className="text-foreground">{perf.summary.total_time}s</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Performance Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-accent" /> Processing Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {perfLoading ? (
              <Skeleton className="h-20" />
            ) : perf ? (
              <div className="space-y-2 text-sm">
                <PerfRow label="Detection" value={perf.performance_profile.detect_time} total={perf.performance_profile.total_time} />
                <PerfRow label="Tracking" value={perf.performance_profile.track_time} total={perf.performance_profile.total_time} />
                <PerfRow label="Analysis" value={perf.performance_profile.analyze_time} total={perf.performance_profile.total_time} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Signal Phases Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Signal className="h-5 w-5 text-traffic-medium" /> Signal Phases — All Junctions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mapLoading ? (
            <Skeleton className="h-48" />
          ) : mapData ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Junction</TableHead>
                  <TableHead>Density</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Green Roads</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapData.signal_phases.map((sp) => {
                  const j = mapData.junctions.find((jn) => jn.id === sp.junction_id);
                  return (
                    <TableRow key={sp.phase_name}>
                      <TableCell className="font-medium">{j?.name || sp.junction_id}</TableCell>
                      <TableCell><DensityBadge level={j?.density} /></TableCell>
                      <TableCell>{sp.phase_name.replace((j?.name || "") + " ", "")}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sp.green_roads.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {sp.min_green}–{sp.max_green}s
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function PerfRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{value}s ({pct.toFixed(0)}%)</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
