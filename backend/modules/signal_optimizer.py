"""
Adaptive traffic signal optimization primitives.

Supports:
  - Legacy density-based timing (LOW/MEDIUM/HIGH → green multiplier)
  - PCU-driven autonomous timing (PCU demand vs reference point)
  - Pressure-based phase optimization (incoming_pcu - outgoing_pcu per phase)

Pressure-based algorithm (simplified Max-Pressure):
  For each phase at a junction:
    phase_pressure = Σ(incoming_road_pcu) - Σ(outgoing_road_pcu)
  Green time is allocated proportional to pressure, clamped to [min_green, max_green].
"""

import time
from typing import Dict, List, Optional


class SignalOptimizer:
    """Signal timing helper for density, PCU, and pressure-based control."""

    def __init__(
        self,
        min_green: int = 10,
        max_green: int = 120,
        default_green: int = 30,
        reference_pcu: float = 30.0,
    ):
        self.min_green = min_green
        self.max_green = max_green
        self.default_green = default_green
        self.reference_pcu = max(1.0, float(reference_pcu))

    def calculate_green_time(self, density: str, base_time: int = None) -> int:
        """
        Calculate green signal duration based on traffic density.

        Args:
            density: Traffic density level ("LOW", "MEDIUM", "HIGH")
            base_time: Base green time (uses default if None)

        Returns:
            Optimized green signal duration in seconds
        """
        if base_time is None:
            base_time = self.default_green

        if density == "LOW":
            green_time = base_time * 0.7
        elif density == "MEDIUM":
            green_time = base_time * 1.0
        elif density == "HIGH":
            green_time = base_time * 1.5
        else:
            green_time = base_time

        green_time = max(self.min_green, min(green_time, self.max_green))
        return int(green_time)

    def optimize_junction_signals(self, lane_analysis: Dict) -> Dict:
        """
        Optimize signal timings for all lanes at a junction.

        Args:
            lane_analysis: {lane_id: {"count": int/float, "density": str}}

        Returns:
            {lane_id: {"green_duration": int, "density": str, "vehicle_count": ..., "timestamp": float}}
        """
        signal_timings = {}

        for lane_id, data in lane_analysis.items():
            density = data["density"]
            green_time = self.calculate_green_time(density)

            signal_timings[lane_id] = {
                "green_duration": green_time,
                "density": density,
                "vehicle_count": data.get("count", 0),
                "timestamp": time.time(),
            }

        return signal_timings

    def calculate_green_time_from_pcu(self, total_pcu: float, reference_pcu: Optional[float] = None) -> int:
        """
        Calculate green duration from numeric PCU demand.

        The default green is the neutral operating point. PCU above the
        reference value extends the green, and lower PCU compresses it.
        """
        ref_pcu = max(1.0, float(reference_pcu or self.reference_pcu))
        pcu = max(0.0, float(total_pcu or 0.0))

        load_delta = (pcu - ref_pcu) / ref_pcu
        proposed_green = self.default_green + (load_delta * self.default_green * 0.5)
        green_time = max(self.min_green, min(self.max_green, proposed_green))
        return int(round(green_time))

    # ──────────────────────────────────────────────────────────
    # PRESSURE-BASED PHASE OPTIMIZATION (Simplified Max-Pressure)
    # ──────────────────────────────────────────────────────────

    def optimize_phases_pressure(
        self,
        junction_id: str,
        phases: List[Dict],
        road_pcu: Dict[str, float],
        incoming_roads: List[str],
        outgoing_roads: List[str],
        cycle_time: int = 120,
    ) -> Dict:
        """
        Pressure-based signal phase optimization.

        For each phase, computes:
          phase_pressure = Σ(pcu of incoming roads in phase) - Σ(pcu of outgoing roads in phase)

        Green time is allocated proportionally to pressure, clamped to
        each phase's [min_green, max_green].

        Args:
            junction_id: Junction ID (e.g., "J3")
            phases: List of phase dicts from signal_phases in map_region.json
                    Each has: phase_id, name, green_roads, min_green, max_green
            road_pcu: Dict mapping road_id -> current PCU value
            incoming_roads: List of incoming road IDs for this junction
            outgoing_roads: List of outgoing road IDs for this junction
            cycle_time: Total cycle time in seconds (default 120)

        Returns:
            Dict with per-phase timings and pressure values:
            {
                "junction_id": str,
                "mode": "pressure",
                "cycle_time": int,
                "total_pressure": float,
                "phases": {
                    phase_id: {
                        "name": str,
                        "green_duration": int,
                        "pressure": float,
                        "incoming_pcu": float,
                        "outgoing_pcu": float,
                    }
                }
            }
        """
        incoming_set = set(incoming_roads)
        outgoing_set = set(outgoing_roads)

        phase_pressures = {}
        phase_details = {}

        for phase in phases:
            phase_id = phase["phase_id"]
            green_roads = phase.get("green_roads", [])

            # Separate green_roads into incoming (demand) and outgoing (downstream)
            phase_incoming = [r for r in green_roads if r in incoming_set]
            phase_outgoing = [r for r in green_roads if r in outgoing_set]

            incoming_pcu = sum(road_pcu.get(r, 0.0) for r in phase_incoming)
            outgoing_pcu = sum(road_pcu.get(r, 0.0) for r in phase_outgoing)

            # Pressure = how badly this direction needs relief
            pressure = max(0.0, incoming_pcu - outgoing_pcu)

            phase_pressures[phase_id] = pressure
            phase_details[phase_id] = {
                "name": phase.get("name", phase_id),
                "incoming_pcu": round(incoming_pcu, 1),
                "outgoing_pcu": round(outgoing_pcu, 1),
                "pressure": round(pressure, 1),
                "min_green": phase.get("min_green", self.min_green),
                "max_green": phase.get("max_green", self.max_green),
                "incoming_roads": phase_incoming,
                "outgoing_roads": phase_outgoing,
            }

        # Total pressure across all phases
        total_pressure = sum(phase_pressures.values())

        # Clearance time: 3 seconds per phase transition
        clearance_time = len(phases) * 3
        available_green = max(0, cycle_time - clearance_time)

        # Allocate green time proportional to pressure
        phase_timings = {}
        for phase_id, details in phase_details.items():
            p_min = details["min_green"]
            p_max = details["max_green"]

            if total_pressure > 0:
                # Proportional allocation: Gi = (Pi / ΣP) × available_green
                raw_green = (phase_pressures[phase_id] / total_pressure) * available_green
            else:
                # Equal split if no pressure difference
                raw_green = available_green / max(1, len(phases))

            # Clamp to phase min/max green
            green_time = int(round(max(p_min, min(p_max, raw_green))))

            phase_timings[phase_id] = {
                "name": details["name"],
                "green_duration": green_time,
                "pressure": details["pressure"],
                "incoming_pcu": details["incoming_pcu"],
                "outgoing_pcu": details["outgoing_pcu"],
                "incoming_roads": details["incoming_roads"],
                "outgoing_roads": details["outgoing_roads"],
            }

        # Compute actual cycle time from allocated greens
        actual_cycle = sum(pt["green_duration"] for pt in phase_timings.values()) + clearance_time

        return {
            "junction_id": junction_id,
            "mode": "pressure",
            "cycle_time": actual_cycle,
            "clearance_time": clearance_time,
            "total_pressure": round(total_pressure, 1),
            "phases": phase_timings,
            "timestamp": time.time(),
        }

    def optimize_autonomous_junction(
        self,
        junction_id: str,
        total_pcu: float,
        interval_seconds: int = 90,
        phases: Optional[List[Dict]] = None,
        road_pcu: Optional[Dict[str, float]] = None,
        incoming_roads: Optional[List[str]] = None,
        outgoing_roads: Optional[List[str]] = None,
    ) -> Dict:
        """
        Create an autonomous schedule payload for a junction.

        If phase and road data are provided, uses pressure-based optimization.
        Otherwise falls back to simple PCU-based timing.
        """
        now = time.time()

        # Try pressure-based optimization if we have phase data
        if phases and road_pcu and incoming_roads and outgoing_roads:
            pressure_result = self.optimize_phases_pressure(
                junction_id=junction_id,
                phases=phases,
                road_pcu=road_pcu,
                incoming_roads=incoming_roads,
                outgoing_roads=outgoing_roads,
                cycle_time=max(interval_seconds, 120),
            )

            # Compute average green duration across phases for backward compatibility
            phase_greens = [p["green_duration"] for p in pressure_result["phases"].values()]
            avg_green = int(round(sum(phase_greens) / max(1, len(phase_greens)))) if phase_greens else self.default_green

            return {
                "junction_id": junction_id,
                "mode": "pressure",
                "total_pcu": round(float(total_pcu or 0.0), 2),
                "green_duration": avg_green,
                "cycle_time": pressure_result["cycle_time"],
                "total_pressure": pressure_result["total_pressure"],
                "phase_timings": pressure_result["phases"],
                "effective_from": now,
                "next_refresh_at": now + int(interval_seconds),
                "timestamp": now,
            }

        # Fallback: simple PCU-based timing
        green_duration = self.calculate_green_time_from_pcu(total_pcu)
        cycle_time = max(int(interval_seconds), green_duration)

        return {
            "junction_id": junction_id,
            "mode": "autonomous_pcu",
            "total_pcu": round(float(total_pcu or 0.0), 2),
            "green_duration": green_duration,
            "cycle_time": cycle_time,
            "effective_from": now,
            "next_refresh_at": now + int(interval_seconds),
            "timestamp": now,
        }

    def get_cycle_time(self, signal_timings: Dict) -> int:
        """
        Calculate total signal cycle time for junction.

        Args:
            signal_timings: Signal timings for all lanes.

        Returns:
            Total cycle time in seconds.
        """
        total_green = sum(t["green_duration"] for t in signal_timings.values())
        # Add yellow and red clearance time (3 seconds per phase)
        clearance_time = len(signal_timings) * 3
        return total_green + clearance_time
