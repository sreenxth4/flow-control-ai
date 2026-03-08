AI Traffic Management — Frontend UI

Overview

A modern, navigation-style React frontend that visualizes a 10-junction traffic network on a Leaflet map, displays real-time traffic data from a Flask backend, and provides junction-level signal phase monitoring, YOLOv9 vehicle detection results, and a route finder placeholder.

Pages & Layout

1. Main Map Page (Home)

Full-screen Leaflet map centered on latitude 28.6139, longitude 77.2090, zoom level 16 (New Delhi region).

10 junctions shown as circle markers, color-coded by traffic density (green=LOW, yellow=MEDIUM, red=HIGH):

  - J1 "Main Square" (28.6139, 77.2090)

  - J2 "Railway Crossing" (28.6150, 77.2100)

  - J3 "Hospital Junction" (28.6120, 77.2080)

  - J4 "Bus Terminal" (28.6160, 77.2070)

  - J5 "Market Circle" (28.6110, 77.2100)

  - J6 "University Gate" (28.6172, 77.2090)

  - J7 "Tech Park" (28.6145, 77.2125)

  - J8 "River Bridge" (28.6098, 77.2085)

  - J9 "Old Fort Gate" (28.6130, 77.2055)

  - J10 "Stadium Junction" (28.6178, 77.2115)

33 directed roads drawn as polylines between junctions. Use the "roads" array from the /api/v1/map response — each road has from_junction and to_junction IDs. Draw arrows/lines between the corresponding junction lat/lng coordinates.

Collapsible sidebar panel showing:

  - Junction list with names, types, and density status badges

  - Click a junction in the list to fly to it on the map

  - Signal phase summary per junction (phase name + green roads)

  - Animated signal indicators showing current green phase

2. Junction Detail View

Click a junction marker on the map → opens a detail panel/modal.

Fetches data from GET /api/v1/junctions/:id

Shows:

  - Junction name and type

  - Incoming roads list (with road names, lanes, speed limit)

  - Outgoing roads list (with road names, lanes, speed limit)

  - Signal phases displayed as colored timeline bars (phase name, green_roads, min_green/max_green)

3. Video Detection Panel

A page or modal for uploading traffic surveillance video for AI detection.

  - Source ID text input (camera identifier, e.g. "cam_01")

  - Video file upload (drag-and-drop or file picker, accepts .mp4 .avi .mov .mkv)

  - Target FPS slider (range 1-30, default 5)

  - "Run Detection" button → calls POST /api/v1/detect/video (multipart form-data with fields: source_id, video_file, target_fps)

  - Loading state with progress indication during processing (processing can take 30-300 seconds)

  - Results display after completion:

    - Total frames processed

    - Processing time (seconds)

    - Average processing FPS

    - Detections per frame (collapsible list showing vehicle counts per frame)

    - Performance profile breakdown (detect/track/analyze time)

4. Traffic Dashboard (overlay or separate page)

  - Signal phases table for all 10 junctions (from /api/v1/map signal_phases data)

  - Performance diagnostics panel (from /api/v1/performance/latest): processing time, FPS, frame count

  - System health indicator (from /healthz)

  - Auto-refreshes every 60 seconds

5. Route Finder (placeholder — backend endpoint not yet implemented)

  - Source selector: click on map or pick from junction dropdown

  - Destination selector: click on map or pick from junction dropdown

  - "Find Route" button (disabled, shows "Coming Soon" tooltip)

  - Placeholder route display area with message: "Route computation will be available in a future update"

  - TODO comments in the code where the POST /routes API call would go

API Integration

Configurable base URL (default: [http://127.0.0.1:5000](http://127.0.0.1:5000)). Store in an environment variable VITE_API_BASE_URL.

Endpoints consumed:

  GET  /healthz                    → Health check. Response: { status, phase, detector, model, video_support }

  GET  /api/v1/map                 → Full map data. Response: { region_name, junctions[], roads[], signal_phases[] }

  GET  /api/v1/junctions           → Junction list. Response: { junctions[], count }

  GET  /api/v1/junctions/:id       → Junction detail. Response: { junction, incoming_roads[], outgoing_roads[], signal_phases[] }

  POST /api/v1/detect/video        → Video detection (multipart form-data: source_id, video_file, target_fps). Response: { source_id, total_frames_processed, processing_time_seconds, average_processing_fps, detections_per_frame[], performance_profile }

  GET  /api/v1/performance/latest  → Latest performance profile. Response: { summary, performance_profile }

  GET  /api/v1/frames              → Recent frame metadata. Response: { frames[], count }

  GET  /api/v1/metrics             → FPS estimates per source. Response: metrics object

Use React Query (TanStack Query) for all API calls with:

  - Automatic caching

  - Polling/auto-refresh (60s interval for map data, 30s for health)

  - Error handling with toast notifications

  - Loading skeleton states

CORS is enabled on the backend for all /api/* routes.

Key Features

- Color-coded density markers on junctions (LOW=green, MEDIUM=yellow, HIGH=red). Default to LOW (green) when no detection data is available.

- Signal phase visualization: for each junction, show which roads get green in each phase, with min/max green durations.

- Animated signal indicators showing current green phase.

- Click junction markers to see full detail view with roads and signals.

- Click-to-select source and destination on map (for future route finder).

- Video upload with detection results, vehicle counts, and performance breakdown.

- Performance diagnostics panel showing per-stage timing (detection, tracking, analysis).

- Auto-refresh traffic data at configurable interval.

- Responsive layout for desktop and tablet.

- Mock data fallback when backend is unavailable: generate realistic mock data matching the API response shapes above, so the UI is fully functional for demo/development without a running backend. Include a visual indicator (banner or badge) when using mock data.

- Dark mode support.

Tech Stack

- React 18+ with TypeScript

- Leaflet + react-leaflet for the map

- TanStack Query (React Query) for API calls with polling

- Tailwind CSS + shadcn/ui for sidebar, controls, modals, and tables

- React Router for page navigation

- Lucide React for icons