"""MapStore: loads and serves the predefined digital map.
Phase 1: Full implementation with junction/road/phase access.
"""
import json
import os
from typing import Dict, Any, Optional, List


class MapStore:
    """
    Server-side authority for the predefined traffic region.
    Loads junctions (nodes), roads (edges), and signal phase definitions from JSON.
    """
    
    def __init__(self, map_path: str):
        self.map_path = map_path
        self.map_data: Dict[str, Any] = {
            "region_name": "",
            "description": "",
            "junctions": [],
            "roads": [],
            "signal_phases": []
        }
        self._junction_index: Dict[str, Dict[str, Any]] = {}
        self._road_index: Dict[str, Dict[str, Any]] = {}

    def load(self, force: bool = False) -> None:
        """Load map data from JSON file and build indices. Skips if already loaded."""
        if self._junction_index and not force:
            # Already loaded — skip re-reading file on every request
            return

        if not os.path.exists(self.map_path):
            print(f"Warning: Map file not found at {self.map_path}")
            return
        
        with open(self.map_path, "r", encoding="utf-8") as f:
            self.map_data = json.load(f)
        
        # Build fast lookup indices
        self._junction_index = {j["id"]: j for j in self.map_data.get("junctions", [])}
        self._road_index = {r["id"]: r for r in self.map_data.get("roads", [])}
        
        print(f"Loaded map: {self.map_data.get('region_name', 'Unknown')}")
        print(f"  Junctions: {len(self._junction_index)}")
        print(f"  Roads: {len(self._road_index)}")
        print(f"  Signal phases defined for {len(self.map_data.get('signal_phases', []))} junctions")

    def get_map(self) -> Dict[str, Any]:
        """Return the complete map structure."""
        return self.map_data

    def get_junctions(self) -> List[Dict[str, Any]]:
        """Return all junctions."""
        return self.map_data.get("junctions", [])

    def get_junction(self, junction_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific junction by ID."""
        return self._junction_index.get(junction_id)

    def get_roads(self) -> List[Dict[str, Any]]:
        """Return all roads."""
        return self.map_data.get("roads", [])

    def get_road(self, road_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific road by ID."""
        return self._road_index.get(road_id)

    def get_incoming_roads(self, junction_id: str) -> List[Dict[str, Any]]:
        """Get all roads entering a junction."""
        junction = self.get_junction(junction_id)
        if not junction:
            return []
        incoming_ids = junction.get("incoming_roads", [])
        return [self._road_index[rid] for rid in incoming_ids if rid in self._road_index]

    def get_outgoing_roads(self, junction_id: str) -> List[Dict[str, Any]]:
        """Get all roads leaving a junction."""
        junction = self.get_junction(junction_id)
        if not junction:
            return []
        outgoing_ids = junction.get("outgoing_roads", [])
        return [self._road_index[rid] for rid in outgoing_ids if rid in self._road_index]

    def get_signal_phases(self, junction_id: str) -> Optional[Dict[str, Any]]:
        """Get signal phase definition for a junction."""
        for sp in self.map_data.get("signal_phases", []):
            if sp.get("junction_id") == junction_id:
                return sp
        return None

    def print_map_summary(self) -> None:
        """Print a human-readable summary of the map (for Phase 1 verification)."""
        print("\n" + "="*60)
        print(f"Region: {self.map_data.get('region_name', 'Unknown')}")
        print(f"Description: {self.map_data.get('description', 'N/A')}")
        print("="*60)
        
        print("\nJUNCTIONS:")
        for j in self.get_junctions():
            print(f"  {j['id']}: {j['name']} ({j['type']})")
            print(f"    Location: {j['latitude']}, {j['longitude']}")
            print(f"    Incoming roads: {', '.join(j.get('incoming_roads', []))}")
            print(f"    Outgoing roads: {', '.join(j.get('outgoing_roads', []))}")
        
        print("\nROADS:")
        for r in self.get_roads():
            print(f"  {r['id']}: {r['name']}")
            print(f"    {r['from_junction']} → {r['to_junction']} ({r['length_meters']}m, {r['lanes']} lanes)")
        
        print("\nSIGNAL PHASES:")
        for sp in self.map_data.get("signal_phases", []):
            print(f"  Junction {sp['junction_id']}:")
            for phase in sp.get("phases", []):
                print(f"    {phase['phase_id']}: {phase['name']}")
                print(f"      Green roads: {', '.join(phase['green_roads'])}")
                print(f"      Conflicts with: {', '.join(phase['conflicting_phases'])}")
                print(f"      Green time: {phase['min_green']}-{phase['max_green']}s")
        
        print("="*60 + "\n")
