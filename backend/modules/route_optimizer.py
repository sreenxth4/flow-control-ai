"""
Route Optimization Module
Implements Dijkstra's algorithm for shortest path computation.
Uses centralized cost model shared across all users.

Adapted for Learning backend: Uses string junction IDs ("J1", "J2", ...).
"""

import heapq
from typing import List, Tuple, Dict
from modules.network_model import RoadNetwork


class RouteOptimizer:
    """
    Computes optimized routes using Dijkstra's algorithm.
    Supports multiple users with shared centralized cost model.
    """

    def __init__(self, network: RoadNetwork):
        """
        Args:
            network: RoadNetwork instance with centralized costs.
        """
        self.network = network

    def dijkstra(self, source: str, destination: str) -> Tuple[List[str], float]:
        """
        Find shortest path using Dijkstra's algorithm.

        Args:
            source: Source junction ID (e.g., "J1")
            destination: Destination junction ID (e.g., "J5")

        Returns:
            Tuple of (path, total_cost)
            - path: List of junction IDs from source to destination
            - total_cost: Cumulative cost
        """
        all_junctions = set(self.network.graph.keys())
        # Also include junctions that only appear as destinations
        for neighbors in self.network.graph.values():
            all_junctions.update(neighbors)

        distances = {j: float("inf") for j in all_junctions}
        distances[source] = 0.0
        previous: Dict[str, str | None] = {j: None for j in all_junctions}
        pq = [(0.0, source)]
        visited = set()

        while pq:
            current_dist, current = heapq.heappop(pq)

            if current in visited:
                continue
            visited.add(current)

            if current == destination:
                break

            for neighbor in self.network.get_neighbors(current):
                if neighbor in visited:
                    continue

                edge_cost = self.network.get_edge_cost(current, neighbor)
                new_distance = current_dist + edge_cost

                if new_distance < distances[neighbor]:
                    distances[neighbor] = new_distance
                    previous[neighbor] = current
                    heapq.heappush(pq, (new_distance, neighbor))

        path = self._reconstruct_path(previous, source, destination)
        total_cost = distances.get(destination, float("inf"))
        return path, total_cost

    def _reconstruct_path(self, previous: Dict, source: str, destination: str) -> List[str]:
        """Reconstruct path from previous-node tracking."""
        path = []
        current: str | None = destination
        while current is not None:
            path.append(current)
            current = previous.get(current)
        path.reverse()

        if not path or path[0] != source:
            return []  # No path found
        return path

    def get_route_details(self, path: List[str], total_cost: float) -> Dict:
        """Get detailed route information including road names and coordinates."""
        if not path:
            return {
                "success": False,
                "message": "No route found",
                "path": [],
                "total_cost": float("inf"),
                "num_junctions": 0,
            }

        segments = []
        for i in range(len(path) - 1):
            from_j = path[i]
            to_j = path[i + 1]
            segment_cost = self.network.get_edge_cost(from_j, to_j)
            road = self.network.get_edge_road(from_j, to_j) or {}
            segments.append({
                "from": from_j,
                "from_name": self.network.get_junction_name(from_j),
                "to": to_j,
                "to_name": self.network.get_junction_name(to_j),
                "cost": round(segment_cost, 2),
                "road_id": road.get("road_id"),
                "road_name": road.get("road_name"),
                "length_m": road.get("length_m"),
                "speed_limit": road.get("speed_limit"),
            })

        # Build coordinate list for map polyline rendering
        coordinates = []
        for j_id in path:
            coords = self.network.get_junction_coords(j_id)
            if coords:
                coordinates.append({
                    "junction_id": j_id,
                    "name": self.network.get_junction_name(j_id),
                    "latitude": coords["latitude"],
                    "longitude": coords["longitude"],
                })

        return {
            "success": True,
            "path": path,
            "path_names": [self.network.get_junction_name(j) for j in path],
            "segments": segments,
            "coordinates": coordinates,
            "total_cost": round(total_cost, 2),
            "num_junctions": len(path),
            "num_segments": len(segments),
        }

    def find_optimal_route(self, source: str, destination: str) -> Dict:
        """
        Complete route optimization pipeline.

        Args:
            source: Source junction ID (e.g., "J1")
            destination: Destination junction ID (e.g., "J5")

        Returns:
            Complete route information.
        """
        valid_ids = set(self.network.junction_ids)

        if source not in valid_ids:
            return {"success": False, "message": f"Invalid source junction: {source}"}

        if destination not in valid_ids:
            return {"success": False, "message": f"Invalid destination junction: {destination}"}

        if source == destination:
            return {"success": False, "message": "Source and destination are the same"}

        path, total_cost = self.dijkstra(source, destination)
        return self.get_route_details(path, total_cost)
