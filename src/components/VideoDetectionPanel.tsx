import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Upload, Play, ChevronDown, Video, Timer, Cpu, Gauge } from "lucide-react";
import { submitVideoDetection } from "@/lib/api";
import type { DetectionResult } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

export function VideoDetectionPanel() {
  const [sourceId, setSourceId] = useState("cam_01");
  const [file, setFile] = useState<File | null>(null);
  const [fps, setFps] = useState(5);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DetectionResult | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!file) {
      toast({ title: "No file selected", description: "Please select a video file.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setProgress(0);
    setResult(null);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 8, 90));
    }, 1000);

    try {
      const res = await submitVideoDetection(sourceId, file, fps);
      setResult(res);
      setProgress(100);
      toast({ title: "Detection complete", description: `Processed ${res.total_frames_processed} frames.` });
    } catch {
      toast({
        title: "Detection failed",
        description: "Could not connect to backend. Make sure the API server is running.",
        variant: "destructive",
      });
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  }, [file, sourceId, fps]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Video Detection</h1>
        <p className="text-muted-foreground">Upload traffic surveillance video for YOLOv9 AI detection</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> Upload & Configure
          </CardTitle>
          <CardDescription>Configure detection parameters and upload a video file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Source ID */}
          <div className="space-y-2">
            <Label htmlFor="source-id">Source ID (Camera Identifier)</Label>
            <Input id="source-id" value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="cam_01" />
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label>Video File</Label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:border-primary/50"
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag & drop or click to select</p>
              <p className="text-xs text-muted-foreground">.mp4, .avi, .mov, .mkv</p>
              <input
                type="file"
                accept=".mp4,.avi,.mov,.mkv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 cursor-pointer opacity-0"
                style={{ position: "relative" }}
              />
              {file && (
                <Badge variant="secondary" className="mt-3">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </Badge>
              )}
            </div>
          </div>

          {/* FPS Slider */}
          <div className="space-y-2">
            <Label>Target FPS: {fps}</Label>
            <Slider value={[fps]} onValueChange={([v]) => setFps(v)} min={1} max={30} step={1} />
          </div>

          {/* Submit */}
          <Button onClick={handleSubmit} disabled={loading || !file} className="w-full">
            <Play className="mr-2 h-4 w-4" />
            {loading ? "Processing..." : "Run Detection"}
          </Button>

          {loading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-center text-xs text-muted-foreground">Processing video... this may take a few minutes</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-accent" /> Detection Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard icon={<Video className="h-4 w-4" />} label="Frames" value={result.total_frames_processed} />
              <StatCard icon={<Timer className="h-4 w-4" />} label="Time" value={`${result.processing_time_seconds.toFixed(1)}s`} />
              <StatCard icon={<Gauge className="h-4 w-4" />} label="Avg FPS" value={result.average_processing_fps.toFixed(1)} />
              <StatCard icon={<Cpu className="h-4 w-4" />} label="Source" value={result.source_id} />
            </div>

            {/* Performance profile */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-3 text-sm font-semibold text-foreground">Performance Breakdown</h4>
              <div className="space-y-2">
                <PerfBar label="Detection" value={result.performance_profile.detect_time} total={result.performance_profile.total_time} color="bg-primary" />
                <PerfBar label="Tracking" value={result.performance_profile.track_time} total={result.performance_profile.total_time} color="bg-accent" />
                <PerfBar label="Analysis" value={result.performance_profile.analyze_time} total={result.performance_profile.total_time} color="bg-traffic-medium" />
              </div>
            </div>

            {/* Per-frame detections */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  Detections Per Frame ({result.detections_per_frame.length} frames)
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
                <div className="divide-y divide-border">
                  {result.detections_per_frame.map((f) => (
                    <div key={f.frame} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-muted-foreground">Frame {f.frame}</span>
                      <Badge variant="secondary">{f.vehicle_count} vehicles</Badge>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="mb-1 flex items-center justify-center text-muted-foreground">{icon}</div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PerfBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{value.toFixed(1)}s ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
