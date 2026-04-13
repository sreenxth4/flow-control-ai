"""
Centralized Road Network and Cost Model Module
Represents junctions as nodes and roads as directed edges.
Maintains global cost table shared across all users.

Adapted for Learning backend: Uses string junction IDs ("J1", "J2", ...)
and loads topology from map_region.json via MapStore.
"""

from typing import Dict, List, Optional
import time
from collections import defaultdict


class RoadNetwork:
    """
    Centralized road network model.
    Maintains junction costs based on traffic and signal delays.
    Uses string-based junction IDs matching map_region.json.
    """

    def __init__(self):
        """Initialize empty road network (call load_from_map to populate)."""
        self.graph: Dict[str, List[str]] = defaultdict(list)  # Adjacency list
        self.junction_costs: Dict[str, Dict] = {}  # Cost per junction
        self.edge_costs: Dict[tuple, float] = {}  # Cost per directed road segment
        self.edge_roads: Dict[tuple, Dict] = {}  # Road metadata per edge
        self.junction_ids: List[str] = []  # Ordered list of junction IDs
        self.junction_info: Dict[str, Dict] = {}  # Junction name/lat/lon
        self.last_update: float = time.time()

    def load_from_map(self, map_data: Dict) -> None:
        """
        Build graph from map_region.json data.

        Args:
            map_data: Full map dict with 'junctions' and 'roads' keys.
        """
        self.graph.clear()
        self.edge_costs.clear()
        self.edge_roads.clear()
        self.junction_info.clear()

        junctions = map_data.get("junctions", [])
        self.junction_ids = [j["id"] for j in junctions]

        for j in junctions:
            self.junction_info[j["id"]] = {
                "name": j.get("name", j["id"]),
                "latitude": j.get("latitude"),
                "longitude": j.get("longitude"),
            }

        for road in map_data.get("roads", []):
            from_j = road["from_junction"]
            to_j = road["to_junction"]
            length_m = road.get("length_meters", 300)
            speed_limit = road.get("speed_limit", 40)
            # Base cost = travel time in seconds at speed limit
            base_cost = (length_m / 1000.0) / (speed_limit / 3600.0)
            self.add_road(
                from_j, to_j,
                base_cost=round(base_cost, 2),
                road_id=road.get("id"),
                road_name=road.get("name"),
                length_m=length_m,
                speed_limit=speed_limit,
                lanes=road.get("lanes", 2),
            )

        self.last_update = time.time()

    def add_road(self, from_junction: str, to_junction: str, base_cost: float = 10.0,
                 road_id: str = None, road_name: str = None,
                 length_m: int = 0, speed_limit: int = 40, lanes: int = 2):
        """
        Add a directed road between two junctions.

        If an edge already exists for this (from, to) pair, keep the one
        with more lanes (higher capacity) so routing uses the best road.
        """
        key = (from_junction, to_junction)
        existing = self.edge_roads.get(key)

        if existing and existing.get("lanes", 0) >= lanes:
            return  # Keep the existing higher-capacity road

        if to_junction not in self.graph[from_junction]:
            self.graph[from_junction].append(to_junction)

        self.edge_costs[key] = base_cost
        self.edge_roads[key] = {
            "road_id": road_id,
            "road_name": road_name,
            "length_m": length_m,
            "speed_limit": speed_limit,
            "lanes": lanes,
        }

    def update_junction_cost(self, junction_id: str, traffic_delay: float, signal_wait: float):
        """
        Update cost for a specific junction.
        Only applies to known junctions in the network.
        """
        if junction_id not in self.junction_info:
            return  # Silently skip unknown junction IDs (e.g. camera names)

        total_cost = traffic_delay + signal_wait
        self.junction_costs[junction_id] = {
            "traffic_delay": traffic_delay,
            "signal_wait": signal_wait,
            "total_cost": total_cost,
            "timestamp": time.time(),
        }
        self.last_update = time.time()

    def get_edge_cost(self, from_junction: str, to_junction: str) -> float:
        """Total cost = base road cost + average of endpoint junction costs."""
        base_cost = self.edge_costs.get((from_junction, to_junction), float("inf"))
        if base_cost == float("inf"):
            return float("inf")

        from_cost = self.junction_costs.get(from_junction, {}).get("total_cost", 0)
        to_cost = self.junction_costs.get(to_junction, {}).get("total_cost", 0)
        return base_cost + (from_cost + to_cost) / 2

    def get_edge_cost_breakdown(self, from_junction: str, to_junction: str,
                                 snapshot: dict) -> Optional[Dict]:
        """
        Compute detailed cost breakdown for an edge using live traffic snapshot.

        Args:
            from_junction: Source junction ID
            to_junction: Destination junction ID
            snapshot: Traffic snapshot with 'roads' and 'signals' keys

        Returns:
            Dict with base_time, traffic_delay, signal_delay, queue_delay,
            congestion_penalty, total, signal_status, pcu, road_name.
            None if edge doesn't exist.
        """
        key = (from_junction, to_junction)
        base_cost = self.edge_costs.get(key)
        if base_cost is None:
            return None

        road_meta = self.edge_roads.get(key, {})
        road_id = road_meta.get("road_id", "")
        road_name = road_meta.get("road_name") or "Unknown Road"

        road_states = snapshot.get("roads", {})
        signals = snapshot.get("signals", {})

        # Get live road state
        road_state = road_states.get(road_id, {}) if road_id else {}
        pcu = float(road_state.get("pcu", 0))
        queue = float(road_state.get("queue", 0))
        signal = road_state.get("signal", "RED")

        # Traffic delay: scales with PCU (congestion)
        # More vehicles = slower travel
        traffic_delay = 0.0
        if pcu > 5:
            traffic_delay = min(pcu * 0.8, 40.0)  # up to 40s delay at high PCU

        # Signal delay: RED signals add expected wait time
        signal_delay = 0.0
        signal_status = signal
        if signal == "RED":
            # Use junction signal timing to estimate wait
            j_signals = signals.get(to_junction, {})
            green_dur = j_signals.get("green_duration", 15)
            time_remaining = j_signals.get("time_remaining", 0)
            # Roads data may have per-road wait times
            roads_data = j_signals.get("roads", {})
            if road_id and road_id in roads_data:
                wait_time = roads_data[road_id].get("wait_time", 0)
                signal_delay = min(float(wait_time), green_dur)
            else:
                # Average expected wait = half the cycle for non-green
                signal_delay = green_dur * 0.5
        else:
            signal_status = "GREEN"

        # Queue delay: more queued vehicles = longer wait
        queue_delay = 0.0
        if queue > 3:
            queue_delay = min(queue * 0.5, 25.0)

        # Congestion penalty: extra penalty for HIGH density roads
        congestion_penalty = 0.0
        density = road_state.get("density", "LOW")
        if density == "HIGH":
            congestion_penalty = 15.0
        elif density == "MEDIUM":
            congestion_penalty = 5.0

        total = base_cost + traffic_delay + signal_delay + queue_delay + congestion_penalty

        return {
            "base_time": round(base_cost, 1),
            "traffic_delay": round(traffic_delay, 1),
            "signal_delay": round(signal_delay, 1),
            "queue_delay": round(queue_delay, 1),
            "congestion_penalty": round(congestion_penalty, 1),
            "total": round(total, 1),
            "signal_status": signal_status,
            "pcu": round(pcu, 1),
            "road_name": road_name,
        }

    def get_live_edge_cost(self, from_junction: str, to_junction: str,
                           snapshot: dict) -> float:
        """
        Get edge cost incorporating live traffic data for pathfinding.

        Uses the full breakdown but returns a single float for Dijkstra/DFS.
        Falls back to static cost if snapshot has no data for this edge.
        """
        breakdown = self.get_edge_cost_breakdown(from_junction, to_junction, snapshot)
        if breakdown:
            return breakdown["total"]
        return self.get_edge_cost(from_junction, to_junction)

    def get_edge_road(self, from_junction: str, to_junction: str) -> Optional[Dict]:
        """Get road metadata for an edge."""
        return self.edge_roads.get((from_junction, to_junction))

    def get_neighbors(self, junction_id: str) -> List[str]:
        """Get all neighboring junctions reachable from junction_id."""
        return self.graph.get(junction_id, [])

    def estimate_traffic_delay(self, density: str) -> float:
        """Estimate traffic delay based on density level (seconds)."""
        delay_map = {"LOW": 5.0, "MEDIUM": 15.0, "HIGH": 30.0}
        return delay_map.get(density, 10.0)

    def estimate_signal_wait(self, green_duration: float, cycle_time: float) -> float:
        """Estimate average signal wait time (seconds)."""
        red_time = cycle_time - green_duration
        return max(0, red_time / 2)

    def get_junction_name(self, junction_id: str) -> str:
        """Get human-readable junction name."""
        return self.junction_info.get(junction_id, {}).get("name", junction_id)

    def get_junction_coords(self, junction_id: str) -> Optional[Dict]:
        """Get junction lat/lon."""
        info = self.junction_info.get(junction_id)
        if info:
            return {"latitude": info["latitude"], "longitude": info["longitude"]}
        return None

    def get_network_status(self) -> Dict:
        """Get complete network status."""
        return {
            "num_junctions": len(self.junction_ids),
            "junction_ids": self.junction_ids,
            "junction_costs": self.junction_costs,
            "last_update": self.last_update,
            "num_roads": sum(len(neighbors) for neighbors in self.graph.values()),
        }
