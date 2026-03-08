import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Settings2, Zap, Clock, TrendingDown } from "lucide-react";
import { DensityBadge } from "@/components/DensityBadge";
import { useMapData, useOptimizeSignals } from "@/hooks/use-map-data";
import type { LaneAnalysis, SignalOptimizationResult, DensityLevel } from "@/lib/types";
import { toast } from "sonner";

export function SignalOptimizationPanel() {
  const { data: mapData } = useMapData();
  const optimizeMutation = useOptimizeSignals();
  
  const [selectedJunction, setSelectedJunction] = useState<string>("");
  const [laneAnalysis, setLaneAnalysis] = useState<LaneAnalysis[]>([
    { approach: "North", vehicle_count: 45, density: "MEDIUM" },
    { approach: "South", vehicle_count: 32, density: "LOW" },
    { approach: "East", vehicle_count: 58, density: "HIGH" },
    { approach: "West", vehicle_count: 28, density: "LOW" },
  ]);
  const [result, setResult] = useState<SignalOptimizationResult | null>(null);

  const updateLaneCount = useCallback((idx: number, count: number) => {
    setLaneAnalysis((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        vehicle_count: count,
        density: count > 50 ? "HIGH" : count > 30 ? "MEDIUM" : "LOW",
      };
      return updated;
    });
  }, []);

  const handleOptimize = useCallback(async () => {
    if (!selectedJunction) {
      toast.error("Please select a junction");
      return;
    }
    try {
      const res = await optimizeMutation.mutateAsync({
        junction_id: selectedJunction,
        lane_analysis: laneAnalysis,
      });
      setResult(res);
      toast.success("Signal optimization complete");
    } catch {
      toast.error("Optimization failed");
    }
  }, [selectedJunction, laneAnalysis, optimizeMutation]);

  const junctions = mapData?.junctions || [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Signal Optimization</h1>
        <p className="text-muted-foreground">Optimize traffic signal timing based on density analysis</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Junction</Label>
              <Select value={selectedJunction} onValueChange={setSelectedJunction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select junction to optimize" />
                </SelectTrigger>
                <SelectContent>
                  {junctions.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.name} ({j.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label>Lane Analysis (vehicle counts per approach)</Label>
              {laneAnalysis.map((lane, idx) => (
                <div key={lane.approach} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{lane.approach}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{lane.vehicle_count}</span>
                      <DensityBadge level={lane.density} />
                    </div>
                  </div>
                  <Slider
                    value={[lane.vehicle_count]}
                    onValueChange={([v]) => updateLaneCount(idx, v)}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
              ))}
            </div>

            <Button onClick={handleOptimize} disabled={!selectedJunction || optimizeMutation.isPending} className="w-full">
              <Zap className="mr-2 h-4 w-4" />
              {optimizeMutation.isPending ? "Optimizing..." : "Optimize Signals"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-traffic-low" />
              Optimization Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Junction</span>
                  <span className="font-medium">{result.junction_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Density Level</span>
                  <DensityBadge level={result.density_level} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cycle Time</span>
                  <span className="font-mono">{result.cycle_time}s</span>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <h4 className="mb-3 text-sm font-medium">Optimized Signal Timings</h4>
                  <div className="space-y-2">
                    {result.signal_timings.map((timing) => (
                      <div key={timing.phase} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{timing.phase}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 rounded bg-traffic-low"
                            style={{ width: `${timing.green_duration * 2}px` }}
                          />
                          <span className="font-mono text-sm">{timing.green_duration}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Traffic Delay</p>
                    <p className="text-lg font-bold text-foreground">{result.traffic_delay}s</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Signal Wait</p>
                    <p className="text-lg font-bold text-foreground">{result.signal_wait}s</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Settings2 className="mb-3 h-10 w-10 opacity-40" />
                <p>Select a junction and click Optimize to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
