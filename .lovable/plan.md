# Implementation Plan: 6 Traffic Map Features

## 1. Alternate Routes Display (Red/Yellow/Blue paths)

**Changes:**

- `**src/lib/mock-data.ts**`: Replace `getMockRoute` with `getMockRoutes` that returns 2-3 alternate routes using K-shortest-paths (BFS variant with path exclusion). Each route gets a rank (primary/secondary/tertiary).
- `**src/lib/types.ts**`: Add `MultiRouteResult` type containing an array of `RouteResult` items, each with a `color` field.
- `**src/lib/api.ts**`: Add `findMultipleRoutes` function that returns `MultiRouteResult`.
- `**src/hooks/use-map-data.ts**`: Add `useFindMultipleRoutes` mutation hook.
- `**src/pages/user/UserRoutePage.tsx**`: Store array of routes instead of single route. Render each route on the map with its assigned color (red = fastest, yellow = second, blue = third). Add route selection tabs/cards in sidebar showing cost comparison. Highlight selected route with thicker line.

Route colors: `#FF0000` (primary), `#FFD700` (alternate 1), `#3B82F6` (alternate 2).

## 2. Live Density Animation (5s pulse)

**Changes:**

- `**src/index.css**`: Add CSS `@keyframes pulse-density` animation that scales markers 1.0 → 1.15 → 1.0 with opacity fade.
- `**src/components/TrafficMap.tsx**`: Use `setInterval` (5s) to randomize junction density levels and update markers. Apply CSS class `density-pulse` to junction marker divIcons that triggers the pulse animation on each update.
- `**src/pages/user/UserRoutePage.tsx**`: Same density refresh logic for its embedded map.

The pulse will be a CSS animation on a wrapper `divIcon` around each circle marker, triggered by toggling a class on each 5s tick.

## 3. Congestion Impact in Route Summary

**Changes:**

- `**src/lib/mock-data.ts**`: In route calculation, compute congestion delay per junction based on density (LOW=0s, MEDIUM=+10s, HIGH=+25s). Add `congestion_delay` and `congested_junctions` fields to `RouteResult`.
- `**src/lib/types.ts**`: Add `congestion_delay: number` and `congested_junctions: {id: string, delay: number, density: DensityLevel}[]` to `RouteResult`.
- `**src/pages/user/UserRoutePage.tsx**`: Display congestion impact banner in route summary card: "This route takes +Xs longer due to HIGH density at J4, J9" with a warning icon. Show per-junction delays in the segment table.

## 4. Road Details on Hover

**Changes:**

- `**src/components/TrafficMap.tsx**`: Already has `bindPopup` on roads — enhance to use `bindTooltip` instead for hover behavior (tooltips show on hover, popups on click). Show road name, length (m), lanes, speed limit, and direction.
- `**src/pages/user/UserRoutePage.tsx**`: Add same tooltip binding to road polylines in the route page map.

## 5. Zoom to Junction (sidebar click)

**Changes:**

- Already implemented! `JunctionSidebar` calls `onJunctionFly(lat, lng)` on click, and `AdminMapPage` passes `flyTo` to `TrafficMap` which calls `map.flyTo()`. 
- **Enhancement**: Increase zoom level from 15 to 16 on flyTo, and add a brief highlight animation (temporary larger circle that fades) on the target junction in `TrafficMap.tsx`.

## 6. Turn Restrictions Visualization

**Changes:**

- `**src/lib/types.ts**`: Add `TurnRestriction` type: `{junction_id, from_road, to_road, restriction_type: "no_left"|"no_right"|"no_uturn"}`.
- `**src/lib/mock-data.ts**`: Add `mockTurnRestrictions` array with 5-6 realistic restrictions at busy junctions (J3, J5, J9). Export in `MapData`.
- `**src/lib/types.ts**`: Add `turn_restrictions` to `MapData` interface.
- `**src/components/TrafficMap.tsx**`: At zoom >= 15, render turn restriction icons as `divIcon` markers near the junction with standard road sign symbols (🚫⬅, 🚫↩, etc.) positioned offset from junction center based on the restricted direction.
- Add a toggle button on the map to show/hide turn restrictions layer.

## File Change Summary


| File                               | Changes                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `src/lib/types.ts`                 | Add `MultiRouteResult`, congestion fields, `TurnRestriction`              |
| `src/lib/mock-data.ts`             | K-shortest paths algo, congestion calc, turn restrictions data            |
| `src/lib/api.ts`                   | `findMultipleRoutes` function                                             |
| `src/hooks/use-map-data.ts`        | `useFindMultipleRoutes` hook                                              |
| `src/components/TrafficMap.tsx`    | Density animation, road tooltips, turn restrictions, flyTo enhancement    |
| `src/pages/user/UserRoutePage.tsx` | Multi-route display, route selection UI, congestion impact, road tooltips |
| `src/index.css`                    | Pulse animation keyframes                                                 |
