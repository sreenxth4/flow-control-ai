import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Navigation, MapPin, Route, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Junction } from "@/lib/types";

interface Props {
  junctions: Junction[];
  source: string | null;
  destination: string | null;
  onSourceChange: (id: string) => void;
  onDestinationChange: (id: string) => void;
}

export function RouteFinder({ junctions, source, destination, onSourceChange, onDestinationChange }: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Route Finder</h1>
        <p className="text-muted-foreground">Find the optimal route through the traffic network</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" /> Select Route
          </CardTitle>
          <CardDescription>Choose source and destination junctions, or click on the map</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-traffic-low" /> Source Junction
            </Label>
            <Select value={source || ""} onValueChange={onSourceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
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

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-traffic-high" /> Destination Junction
            </Label>
            <Select value={destination || ""} onValueChange={onDestinationChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination" />
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

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button disabled className="w-full" variant="outline">
                  <Route className="mr-2 h-4 w-4" />
                  Find Route — Coming Soon
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Route computation will be available in a future update</p>
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>

      {/* Placeholder area */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Info className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">Route Display Area</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Route computation will be available in a future update.
            <br />
            The POST /routes API endpoint will provide multiple route options with cost analysis.
          </p>
        </CardContent>
      </Card>

      {/* TODO: When the /routes endpoint is available:
        1. Call POST /routes with { source, destination }
        2. Display multiple route options as polylines on the map
        3. Highlight best (minimum cost) route in green
        4. Show route summary: estimated cost, junctions passed
      */}
    </div>
  );
}
