"""
Flask app for Traffic Flow Analysis.
Phase 0: Basic health and map endpoints
Phase 1: Full map API with junctions, roads, and signal phases
Phase 2: Frame ingestion stub for video/real-time simulation
Phase 3: Vehicle detection stub (dummy detector)
"""
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
import os
import json
import base64
import time
import threading
import traceback
import math
import gc
import copy
from modules.map_store import MapStore
from modules.frame_store import FrameStore
from modules.video_processor import VideoProcessor
from modules.network_model import RoadNetwork
from modules.route_optimizer import RouteOptimizer
from modules.signal_optimizer import SignalOptimizer
from modules.traffic_state import TrafficState
from detector import DummyDetector, YoloV9Detector
import config

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_TEMPLATES = os.path.join(BASE_DIR, "../frontend/templates")
FRONTEND_ASSETS = os.path.join(BASE_DIR, "../frontend/assets")
MAP_PATH = os.path.join(BASE_DIR, "data", "map_region.json")
LIVE_METRICS_PATH = os.path.join(BASE_DIR, "data", "junction_live_metrics.json")
SIGNAL_HISTORY_PATH = os.path.join(BASE_DIR, "data", "junction_signal_history.json")

# Initialize stores
map_store = MapStore(MAP_PATH)
frame_store = FrameStore(max_frames=config.MAX_FRAMES)

# Initialize detector based on config
print(f"\n{'='*60}")
print(f"PHASE 3.5: Detector Initialization")
print(f"{'='*60}")
if config.DETECTOR_MODE == "yolov9":
    print(f"Mode: YOLOv9 Real Detection")
    print(f"Model: {config.YOLOV9_MODEL}")
    print(f"Confidence: {config.YOLOV9_CONFIDENCE}")
    detector = YoloV9Detector(
        model_name=config.YOLOV9_MODEL,
        conf_threshold=config.YOLOV9_CONFIDENCE
    )
else:
    print(f"Mode: Dummy (Fake Detections)")
    detector = DummyDetector()
print(f"{'='*60}\n")

# Initialize video processor with detector
video_processor = VideoProcessor(
    detector,
    enable_tracking=True,
    tracker_use_appearance=getattr(config, "TRACKER_USE_APPEARANCE", False)
)

# Latest video performance diagnostics (updated after each /api/v1/detect/video run)
last_video_performance = None
last_video_summary = None

# ── Routing / signal optimization (Phase 6 merge) ──
road_network = RoadNetwork()
route_optimizer = RouteOptimizer(road_network)
signal_optimizer = SignalOptimizer(
    min_green=config.MIN_GREEN_SIGNAL_SECONDS,
    max_green=config.MAX_GREEN_SIGNAL_SECONDS,
    default_green=config.DEFAULT_GREEN_SIGNAL_SECONDS,
    reference_pcu=config.SIGNAL_REFERENCE_PCU,
)

# ── Per-road traffic state (Phase 7: pressure-based optimization) ──
traffic_state = TrafficState()

# Stores latest signal timings per junction  {junction_id: {lane: timing_dict}}
junction_signal_timings: dict = {}
junction_signal_history: dict = {}
junction_signal_lock = threading.Lock()
# (90-sec signal scheduler REMOVED — replaced by continuous adaptive signals in 5-sec loop)

# Stores latest analyzed traffic metrics per junction so all frontend portals
# can render the same live values after video analysis.
junction_live_metrics: dict = {}


def _load_live_metrics_from_disk() -> None:
    """Load persisted live junction metrics from disk if available."""
    global junction_live_metrics
    try:
        if not os.path.exists(LIVE_METRICS_PATH):
            return
        with open(LIVE_METRICS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            junction_live_metrics = data
            print(f"[LiveMetrics] Loaded {len(junction_live_metrics)} junction entries from disk")
    except Exception as err:
        print(f"[LiveMetrics] Warning: failed to load persisted metrics: {err}")


def _save_live_metrics_to_disk() -> None:
    """Persist live junction metrics to disk for restart-safe state."""
    try:
        os.makedirs(os.path.dirname(LIVE_METRICS_PATH), exist_ok=True)
        with open(LIVE_METRICS_PATH, "w", encoding="utf-8") as f:
            json.dump(junction_live_metrics, f, indent=2)
    except Exception as err:
        print(f"[LiveMetrics] Warning: failed to persist metrics: {err}")


def _load_signal_history_from_disk() -> None:
    """Load persisted autonomous signal schedules if available."""
    global junction_signal_history, junction_signal_timings
    try:
        if not os.path.exists(SIGNAL_HISTORY_PATH):
            return
        with open(SIGNAL_HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return

        junction_signal_history = data
        junction_signal_timings = {
            junction_id: plan.get("signal_timings", {})
            for junction_id, plan in junction_signal_history.items()
            if isinstance(plan, dict)
        }
        print(f"[SignalHistory] Loaded {len(junction_signal_history)} junction plans from disk")
    except Exception as err:
        print(f"[SignalHistory] Warning: failed to load persisted schedules: {err}")


def _save_signal_history_to_disk() -> None:
    """Persist autonomous signal schedules to disk."""
    try:
        os.makedirs(os.path.dirname(SIGNAL_HISTORY_PATH), exist_ok=True)
        with open(SIGNAL_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(_json_safe(junction_signal_history), f, indent=2)
    except Exception as err:
        print(f"[SignalHistory] Warning: failed to persist schedules: {err}")


def _update_live_junction_metrics(junction_id: str, density_data: dict) -> None:
    """Persist latest analyzed metrics for a junction in runtime memory."""
    if not junction_id or not isinstance(density_data, dict):
        return

    junction_live_metrics[str(junction_id)] = {
        "density": density_data.get("traffic_density"),
        "vehicle_count": density_data.get("total_vehicles"),
        "total_pcu": density_data.get("total_pcu"),
        "vehicle_type_distribution": density_data.get("vehicle_type_distribution", {}),
        "average_dwell_time_seconds": density_data.get("average_dwell_time_seconds"),
        "frames_analyzed": density_data.get("frames_analyzed"),
        "updated_at": time.time(),
    }
    _save_live_metrics_to_disk()


def _derive_density_from_pcu(total_pcu: float) -> str:
    """Map PCU to a coarse density band for frontend compatibility."""
    if total_pcu >= 25:
        return "HIGH"
    if total_pcu >= 10:
        return "MEDIUM"
    return "LOW"


def _build_autonomous_signal_plan(junction_id: str, metrics: dict, now: float | None = None) -> dict:
    """Build the current 90-second autonomous plan for a junction.

    Uses pressure-based optimization when phase data is available,
    otherwise falls back to simple PCU-based timing.
    """
    ts = float(now or time.time())
    total_pcu = float(metrics.get("total_pcu", 0) or 0.0)
    density_level = metrics.get("density") or _derive_density_from_pcu(total_pcu)

    # Gather phase + road data for pressure-based optimization
    phases = None
    road_pcu = None
    incoming_roads = None
    outgoing_roads = None

    if junction_id in road_network.junction_info:
        map_store.load()
        phase_data = map_store.get_signal_phases(junction_id)
        if phase_data:
            phases = phase_data.get("phases", [])
        junction_data = map_store.get_junction(junction_id)
        if junction_data:
            incoming_roads = junction_data.get("incoming_roads", [])
            outgoing_roads = junction_data.get("outgoing_roads", [])
        # Get current PCU for all roads from traffic state
        road_pcu = {r: traffic_state.get_road_pcu(r) for r in
                     (incoming_roads or []) + (outgoing_roads or [])}

    plan = signal_optimizer.optimize_autonomous_junction(
        junction_id=junction_id,
        total_pcu=total_pcu,
        interval_seconds=config.SIGNAL_REOPTIMIZE_INTERVAL_SECONDS,
        phases=phases,
        road_pcu=road_pcu,
        incoming_roads=incoming_roads,
        outgoing_roads=outgoing_roads,
    )
    plan["density_level"] = density_level
    plan["vehicle_count"] = metrics.get("vehicle_count", 0)
    plan["updated_at"] = ts
    plan["source_updated_at"] = metrics.get("updated_at")
    plan["interval_seconds"] = config.SIGNAL_REOPTIMIZE_INTERVAL_SECONDS
    plan["signal_timings"] = {
        "lane_0": {
            "green_duration": plan["green_duration"],
            "density": density_level,
            "vehicle_count": metrics.get("vehicle_count", 0),
            "total_pcu": round(total_pcu, 2),
            "timestamp": ts,
        }
    }
    return plan


def _apply_autonomous_signal_plan(junction_id: str, metrics: dict, now: float | None = None) -> dict:
    """Recompute and persist the autonomous schedule for a junction."""
    ts = float(now or time.time())
    plan = _build_autonomous_signal_plan(junction_id, metrics, now=ts)

    avg_green = float(plan["green_duration"])
    cycle_time = float(plan["cycle_time"])
    traffic_delay = road_network.estimate_traffic_delay(plan["density_level"])
    signal_wait = road_network.estimate_signal_wait(avg_green, cycle_time)
    road_network.update_junction_cost(junction_id, traffic_delay, signal_wait)

    plan["traffic_delay"] = round(traffic_delay, 2)
    plan["signal_wait"] = round(signal_wait, 2)
    plan["network_cost_updated"] = junction_id in road_network.junction_info

    with junction_signal_lock:
        junction_signal_timings[junction_id] = plan["signal_timings"]
        junction_signal_history[junction_id] = plan
        _save_signal_history_to_disk()

    return plan


def _refresh_due_signal_plans(now: float | None = None) -> None:
    """Refresh any junction plans whose 90-second interval has elapsed."""
    ts = float(now or time.time())
    for junction_id, metrics in list(junction_live_metrics.items()):
        if junction_id not in road_network.junction_info:
            continue
        if not isinstance(metrics, dict):
            continue

        current_plan = junction_signal_history.get(junction_id, {})
        next_refresh = float(current_plan.get("next_refresh_at", 0) or 0)
        if next_refresh and ts < next_refresh:
            continue

        _apply_autonomous_signal_plan(junction_id, metrics, now=ts)


# (90-sec signal scheduler loop REMOVED — adaptive signals now run in 5-sec traffic flow loop)


# ── TRAFFIC FLOW LOOP: Continuous discharge + propagation every 5 sec ──
traffic_flow_thread = None
traffic_flow_started = False

def _traffic_flow_loop() -> None:
    """Background loop: discharge queues + propagate traffic continuously."""
    while True:
        try:
            # 1. Decay video sources after 120s → "propagated"
            decayed = traffic_state.decay_video_sources()
            if decayed > 0:
                print(f"[TrafficFlow] Decayed {decayed} video source(s) → propagated")

            # 2. Simulate background traffic arrivals (prevents draining to 0)
            traffic_state.simulate_baseline_arrivals()

            # 3. Update junction signals: highest-pressure road → GREEN, others → RED
            traffic_state.update_junction_signals()

            # 3. Discharge only GREEN roads (video roads at 0.4x rate)
            discharge_results = traffic_state.discharge_all_roads(junction_signal_history)
            
            # 4. Propagate discharged vehicles to outgoing roads
            propagation = traffic_state.propagate_all_junctions()

            # 4. Update junction live metrics with fresh totals
            for j_id in road_network.junction_ids:
                j_pcu_map = traffic_state.get_junction_incoming_pcu(j_id)
                total_pcu = sum(j_pcu_map.values()) if j_pcu_map else 0.0
                density = traffic_state.classify_density(total_pcu)
                _update_live_junction_metrics(j_id, {
                    "traffic_density": density,
                    "total_pcu": total_pcu,
                    "total_vehicles": 0
                })

        except Exception as err:
            print(f"[TrafficFlow] Warning: {err}")
        time.sleep(5)


def _ensure_traffic_flow_running() -> None:
    """Start the traffic flow thread once per process."""
    global traffic_flow_thread, traffic_flow_started
    if traffic_flow_started:
        return

    traffic_flow_thread = threading.Thread(
        target=_traffic_flow_loop,
        name="traffic-flow",
        daemon=True,
    )
    traffic_flow_thread.start()
    traffic_flow_started = True
    print("[TrafficFlow] Continuous 5-second discharge+propagation loop started")


def _enrich_junction_with_live_metrics(junction: dict) -> dict:
    """Attach latest analyzed metrics to a single junction payload."""
    if not isinstance(junction, dict):
        return junction

    j_id = str(junction.get("id", ""))
    metrics = junction_live_metrics.get(j_id)
    if not metrics:
        return junction

    enriched = dict(junction)
    enriched.update({
        "density": metrics.get("density"),
        "vehicle_count": metrics.get("vehicle_count"),
        "total_pcu": metrics.get("total_pcu"),
        "vehicle_type_distribution": metrics.get("vehicle_type_distribution", {}),
        "average_dwell_time_seconds": metrics.get("average_dwell_time_seconds"),
        "frames_analyzed": metrics.get("frames_analyzed"),
        "live_updated_at": metrics.get("updated_at"),
    })
    return enriched


def _enrich_map_payload_with_live_metrics(map_payload: dict) -> dict:
    """Attach latest analyzed metrics to all junctions in the map payload."""
    if not isinstance(map_payload, dict):
        return map_payload

    enriched = copy.deepcopy(map_payload)
    junctions = enriched.get("junctions", [])
    if isinstance(junctions, list):
        enriched["junctions"] = [_enrich_junction_with_live_metrics(j) for j in junctions]
    return enriched

def _init_road_network():
    """Load road topology from map_region.json into the in-memory cost graph."""
    map_store.load()
    map_data = map_store.get_map()
    road_network.load_from_map(map_data)
    # Initialize per-road traffic state with baseline values
    traffic_state.initialize_from_map(map_data)
    print(f"[Network] Road graph loaded: {len(road_network.junction_ids)} junctions, "
          f"{sum(len(n) for n in road_network.graph.values())} directed edges")
    print(f"[TrafficState] Initialized {traffic_state.get_summary()['total_roads']} roads with baseline traffic")

_init_road_network()


def _json_safe(value):
    """Convert numpy/scalar-rich objects into JSON-serializable Python types."""
    try:
        import numpy as np
    except Exception:
        np = None

    if value is None or isinstance(value, (str, bool, int)):
        return value

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if np is not None:
        if isinstance(value, np.generic):
            python_value = value.item()
            if isinstance(python_value, float) and not math.isfinite(python_value):
                return None
            return python_value
        if isinstance(value, np.ndarray):
            return [_json_safe(v) for v in value.tolist()]

    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]

    if hasattr(value, "item"):
        try:
            return _json_safe(value.item())
        except Exception:
            pass

    return str(value)


def _take_traffic_snapshot() -> dict:
    """
    Take an atomic snapshot of all live traffic data.
    Ensures routing sees a consistent view (no race between road states and signals).
    """
    _refresh_due_signal_plans()

    road_states = copy.deepcopy(traffic_state.get_all_states())

    # Build junction signals dict (same shape as /api/junction_signals response)
    now = time.time()
    signals = {}
    for j_id in road_network.junction_ids:
        j_roads = traffic_state.get_junction_roads(j_id)
        sig_timing = traffic_state.get_junction_signal_timing(j_id)
        roads_data = {}
        wait_times = sig_timing.get("wait_times", {})
        if j_roads:
            for road_id in j_roads.get("incoming_roads", []):
                state = road_states.get(road_id, {})
                roads_data[road_id] = {
                    "pcu": float(state.get("pcu", 0)),
                    "density": state.get("density", "LOW"),
                    "queue": float(state.get("queue", 0)),
                    "vehicles": state.get("vehicles", 0),
                    "signal": state.get("signal", "RED"),
                    "wait_time": round(wait_times.get(road_id, 0), 0),
                }
        signals[j_id] = {
            "active_green_road": sig_timing.get("active_green_road", ""),
            "green_duration": sig_timing.get("green_duration", 15),
            "time_remaining": max(0, round(
                sig_timing.get("green_duration", 15) - (now - sig_timing.get("green_since", now))
            )),
            "roads": roads_data,
        }

    return {"roads": road_states, "signals": signals}


def _resolve_path_roads(path: list[str]) -> dict:
    """Resolve a junction path into directed road IDs and validation metadata."""
    roads: list[str] = []
    invalid_hops: list[dict] = []
    missing_road_ids: list[dict] = []

    if len(path) <= 1:
        return {
            "roads": roads,
            "invalid_hops": invalid_hops,
            "missing_road_ids": missing_road_ids,
            "adjacency_ok": True,
            "mapping_ok": True,
        }

    for i in range(len(path) - 1):
        from_j = str(path[i])
        to_j = str(path[i + 1])
        neighbors = set(road_network.get_neighbors(from_j))

        if to_j not in neighbors:
            invalid_hops.append({"index": i, "from": from_j, "to": to_j})
            continue

        road_meta = road_network.get_edge_road(from_j, to_j) or {}
        road_id = road_meta.get("road_id")
        if not road_id:
            missing_road_ids.append({"index": i, "from": from_j, "to": to_j})
            continue
        roads.append(str(road_id))

    return {
        "roads": roads,
        "invalid_hops": invalid_hops,
        "missing_road_ids": missing_road_ids,
        "adjacency_ok": len(invalid_hops) == 0,
        "mapping_ok": len(missing_road_ids) == 0,
    }


def _route_to_frontend_shape(route_payload: dict, rank: int | None = None,
                              snapshot: dict | None = None,
                              all_routes: list | None = None) -> dict:
    """Normalize route payload to the frontend RouteResult shape with full breakdown."""
    if not isinstance(route_payload, dict) or not route_payload.get("success"):
        return {
            "success": False, "path": [], "roads": [], "segments": [], "total_cost": 0,
            "num_junctions": 0, "congestion_delay": 0, "congested_junctions": [],
            "delay_reasons": [], "signals_summary": {"green": 0, "red": 0},
            "recommendation": "", "rank": rank,
            "route_validation": {
                "adjacency_ok": False,
                "mapping_ok": False,
                "invalid_hops": [],
                "missing_road_ids": [],
            },
        }

    path = route_payload.get("path", []) or []
    path = [str(p) for p in path]
    resolver = _resolve_path_roads(path)
    if not resolver["adjacency_ok"] or not resolver["mapping_ok"]:
        return {
            "success": False,
            "message": "Route validation failed: invalid hop or missing road mapping",
            "path": path,
            "roads": resolver["roads"],
            "segments": [],
            "total_cost": 0,
            "num_junctions": len(path),
            "congestion_delay": 0,
            "congested_junctions": [],
            "delay_reasons": [],
            "signals_summary": {"green": 0, "red": 0},
            "recommendation": "",
            "rank": rank,
            "route_validation": {
                "adjacency_ok": resolver["adjacency_ok"],
                "mapping_ok": resolver["mapping_ok"],
                "invalid_hops": resolver["invalid_hops"],
                "missing_road_ids": resolver["missing_road_ids"],
            },
        }

    raw_roads = route_payload.get("roads", []) or []
    roads = [str(r) for r in raw_roads if r]
    if len(roads) != max(0, len(path) - 1):
        roads = resolver["roads"]

    raw_segments = route_payload.get("segments", []) or []
    if not raw_segments and len(path) > 1:
        raw_segments = [
            {
                "from_junction": path[i],
                "to_junction": path[i + 1],
                "road_id": roads[i] if i < len(roads) else None,
            }
            for i in range(len(path) - 1)
        ]

    segments = []
    total_traffic_delay = 0.0
    total_signal_delay = 0.0
    total_queue_delay = 0.0
    total_congestion_penalty = 0.0
    green_count = 0
    red_count = 0
    junction_delays: dict[str, dict] = {}

    for seg in raw_segments:
        from_j = seg.get("from_junction") or seg.get("from")
        to_j = seg.get("to_junction") or seg.get("to")
        if not from_j or not to_j:
            continue

        breakdown = None
        if snapshot:
            breakdown = road_network.get_edge_cost_breakdown(from_j, to_j, snapshot)

        if breakdown:
            seg_entry = {
                "from_junction": str(from_j), "to_junction": str(to_j),
                "road_id": seg.get("road_id"),
                "road_name": breakdown.get("road_name") or seg.get("road_name") or "Unknown Road",
                "cost": round(breakdown["total"], 1),
                "base_time": breakdown["base_time"],
                "traffic_delay": breakdown["traffic_delay"],
                "signal_delay": breakdown["signal_delay"],
                "queue_delay": breakdown["queue_delay"],
                "congestion_penalty": breakdown["congestion_penalty"],
                "signal_status": breakdown["signal_status"],
                "pcu": breakdown["pcu"],
            }
            total_traffic_delay += breakdown["traffic_delay"]
            total_signal_delay += breakdown["signal_delay"]
            total_queue_delay += breakdown["queue_delay"]
            total_congestion_penalty += breakdown["congestion_penalty"]

            if breakdown["signal_status"] == "GREEN":
                green_count += 1
            else:
                red_count += 1

            j_name = road_network.get_junction_name(to_j)
            if to_j not in junction_delays:
                junction_delays[to_j] = {"junction": j_name, "junction_id": to_j,
                                          "signal": 0.0, "traffic": 0.0, "queue": 0.0}
            junction_delays[to_j]["signal"] += breakdown["signal_delay"]
            junction_delays[to_j]["traffic"] += breakdown["traffic_delay"]
            junction_delays[to_j]["queue"] += breakdown["queue_delay"]
        else:
            seg_entry = {
                "from_junction": str(from_j), "to_junction": str(to_j),
                "road_id": seg.get("road_id"),
                "road_name": seg.get("road_name") or seg.get("road_id") or "Unknown Road",
                "cost": round(float(seg.get("cost", 0)), 1),
            }
        segments.append(seg_entry)

    # Build delay_reasons grouped by junction
    delay_reasons = []
    for j_id, d in junction_delays.items():
        total_j_delay = d["signal"] + d["traffic"] + d["queue"]
        if total_j_delay > 0.5:
            primary_type = "signal" if d["signal"] >= d["traffic"] else "traffic"
            delay_reasons.append({
                "junction": d["junction"], "junction_id": j_id,
                "type": primary_type, "delay": round(total_j_delay, 1),
                "signal_delay": round(d["signal"], 1),
                "traffic_delay": round(d["traffic"], 1),
                "queue_delay": round(d["queue"], 1),
            })
    delay_reasons.sort(key=lambda x: x["delay"], reverse=True)

    total_cost = sum(s["cost"] for s in segments) if segments else float(route_payload.get("total_cost", 0))
    total_delay = round(total_traffic_delay + total_signal_delay + total_queue_delay + total_congestion_penalty, 1)

    recommendation = _generate_recommendation(
        rank=rank, total_cost=total_cost, total_delay=total_delay,
        signal_delay=total_signal_delay, traffic_delay=total_traffic_delay,
        green_count=green_count, red_count=red_count,
        num_junctions=len(path), all_routes=all_routes,
    )

    return {
        "success": True, "path": path, "roads": roads, "segments": segments,
        "total_cost": round(total_cost, 1),
        "num_junctions": int(route_payload.get("num_junctions", len(path))),
        "congestion_delay": total_delay,
        "congested_junctions": [
            {"id": dr["junction_id"], "delay": dr["delay"],
             "density": "HIGH" if dr["delay"] >= 25 else ("MEDIUM" if dr["delay"] >= 10 else "LOW")}
            for dr in delay_reasons
        ],
        "delay_reasons": delay_reasons,
        "signals_summary": {"green": green_count, "red": red_count},
        "recommendation": recommendation,
        "rank": rank,
        "route_validation": {
            "adjacency_ok": True,
            "mapping_ok": True,
            "invalid_hops": [],
            "missing_road_ids": [],
        },
    }


def _generate_recommendation(rank, total_cost, total_delay, signal_delay,
                              traffic_delay, green_count, red_count,
                              num_junctions, all_routes=None) -> str:
    """Generate a dynamic recommendation string for a route."""
    parts = []
    if rank == 1:
        parts.append("Fastest route")
    elif rank == 2:
        parts.append("Alternative route")
    else:
        parts.append("Longer alternative")

    if all_routes and len(all_routes) > 1 and rank is not None:
        other_delays = [r.get("congestion_delay", 0) for i, r in enumerate(all_routes) if i != rank - 1]
        if other_delays and total_delay < min(other_delays):
            parts.append("with least congestion delay")

    if signal_delay < 3:
        parts.append("— minimal signal wait")
    elif green_count > red_count:
        parts.append(f"— {green_count} green signals en route")

    if traffic_delay < 5:
        parts.append("— light traffic")
    elif traffic_delay > 30:
        parts.append("— expect heavy traffic")

    if num_junctions <= 3:
        parts.append("— fewer stops")

    return " ".join(parts) if parts else "Route available"


def _find_k_shortest_simple_routes(source: str, destination: str,
                                    k: int = 3, max_depth: int = 10,
                                    snapshot: dict | None = None) -> list[dict]:
    """Find top-k simple (cycle-free) routes by cost with path diversity.
    
    When a live traffic snapshot is provided, edge costs incorporate
    current PCU, signal delays, and queue congestion. Otherwise falls
    back to static base costs.
    """
    if source == destination:
        return []

    use_live = snapshot is not None

    paths_with_cost: list[tuple[list[str], float]] = []
    stack: list[tuple[str, list[str], float]] = [(source, [source], 0.0)]

    while stack:
        node, path, cost_so_far = stack.pop()
        if len(path) > max_depth:
            continue
        if node == destination:
            paths_with_cost.append((path, cost_so_far))
            continue
        for neighbor in road_network.get_neighbors(node):
            if neighbor in path:
                continue
            if use_live:
                edge_cost = road_network.get_live_edge_cost(node, neighbor, snapshot)
            else:
                edge_cost = road_network.get_edge_cost(node, neighbor)
            if not math.isfinite(edge_cost):
                continue
            stack.append((neighbor, path + [neighbor], cost_so_far + edge_cost))

    paths_with_cost.sort(key=lambda item: item[1])

    # Path-penalty diversity: already-selected edges get a cost boost for ordering
    unique_routes: list[dict] = []
    seen: set[tuple[str, ...]] = set()
    used_edges: set[tuple[str, str]] = set()

    for path, total_cost in paths_with_cost:
        path_key = tuple(path)
        if path_key in seen:
            continue
        seen.add(path_key)

        unique_routes.append(route_optimizer.get_route_details(
            path,
            total_cost,
            snapshot=snapshot,
            use_live_cost=use_live,
        ))
        path_edges = [(path[i], path[i + 1]) for i in range(len(path) - 1)]
        for e in path_edges:
            used_edges.add(e)
        if len(unique_routes) >= k:
            break

    return unique_routes


def create_app():
    app = Flask(__name__, static_folder=FRONTEND_ASSETS, template_folder=FRONTEND_TEMPLATES)
    CORS(
        app,
        resources={
            r"/api/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"]},
            r"/healthz": {"origins": "*", "methods": ["GET", "OPTIONS"]},
        },
        supports_credentials=True,
    )

    # Restore last analyzed junction state (survives server restarts).
    _load_live_metrics_from_disk()
    _load_signal_history_from_disk()
    # (90-sec scheduler removed — adaptive signals run in 5-sec traffic flow loop)
    _ensure_traffic_flow_running()

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        # Non-API routes: plain 500 response.
        if not request.path.startswith("/api/"):
            return "Internal Server Error", 500

        return jsonify({
            "error": str(error),
            "error_type": type(error).__name__
        }), 500

    @app.route("/healthz")
    def health():
        return jsonify({
            "status": "ok",
            "phase": 6,
            "features": ["detection", "tracking", "density_pcu", "signal_optimization", "routing"],
            "detector": config.DETECTOR_MODE,
            "model": config.YOLOV9_MODEL if config.DETECTOR_MODE == "yolov9" else "N/A",
            "video_support": True,
            "routing_support": True,
            "junctions": len(road_network.junction_ids),
        })

    @app.route("/api/v1/healthz")
    def health_api():
        """API-scoped health endpoint for frontend clients that only call /api/* routes."""
        return health()

    @app.route("/api/v1/map")
    def get_map():
        """Return the full digital map."""
        map_store.load()
        map_payload = map_store.get_map()
        return jsonify(_enrich_map_payload_with_live_metrics(map_payload))

    @app.route("/api/v1/frames", methods=["GET"])
    def list_frames():
        """List recent frames (metadata only)."""
        frames = frame_store.get_frames()
        return jsonify({"frames": frames, "count": len(frames)})

    @app.route("/api/v1/frames/clear", methods=["POST"])
    def clear_frames():
        """Clear all frames or those for a given source_id."""
        payload = request.get_json(silent=True) or {}
        source_id = payload.get("source_id")
        result = frame_store.clear(source_id=source_id)
        cleared_scope = source_id if source_id else "all"
        return jsonify({"message": "frames cleared", "scope": cleared_scope, "removed": result.get("removed", 0)})

    @app.route("/api/v1/metrics", methods=["GET"])
    def metrics():
        """Return last timestamp and FPS estimates per source."""
        data = frame_store.get_metrics()
        return jsonify(data)

    @app.route("/api/v1/detect", methods=["POST", "OPTIONS"])
    def detect():
        """Run detection on the latest frame for a given source_id."""
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"}), 200
        
        payload = request.get_json(silent=True) or {}
        source_id = payload.get("source_id")

        if not source_id:
            return jsonify({"error": "source_id is required"}), 400

        # Find latest frame for this source
        frames = frame_store.get_frames()
        source_frames = [f for f in frames if f.get("source_id") == source_id]
        
        if not source_frames:
            return jsonify({"error": f"No frames found for source_id: {source_id}"}), 404

        latest = source_frames[-1]
        
        # Retrieve actual frame bytes for detection
        frame_data = frame_store.get_frame_data(latest.get("id"))
        if not frame_data:
            return jsonify({"error": "Frame data not found in store"}), 500
        
        # Run detection (YOLOv9 or Dummy based on config)
        result = detector.detect(
            frame_data=frame_data,
            source_id=source_id,
            timestamp=latest.get("received_at", time.time())
        )
        
        # Add class counts for convenience
        class_counts = detector.get_class_counts(result.get("detections", []))

        result["class_counts"] = class_counts
        
        return jsonify(_json_safe(result))
    
    @app.route("/api/v1/detect/video", methods=["POST", "OPTIONS"])
    def detect_video():
        """
        Phase 3.7: Run detection on video file.
        Processes video frame-by-frame and returns detection summary.
        
        Input (JSON or multipart/form-data):
            - source_id: Camera/source identifier (required)
            - video_path: Path to video file on server (optional)
            - video_file: Uploaded video file (optional, multipart)
            - target_fps: Processing FPS, default 10.0 (optional)
            - max_frames: Max frames to process, default None = all (optional)
        
        Returns:
            {
                "source_id": str,
                "total_frames_processed": int,
                "video_duration_seconds": float,
                "processing_time_seconds": float,
                "average_processing_fps": float,
                "detections_per_frame": [...],
                "last_frame_sample": {...}
            }
        """
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"}), 200
        
        global last_video_performance, last_video_summary
        try:
            # Handle multipart form data (file upload) or JSON
            if request.content_type and 'multipart/form-data' in request.content_type:
                source_id = request.form.get("source_id")
                road_id = request.form.get("road_id")  # NEW: per-road analysis
                target_fps = 10.0  # Locked: 10 FPS optimal for all video inputs
                max_frames = request.form.get("max_frames")
                max_frames = int(max_frames) if max_frames else None
                detection_stride = request.form.get("detection_stride", "auto")
                if detection_stride != "auto":
                    detection_stride = int(detection_stride)
                
                # Check for uploaded file
                if 'video_file' not in request.files:
                    return jsonify({"error": "video_file is required in form data"}), 400
                
                video_file = request.files['video_file']
                if video_file.filename == '':
                    return jsonify({"error": "No video file selected"}), 400
                
                # Read file bytes
                video_bytes = video_file.read()
                
                # Process uploaded video
                result = video_processor.process_video_file_upload(
                    video_bytes=video_bytes,
                    source_id=source_id or "unknown",
                    filename=video_file.filename,
                    target_fps=target_fps,
                    max_frames=max_frames,
                    detection_stride=detection_stride
                )
            else:
                # Handle JSON payload
                payload = request.get_json(silent=True) or {}
                source_id = payload.get("source_id")
                road_id = payload.get("road_id")  # NEW: per-road analysis
                video_path = payload.get("video_path")
                target_fps = 10.0  # Locked: 10 FPS optimal for all video inputs
                max_frames = payload.get("max_frames")
                detection_stride = payload.get("detection_stride", "auto")
                if detection_stride != "auto":
                    detection_stride = int(detection_stride)
                
                if not source_id:
                    return jsonify({"error": "source_id is required"}), 400
                
                if not video_path:
                    return jsonify({"error": "video_path is required when not uploading file"}), 400
                
                # Process video from path
                result = video_processor.process_video(
                    video_path=video_path,
                    source_id=source_id,
                    target_fps=target_fps,
                    max_frames=max_frames,
                    detection_stride=detection_stride
                )
            
            # Check for processing errors
            safe_result = _json_safe(result)

            # Persist lightweight diagnostics for quick troubleshooting
            if isinstance(safe_result, dict):
                last_video_performance = safe_result.get("performance_profile")
                last_video_summary = {
                    "processing_time_seconds": safe_result.get("processing_time_seconds"),
                    "average_processing_fps": safe_result.get("average_processing_fps"),
                    "total_frames_processed": safe_result.get("total_frames_processed"),
                    "timestamp": time.time()
                }

            if "error" in safe_result:
                return jsonify(safe_result), 500

            # Persist latest analyzed metrics so all frontend portals can fetch
            # synchronized live junction values from map/junction endpoints.
            try:
                analyzed_source_id = safe_result.get("source_id")
                analyzed_density = safe_result.get("road_density_analysis") or {}
                _update_live_junction_metrics(str(analyzed_source_id), analyzed_density)
            except Exception:
                pass

            # ── PER-ROAD: Store detection results per-road ──
            try:
                if road_id:
                    density_data = safe_result.get("road_density_analysis") or {}
                    road_pcu = float(density_data.get("total_pcu", 0))
                    road_vehicles = int(density_data.get("total_vehicles", 0))
                    traffic_state.update_road_from_detection(road_id, road_pcu, road_vehicles)
                    safe_result["road_id"] = road_id
                    safe_result["road_state_updated"] = True
                    print(f"[RoadState] {road_id}: pcu={road_pcu}, vehicles={road_vehicles}")
            except Exception as road_err:
                print(f"[RoadState] Warning: per-road update failed: {road_err}")

            # ── AUTO-TRIGGER: autonomous PCU signal optimization ──
            # After successful video processing, immediately refresh the
            # junction's current 90-second autonomous signal plan.
            try:
                used_source_id = str(safe_result.get("source_id", "unknown"))
                
                # Fetch actual live total PCU from traffic_state (sum of all incoming roads)
                j_pcu_map = traffic_state.get_junction_incoming_pcu(used_source_id)
                real_total_pcu = sum(j_pcu_map.values()) if j_pcu_map else 0.0
                real_density = traffic_state.classify_density(real_total_pcu)
                
                # Update legacy metric store so /api/junctions still works
                _update_live_junction_metrics(used_source_id, {
                    "traffic_density": real_density,
                    "total_pcu": real_total_pcu,
                    "total_vehicles": 0
                })
                
                metrics = {
                    "density": real_density,
                    "vehicle_count": 0,
                    "total_pcu": real_total_pcu,
                    "updated_at": time.time(),
                }

                auto_plan = _apply_autonomous_signal_plan(str(used_source_id), metrics)
                safe_result["auto_signal_optimization"] = _json_safe(auto_plan)
                print(
                    f"[AutoSignal] {used_source_id}: pcu={metrics.get('total_pcu', 0)}, "
                    f"green={auto_plan['green_duration']}s, next_refresh={auto_plan['next_refresh_at']}"
                )

                # NOTE: Discharge + propagation is now handled by the continuous
                # _traffic_flow_loop (every 5s). No inline discharge here.
            except Exception as auto_err:
                # Non-fatal: log but don't fail the whole response
                print(f"[AutoSignal] Warning: auto-trigger failed: {auto_err}")
                safe_result["auto_signal_optimization"] = {"error": str(auto_err)}

            # ── MEMORY CLEANUP: Free resources after processing completes ──
            # This ensures memory is consistently freed between video runs,
            # preventing the 3-4x slowdown from memory pressure/disk swapping
            detector.clear_cache()  # Clear detector model cache if available
            try:
                import torch
                torch.cuda.empty_cache()  # Clear CUDA cache if GPU used
                torch.cpu._empty_cache() if hasattr(torch.cpu, '_empty_cache') else None  # Clear CPU cache
            except Exception:
                pass  # torch might not be imported if using DummyDetector
            gc.collect()
            
            return jsonify(safe_result)
        except ValueError as e:
            detector.clear_cache()  # Clear detector cache even on error
            try:
                import torch
                torch.cuda.empty_cache()
                torch.cpu._empty_cache() if hasattr(torch.cpu, '_empty_cache') else None
            except Exception:
                pass
            gc.collect()  # Free memory even on error
            return jsonify({"error": f"Invalid request: {str(e)}"}), 400
        except Exception as e:
            detector.clear_cache()  # Clear detector cache even on error
            try:
                import torch
                torch.cuda.empty_cache()
                torch.cpu._empty_cache() if hasattr(torch.cpu, '_empty_cache') else None
            except Exception:
                pass
            gc.collect()  # Free memory even on error
            return jsonify({
                "error": f"Video processing failed: {str(e)}",
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc().splitlines()[-5:]
            }), 500

    @app.route("/api/v1/performance/latest", methods=["GET"])
    def latest_performance():
        """Return latest video processing performance profile for diagnostics."""
        if last_video_summary is None:
            return jsonify({"error": "No video processing run recorded yet"}), 404

        return jsonify({
            "summary": last_video_summary,
            "performance_profile": last_video_performance
        })
    
    @app.route("/api/v1/frames/latest", methods=["GET"])
    def latest_frame():
        """Return the most recent frame metadata."""
        latest = frame_store.get_latest()
        if not latest:
            return jsonify({"error": "No frames ingested yet"}), 404
        return jsonify(latest)

    @app.route("/api/v1/ingest/frame", methods=["POST"])
    def ingest_frame():
        """
        Ingest a single image frame (base64-encoded JPEG/PNG only).
        
        For VIDEO FILES: Use POST /api/v1/detect/video instead (Phase 3.7)
        
        Input (JSON):
            - frame_base64: Base64-encoded JPEG or PNG image (required)
            - source_id: Camera/junction identifier (optional, default: "unknown")
            - source: Source type (optional, default: "upload")
            - timestamp: Frame timestamp in seconds (optional, default: current time)
        
        Returns:
            {
                "message": "frame ingested",
                "metadata": {frame metadata}
            }
        """
        payload = request.get_json(silent=True) or {}
        frame_b64 = payload.get("frame_base64")
        source = payload.get("source", "upload")
        source_id = payload.get("source_id", "unknown")
        timestamp = payload.get("timestamp") or time.time()

        if not frame_b64:
            return jsonify({"error": "frame_base64 is required"}), 400

        try:
            raw_bytes = base64.b64decode(frame_b64)
        except Exception:
            return jsonify({"error": "Invalid base64 data"}), 400
        
        # Validate that the data is a valid image (JPEG or PNG)
        # JPEG signature: FF D8 FF
        # PNG signature: 89 50 4E 47
        if len(raw_bytes) < 4:
            return jsonify({
                "error": "Invalid image data: too small to be JPEG or PNG",
                "hint": "Upload a valid JPEG or PNG image file",
                "note": "For VIDEO files, use POST /api/v1/detect/video (Phase 3.7)"
            }), 400
        
        # Check image format signatures
        is_jpeg = raw_bytes[:3] == b'\xff\xd8\xff'
        is_png = raw_bytes[:4] == b'\x89PNG'
        
        if not (is_jpeg or is_png):
            return jsonify({
                "error": "Invalid image format: must be JPEG or PNG",
                "detected_signature": raw_bytes[:4].hex(),
                "hint": "Upload a JPEG or PNG image file",
                "note": "For VIDEO files (.mp4, .avi, etc.), use POST /api/v1/detect/video (Phase 3.7)",
                "phase_3_7_video_endpoint": "/api/v1/detect/video"
            }), 400

        metadata = frame_store.add_frame(raw_bytes, source=source, source_id=source_id, timestamp=timestamp)
        return jsonify({"message": "frame ingested", "metadata": metadata})

    @app.route("/api/v1/junctions")
    def get_junctions():
        """Return all junctions (Phase 1 endpoint)."""
        map_store.load()
        junctions = map_store.get_junctions()
        junctions = [_enrich_junction_with_live_metrics(j) for j in junctions]
        return jsonify({"junctions": junctions, "count": len(junctions)})

    @app.route("/api/v1/junctions/<junction_id>")
    def get_junction_detail(junction_id):
        """Return details for a specific junction including signal phases."""
        map_store.load()
        junction = map_store.get_junction(junction_id)
        
        if not junction:
            return jsonify({"error": "Junction not found"}), 404
        
        # Include incoming/outgoing roads and signal phases
        incoming = map_store.get_incoming_roads(junction_id)
        outgoing = map_store.get_outgoing_roads(junction_id)
        signals = map_store.get_signal_phases(junction_id)
        
        return jsonify({
            "junction": _enrich_junction_with_live_metrics(junction),
            "incoming_roads": incoming,
            "outgoing_roads": outgoing,
            "signal_phases": signals
        })

    # ─────────────────────────────────────────────────
    # Phase 6: Routing / Signal Optimization Endpoints
    # ─────────────────────────────────────────────────

    @app.route("/api/get_route", methods=["POST", "OPTIONS"])
    def get_route():
        """
        Find optimal route between two junctions using Dijkstra.

        Input JSON: {"source": "J1", "destination": "J5"}
        Returns: {"success": true, "path": [...], "segments": [...], "total_cost": float, ...}
        """
        if request.method == "OPTIONS":
            return "", 204

        data = request.get_json(silent=True) or {}
        source = data.get("source")
        destination = data.get("destination")

        if not source or not destination:
            return jsonify({"success": False, "message": "Provide source and destination junction IDs"}), 400

        snapshot = _take_traffic_snapshot()
        result = route_optimizer.find_optimal_route(
            str(source),
            str(destination),
            snapshot=snapshot,
            use_live_cost=True,
        )
        return jsonify(_route_to_frontend_shape(result, rank=1, snapshot=snapshot))

    @app.route("/api/get_routes", methods=["POST", "OPTIONS"])
    def get_routes():
        """Find up to three distinct routes between two junctions."""
        if request.method == "OPTIONS":
            return "", 204

        data = request.get_json(silent=True) or {}
        source = str(data.get("source", "")).strip()
        destination = str(data.get("destination", "")).strip()

        if not source or not destination:
            return jsonify({"routes": [], "message": "Provide source and destination junction IDs"}), 400

        # Take a live traffic snapshot so route costs reflect current conditions
        snapshot = _take_traffic_snapshot()

        candidates = _find_k_shortest_simple_routes(
            source, destination, k=3,
            max_depth=max(10, len(road_network.junction_ids)),
            snapshot=snapshot,
        )
        if not candidates:
            return jsonify({"routes": []})

        # Pass snapshot + all_routes so each route gets live breakdown & relative recommendation
        shaped = []
        for index, route_payload in enumerate(candidates[:3]):
            shaped.append(_route_to_frontend_shape(
                route_payload, rank=index + 1,
                snapshot=snapshot, all_routes=None,  # filled after shaping
            ))
        # Re-generate recommendations now that we have all shaped routes
        for i, r in enumerate(shaped):
            r["recommendation"] = _generate_recommendation(
                rank=i + 1, total_cost=r["total_cost"],
                total_delay=r["congestion_delay"],
                signal_delay=sum(dr.get("signal_delay", 0) for dr in r.get("delay_reasons", [])),
                traffic_delay=sum(dr.get("traffic_delay", 0) for dr in r.get("delay_reasons", [])),
                green_count=r.get("signals_summary", {}).get("green", 0),
                red_count=r.get("signals_summary", {}).get("red", 0),
                num_junctions=r.get("num_junctions", 0),
                all_routes=shaped,
            )
        return jsonify({"routes": shaped})

    @app.route("/api/optimize_signals", methods=["POST"])
    def optimize_signals():
        """
        Optimize traffic signals for a junction.

        Input JSON:
            {
                "junction_id": "J1",
                "lane_analysis": {
                    "lane_0": {"count": 12, "density": "MEDIUM"},
                    "lane_1": {"count": 30, "density": "HIGH"}
                }
            }

        Returns signal timings, cycle time, and updated network cost.
        """
        data = request.get_json(silent=True) or {}
        junction_id = data.get("junction_id")
        lane_analysis = data.get("lane_analysis")

        if not junction_id or not lane_analysis:
            return jsonify({"status": "error", "message": "Provide junction_id and lane_analysis"}), 400

        junction_id = str(junction_id)
        if junction_id not in road_network.junction_ids:
            return jsonify({"status": "error", "message": f"Junction {junction_id} not found"}), 404

        if isinstance(lane_analysis, list):
            total_pcu = sum(float(item.get("vehicle_count", 0) or 0.0) for item in lane_analysis)
        else:
            total_pcu = sum(float(item.get("count", 0) or 0.0) for item in lane_analysis.values())

        metrics = {
            "density": _derive_density_from_pcu(total_pcu),
            "vehicle_count": total_pcu,
            "total_pcu": total_pcu,
            "updated_at": time.time(),
        }
        plan = _apply_autonomous_signal_plan(junction_id, metrics)

        return jsonify({
            "status": "success",
            **_json_safe(plan),
        })

    @app.route("/api/network_status", methods=["GET"])
    def network_status():
        """Return current road network status (junction costs, topology)."""
        status = road_network.get_network_status()
        return jsonify({"status": "success", "network": status})

    @app.route("/api/roads", methods=["GET"])
    def get_roads():
        """Return all roads from map_region.json."""
        map_store.load()
        roads = map_store.get_roads()
        return jsonify({"status": "success", "roads": roads, "total": len(roads)})

    @app.route("/api/junction_signals", methods=["GET"])
    def get_junction_signals():
        """Return current autonomous signal plans + per-road traffic data for all junctions."""
        _refresh_due_signal_plans()

        # Build per-junction per-road response
        per_junction = {}
        now = time.time()
        for j_id in road_network.junction_ids:
            j_roads = traffic_state.get_junction_roads(j_id)
            sig_timing = traffic_state.get_junction_signal_timing(j_id)
            roads_data = {}
            total_pcu = 0.0
            wait_times = sig_timing.get("wait_times", {})
            if j_roads:
                for road_id in j_roads.get("incoming_roads", []):
                    state = traffic_state.get_road_state(road_id) or {}
                    pcu = float(state.get("pcu", 0))
                    total_pcu += pcu
                    roads_data[road_id] = {
                        "pcu": round(pcu, 1),
                        "density": state.get("density", "LOW"),
                        "source": state.get("source", "baseline"),
                        "queue": round(float(state.get("queue", 0)), 1),
                        "vehicles": state.get("vehicles", 0),
                        "signal": state.get("signal", "RED"),
                        "wait_time": round(wait_times.get(road_id, 0), 0),
                    }
            density_level = _derive_density_from_pcu(total_pcu)
            green_since = sig_timing.get("green_since", now)
            green_duration = sig_timing.get("green_duration", 15)
            remaining = max(0, round(green_duration - (now - green_since)))
            per_junction[j_id] = {
                "density_level": density_level,
                "total_pcu": round(total_pcu, 1),
                "active_green_road": sig_timing.get("active_green_road", ""),
                "green_duration": round(green_duration),
                "time_remaining": remaining,
                "roads": roads_data,
            }

        return jsonify({
            "status": "success",
            "junctions": per_junction,
            "junction_signal_timings": _json_safe(junction_signal_timings),
            "junction_signal_history": _json_safe(junction_signal_history),
            "total": len(junction_signal_timings),
        })

    @app.route("/api/junction_signals/<junction_id>", methods=["GET"])
    def get_junction_signal_detail(junction_id):
        """Return the current autonomous signal plan for a specific junction."""
        _refresh_due_signal_plans()
        plan = junction_signal_history.get(junction_id)
        if not plan:
            return jsonify({"status": "error", "message": f"No signal data for {junction_id}"}), 404
        return jsonify({"status": "success", **_json_safe(plan)})

    @app.route("/api/junction_signals/<junction_id>/schedule", methods=["GET"])
    def get_junction_signal_schedule(junction_id):
        """Return current/next autonomous timing metadata for admin map polling."""
        _refresh_due_signal_plans()
        plan = junction_signal_history.get(junction_id)
        if not plan:
            return jsonify({"status": "error", "message": f"No signal schedule for {junction_id}"}), 404

        return jsonify({
            "status": "success",
            "junction_id": junction_id,
            "mode": plan.get("mode"),
            "total_pcu": plan.get("total_pcu"),
            "density_level": plan.get("density_level"),
            "green_duration": plan.get("green_duration"),
            "cycle_time": plan.get("cycle_time"),
            "effective_from": plan.get("effective_from"),
            "next_refresh_at": plan.get("next_refresh_at"),
            "signal_timings": _json_safe(plan.get("signal_timings", {})),
        })

    @app.route("/api/v1/density_status", methods=["GET"])
    def density_status():
        """Return current density/signal state for all junctions."""
        result = {}
        for j_id in road_network.junction_ids:
            cost_data = road_network.junction_costs.get(j_id)
            signal_data = junction_signal_timings.get(j_id)
            result[j_id] = {
                "junction_id": j_id,
                "name": road_network.get_junction_name(j_id),
                "has_data": cost_data is not None,
                "traffic_delay": cost_data["traffic_delay"] if cost_data else None,
                "signal_wait": cost_data["signal_wait"] if cost_data else None,
                "total_cost": cost_data["total_cost"] if cost_data else None,
                "last_update": cost_data["timestamp"] if cost_data else None,
                "signal_timings": _json_safe(signal_data) if signal_data else None,
                "signal_plan": _json_safe(junction_signal_history.get(j_id)) if junction_signal_history.get(j_id) else None,
            }
        return jsonify({"status": "success", "junctions": result})

    # ─────────────────────────────────────────────────
    # Phase 7: Traffic State + Pressure-Based APIs
    # ─────────────────────────────────────────────────

    @app.route("/api/traffic_state", methods=["GET"])
    def get_traffic_state():
        """Return per-road traffic state for the entire network."""
        states = traffic_state.get_all_states()
        summary = traffic_state.get_summary()
        return jsonify({
            "status": "success",
            "road_states": _json_safe(states),
            "summary": summary,
        })

    @app.route("/api/traffic_state/<road_id>", methods=["GET"])
    def get_road_traffic_state(road_id):
        """Return traffic state for a single road."""
        state = traffic_state.get_road_state(road_id)
        if not state:
            return jsonify({"status": "error", "message": f"No state for road {road_id}"}), 404
        return jsonify({"status": "success", "road_id": road_id, **_json_safe(state)})

    @app.route("/api/junction_traffic/<junction_id>", methods=["GET"])
    def get_junction_traffic(junction_id):
        """Return incoming/outgoing PCU + signal plan for a junction."""
        incoming_pcu = traffic_state.get_junction_incoming_pcu(junction_id)
        outgoing_pcu = traffic_state.get_junction_outgoing_pcu(junction_id)
        delay = traffic_state.compute_junction_delay(junction_id)
        plan = junction_signal_history.get(junction_id)

        # Build per-road detail
        road_details = {}
        for road_id, pcu in {**incoming_pcu, **outgoing_pcu}.items():
            state = traffic_state.get_road_state(road_id) or {}
            meta = traffic_state.get_road_meta(road_id) or {}
            road_details[road_id] = {
                "pcu": pcu,
                "density": state.get("density", "LOW"),
                "vehicles": state.get("vehicles", 0),
                "queue": state.get("queue", 0),
                "source": state.get("source", "unknown"),
                "name": meta.get("road_name", road_id),
                "from_junction": meta.get("from_junction"),
                "to_junction": meta.get("to_junction"),
            }

        return jsonify({
            "status": "success",
            "junction_id": junction_id,
            "incoming_pcu": _json_safe(incoming_pcu),
            "outgoing_pcu": _json_safe(outgoing_pcu),
            "junction_delay": delay,
            "road_details": _json_safe(road_details),
            "signal_plan": _json_safe(plan) if plan else None,
        })

    @app.route("/")
    def index():
        return render_template("index.html")

    return app


if __name__ == "__main__":
    app = create_app()
    map_store.load()
    print("\n" + "="*60)
    print("PHASE 1 VERIFICATION: Digital Map Loaded")
    print("="*60)
    map_store.print_map_summary()
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
