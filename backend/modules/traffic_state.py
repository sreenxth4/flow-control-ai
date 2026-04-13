"""
Traffic State Module — Per-Road Traffic State Store
====================================================
Maintains live PCU, queue, density, and vehicle count for every road
in the network. Supports hybrid model: video-measured roads + baseline
mock traffic for non-observed roads + local propagation.

Key formulas:
  PCU = 1.0*cars + 0.5*bikes + 2.5*trucks + 3.0*buses
  density = LOW (<10 PCU) | MEDIUM (10-20) | HIGH (>=20)
  queue_new = queue_old + arrivals - departures
  capacity = green_time * DISCHARGE_RATE_PER_LANE * get_effective_lane_count(road)
  vehicles_passed = min(queue, capacity)
  delay = queue * DELAY_ALPHA
"""

import time
import random
import threading
from typing import Dict, List, Optional, Any


class TrafficState:
    """Per-road traffic state store for the entire network."""

    # Density thresholds (PCU-based) with hysteresis buffer
    # To ENTER a higher state: must cross the HIGH threshold
    # To LEAVE a higher state: must drop below the LOW threshold
    DENSITY_LOW_MAX = 10        # < 10 = LOW
    DENSITY_MEDIUM_MAX = 20     # < 20 = MEDIUM, >= 20 = HIGH
    DENSITY_HYSTERESIS = 2      # 2 PCU buffer to prevent flicker

    # Discharge model constants
    DISCHARGE_RATE_PER_LANE = 1.0   # vehicles (PCU) passing per second per green lane
    MAX_EFFECTIVE_LANES = 2
    DELAY_ALPHA = 2.0               # seconds per queued vehicle

    # Continuous flow model constants
    VIDEO_DISCHARGE_FACTOR = 0.4    # video roads discharge at 40% rate
    VIDEO_SOURCE_DECAY_SECONDS = 120  # video source → propagated after 2 min
    DEFAULT_GREEN_TIME = 30         # fallback green time if no signal history
    BASELINE_ARRIVAL_RATE = 0.8     # PCU added per tick per road (background traffic)

    # Adaptive signal model constants
    MIN_GREEN = 15              # base minimum green duration (seconds)
    MIN_GREEN_CAP = 25          # max that min_green can scale to under congestion
    MIN_GREEN_SCALE = 5         # extra min_green seconds per 1.0 congestion factor
    MAX_GREEN_BASE = 45         # base max green (at normal traffic)
    MAX_GREEN_CAP = 75          # absolute max green (at extreme congestion)
    LOW_TRAFFIC_MAX = 20        # max green when junction is nearly empty (<10 PCU)
    LOW_TRAFFIC_THRESHOLD = 10  # PCU below which low traffic override applies
    CONGESTION_THRESHOLD = 60   # PCU level at which scaling kicks in
    CONGESTION_SCALE = 20       # extra green seconds per 1.0 congestion factor (softer curve)
    CONGESTION_CLAMP = 1.5      # max congestion factor (caps at 1.5× threshold)
    STARVATION_WAIT = 60        # if any road waits this long, cap green to prevent starvation
    STARVATION_CAP = 50         # max green when starvation protection triggers
    WAIT_BOOST = 0.6            # score bonus per second of waiting
    SWITCH_THRESHOLD = 1.1      # only switch if challenger > current × 1.1
    CYCLE_BASE = 60             # base cycle length for proportional green

    # Propagation damping: 30% of vehicles "exit" the network (reach destinations)
    # Without this, traffic grows unrealistically across cycles
    PROPAGATION_DAMPING = 0.7

    # Baseline mock traffic ranges
    BASELINE_RANGES = {
        "LOW": (5, 12),
        "MEDIUM": (12, 25),
        "HIGH": (25, 45),
    }

    def __init__(self):
        self._lock = threading.Lock()
        # road_id -> {pcu, queue, vehicles, density, last_update, source, signal}
        self._road_states: Dict[str, Dict[str, Any]] = {}
        # road_id -> {from_junction, to_junction, lanes, length_m, speed_limit}
        self._road_meta: Dict[str, Dict[str, Any]] = {}
        # junction_id -> {incoming_roads, outgoing_roads}
        self._junction_roads: Dict[str, Dict[str, List[str]]] = {}
        # junction_id -> {active_green_road, green_since}
        self._junction_signals: Dict[str, Dict[str, Any]] = {}

    # ──────────────────────────────────────────────
    # Initialization
    # ──────────────────────────────────────────────

    def initialize_from_map(self, map_data: dict) -> None:
        """Load road metadata from map_region.json and set baseline traffic."""
        with self._lock:
            # Build road metadata index
            for road in map_data.get("roads", []):
                road_id = road["id"]
                self._road_meta[road_id] = {
                    "from_junction": road["from_junction"],
                    "to_junction": road["to_junction"],
                    "lanes": road.get("lanes", 2),
                    "length_m": road.get("length_meters", 300),
                    "speed_limit": road.get("speed_limit", 40),
                }

            # Build junction -> roads index
            for junction in map_data.get("junctions", []):
                j_id = junction["id"]
                self._junction_roads[j_id] = {
                    "incoming_roads": junction.get("incoming_roads", []),
                    "outgoing_roads": junction.get("outgoing_roads", []),
                }

            # Initialize baseline traffic for every road
            self._initialize_baseline()

        # Initialize junction signals (outside lock — calls methods that lock)
        self._initialize_junction_signals()

    def _initialize_baseline(self) -> None:
        """Assign random baseline traffic to all roads (simulates background traffic)."""
        density_choices = ["MEDIUM", "HIGH"]  # Keep baseline moderate to high
        for road_id in self._road_meta:
            level = random.choice(density_choices)
            lo, hi = self.BASELINE_RANGES[level]
            pcu = random.randint(lo, hi)
            self._road_states[road_id] = {
                "pcu": float(pcu),
                "queue": float(pcu),
                "vehicles": pcu,
                "density": self.classify_density(pcu),
                "last_update": time.time(),
                "source": "baseline",
                "signal": "RED",  # default; will be set by _initialize_junction_signals
            }

    def _initialize_junction_signals(self) -> None:
        """Assign initial GREEN to the highest-PCU road at each junction.
        Initializes wait_times and adaptive green_duration."""
        now = time.time()
        for j_id, j_data in self._junction_roads.items():
            incoming = j_data.get("incoming_roads", [])
            if not incoming:
                continue

            # Pick road with highest PCU for initial green
            best_road = max(
                incoming,
                key=lambda r: self._road_states.get(r, {}).get("pcu", 0)
            )

            # Compute initial green duration from PCU share
            total_pcu = sum(
                self._road_states.get(r, {}).get("pcu", 0) for r in incoming
            )
            share = (
                self._road_states.get(best_road, {}).get("pcu", 0) / total_pcu
                if total_pcu > 0 else 1.0 / max(1, len(incoming))
            )

            # Dynamic congestion-based green scaling (same formula as update_junction_signals)
            congestion = total_pcu / self.CONGESTION_THRESHOLD if self.CONGESTION_THRESHOLD > 0 else 1.0
            congestion = min(self.CONGESTION_CLAMP, congestion)

            # Dynamic max_green: softer curve
            dynamic_max_green = self.MAX_GREEN_BASE + max(0.0, (congestion - 1.0)) * self.CONGESTION_SCALE
            dynamic_max_green = min(self.MAX_GREEN_CAP, dynamic_max_green)

            # Low traffic override: don't waste time on empty junctions
            if total_pcu < self.LOW_TRAFFIC_THRESHOLD:
                dynamic_max_green = self.LOW_TRAFFIC_MAX

            # Adaptive min_green: scales up under congestion
            dynamic_min_green = self.MIN_GREEN + max(0.0, (congestion - 1.0)) * self.MIN_GREEN_SCALE
            dynamic_min_green = min(self.MIN_GREEN_CAP, dynamic_min_green)

            green_dur = max(
                dynamic_min_green,
                min(dynamic_max_green, dynamic_min_green + share * (dynamic_max_green - dynamic_min_green))
            )

            # Initialize wait_starts (epoch when queue formed)
            self._junction_signals[j_id] = {
                "active_green_road": best_road,
                "green_since": now,
                "green_duration": green_dur,
                "wait_starts": {},  # road_id -> epoch float
            }

            # Set signal field on all roads
            with self._lock:
                for r_id in incoming:
                    if r_id in self._road_states:
                        self._road_states[r_id]["signal"] = (
                            "GREEN" if r_id == best_road else "RED"
                        )

    # ──────────────────────────────────────────────
    # Adaptive Signal Control
    # ──────────────────────────────────────────────

    def update_junction_signals(self) -> None:
        """Adaptive signal control: decides GREEN/RED per junction every tick.
        
        Logic per junction:
        1. If current green's duration hasn't elapsed → keep it, update wait_times
        2. If elapsed → compute pressure = incoming_pcu - avg_outgoing_pcu
        3. Score = pressure + (wait_time × WAIT_BOOST)
        4. Apply switching threshold: only switch if challenger > current × 1.1
        5. Winner gets adaptive green_duration with base bias, clamped 15-45s
        6. Winner wait_time resets to 0, others increment by 5
        """
        now = time.time()
        for j_id, j_data in self._junction_roads.items():
            incoming = j_data.get("incoming_roads", [])
            outgoing = j_data.get("outgoing_roads", [])
            if not incoming:
                continue

            sig = self._junction_signals.get(j_id)
            if not sig:
                sig = {
                    "active_green_road": incoming[0],
                    "green_since": now,
                    "green_duration": self.MIN_GREEN,
                    "wait_starts": {},
                }
                self._junction_signals[j_id] = sig

            current_green = sig["active_green_road"]
            elapsed = now - sig["green_since"]
            green_dur = sig.get("green_duration", self.MIN_GREEN)
            wait_starts = sig.get("wait_starts", {})

            # Update wait_starts based on queue existence
            wait_times = {}
            for r in incoming:
                pcu = self._road_states.get(r, {}).get("pcu", 0.0)
                is_red = (r != current_green)
                if is_red and pcu >= 1.0:
                    # If red and has queue, ensure timer is running
                    if r not in wait_starts:
                        wait_starts[r] = now
                    wait_times[r] = now - wait_starts[r]
                else:
                    # If green or empty, clear timer
                    if r in wait_starts:
                        del wait_starts[r]
                    wait_times[r] = 0.0

            sig["wait_starts"] = wait_starts

            # Compute average outgoing PCU (downstream congestion)
            avg_outgoing_pcu = 0.0
            if outgoing:
                avg_outgoing_pcu = sum(
                    self._road_states.get(r, {}).get("pcu", 0.0)
                    for r in outgoing
                ) / len(outgoing)

            if elapsed < green_dur:
                # ── HOLD current green ──
                pass # wait_starts already updated above
            else:
                # ── RE-EVALUATE: pick best road ──
                # Pressure = incoming_pcu - avg_outgoing_pcu (gridlock prevention)
                # Score = pressure + (wait_time × boost)
                scores = {}
                for r in incoming:
                    pcu = self._road_states.get(r, {}).get("pcu", 0.0)
                    pressure = max(0.0, pcu - avg_outgoing_pcu)
                    wt = wait_times.get(r, 0.0)
                    # Cap wait to 60s to prevent single-car dominance over dense crowds
                    capped_wait = min(wt, 60.0)
                    scores[r] = pressure + (capped_wait * self.WAIT_BOOST)

                best_road = max(incoming, key=lambda r: scores.get(r, 0))
                current_score = scores.get(current_green, 0)
                best_score = scores.get(best_road, 0)

                # Switching threshold: only switch if significantly better
                should_switch = (
                    best_road != current_green
                    and best_score > current_score * self.SWITCH_THRESHOLD
                )

                if should_switch:
                    current_green = best_road

                # Compute adaptive green_duration with dynamic congestion scaling
                total_pcu = sum(
                    self._road_states.get(r, {}).get("pcu", 0) for r in incoming
                )
                winner_pcu = self._road_states.get(current_green, {}).get("pcu", 0)
                share = winner_pcu / total_pcu if total_pcu > 0 else 1.0 / max(1, len(incoming))

                # Dynamic max_green: softer curve scaling with congestion
                # At total_pcu ≤ 60 → max_green = 45
                # At total_pcu = 90 → max_green ≈ 55
                # At total_pcu ≥ 120 → max_green ≈ 65 (capped at 75)
                congestion = total_pcu / self.CONGESTION_THRESHOLD if self.CONGESTION_THRESHOLD > 0 else 1.0
                congestion = min(self.CONGESTION_CLAMP, congestion)
                dynamic_max_green = self.MAX_GREEN_BASE + max(0.0, (congestion - 1.0)) * self.CONGESTION_SCALE
                dynamic_max_green = min(self.MAX_GREEN_CAP, dynamic_max_green)

                # Low traffic override: don't waste time on empty junctions
                if total_pcu < self.LOW_TRAFFIC_THRESHOLD:
                    dynamic_max_green = self.LOW_TRAFFIC_MAX

                # Fairness protection: if ANY road has waited > 60s, cap green
                # to prevent starvation of waiting roads
                max_wait = max((wait_times.get(r, 0.0) for r in incoming), default=0.0)
                if max_wait > self.STARVATION_WAIT:
                    dynamic_max_green = min(dynamic_max_green, self.STARVATION_CAP)

                # Adaptive min_green: scales up under congestion
                dynamic_min_green = self.MIN_GREEN + max(0.0, (congestion - 1.0)) * self.MIN_GREEN_SCALE
                dynamic_min_green = min(self.MIN_GREEN_CAP, dynamic_min_green)

                new_green_dur = max(
                    dynamic_min_green,
                    min(dynamic_max_green, dynamic_min_green + share * (dynamic_max_green - dynamic_min_green))
                )

                # Record new signal state
                sig["active_green_road"] = current_green
                sig["green_since"] = now
                sig["green_duration"] = new_green_dur

                # Update wait_starts for the new winner/losers instantly
                for r in incoming:
                    if r == current_green:
                        if r in wait_starts: del wait_starts[r]
                    else:
                        pcu = self._road_states.get(r, {}).get("pcu", 0.0)
                        if pcu >= 1.0 and r not in wait_starts:
                            wait_starts[r] = now
                            
                sig["wait_starts"] = wait_starts

            # Apply signal states to all incoming roads
            with self._lock:
                for r_id in incoming:
                    if r_id in self._road_states:
                        self._road_states[r_id]["signal"] = (
                            "GREEN" if r_id == current_green else "RED"
                        )

    def get_road_signal(self, road_id: str) -> str:
        """Get the signal state (GREEN/RED) for a specific road."""
        state = self._road_states.get(road_id, {})
        return state.get("signal", "RED")

    def get_junction_signal_map(self, junction_id: str) -> dict:
        """Get signal map for a junction: {road_id: GREEN/RED}."""
        j_data = self._junction_roads.get(junction_id, {})
        incoming = j_data.get("incoming_roads", [])
        return {r: self.get_road_signal(r) for r in incoming}

    def get_junction_signal_timing(self, junction_id: str) -> dict:
        """Get adaptive signal timing for a junction (for API/frontend).
        
        Returns: {
            active_green_road: str,
            green_since: float (epoch),
            green_duration: float (seconds),
            wait_times: {road_id: float}
        }
        """
        now = time.time()
        sig = self._junction_signals.get(junction_id, {})
        wait_starts = sig.get("wait_starts", {})
        
        # Calculate live wait times on the fly for API serialization
        live_wait_times = {}
        for r, start_epoch in wait_starts.items():
            live_wait_times[r] = round(now - start_epoch, 1)

        return {
            "active_green_road": sig.get("active_green_road", ""),
            "green_since": sig.get("green_since", 0),
            "green_duration": sig.get("green_duration", self.MIN_GREEN),
            "wait_times": live_wait_times,
        }

    # ──────────────────────────────────────────────
    # State Updates
    # ──────────────────────────────────────────────

    def update_road_from_detection(self, road_id: str, pcu: float, vehicles: int) -> None:
        """Update a road's state from video detection results.
        Preserves the current signal state (GREEN/RED) assigned by junction control."""
        with self._lock:
            # Preserve existing signal if road already has one
            existing_signal = self._road_states.get(road_id, {}).get("signal", "RED")
            self._road_states[road_id] = {
                "pcu": float(pcu),
                "queue": float(pcu),
                "vehicles": int(vehicles),
                "density": self.classify_density(pcu),
                "last_update": time.time(),
                "source": "video",
                "signal": existing_signal,
            }

    def update_road_pcu(self, road_id: str, pcu: float, source: str = "propagation") -> None:
        """Update a road's PCU value (from propagation or other source)."""
        with self._lock:
            existing = self._road_states.get(road_id, {})
            self._road_states[road_id] = {
                "pcu": float(pcu),
                "queue": float(pcu),
                "vehicles": int(round(pcu)),
                "density": self.classify_density(pcu),
                "last_update": time.time(),
                "source": source,
            }

    # ──────────────────────────────────────────────
    # Density Classification
    # ──────────────────────────────────────────────

    @staticmethod
    def classify_density(pcu: float, previous: str = "") -> str:
        """PCU -> LOW/MEDIUM/HIGH with hysteresis to prevent flicker.
        
        Without previous state: standard thresholds (10, 20).
        With previous state: uses buffer zone to resist oscillation:
          - To enter HIGH: pcu >= 22  (MEDIUM_MAX + HYSTERESIS)
          - To leave HIGH: pcu < 18   (MEDIUM_MAX - HYSTERESIS)
          - To enter MEDIUM: pcu >= 12 (LOW_MAX + HYSTERESIS)
          - To leave MEDIUM: pcu < 8   (LOW_MAX - HYSTERESIS)
        """
        H = TrafficState.DENSITY_HYSTERESIS
        if not previous:
            # No hysteresis — clean classification
            if pcu < TrafficState.DENSITY_LOW_MAX:
                return "LOW"
            elif pcu < TrafficState.DENSITY_MEDIUM_MAX:
                return "MEDIUM"
            return "HIGH"
        
        # With hysteresis: resist state changes near boundaries
        if previous == "HIGH":
            if pcu < TrafficState.DENSITY_MEDIUM_MAX - H:  # < 18 → drop
                return "MEDIUM" if pcu >= TrafficState.DENSITY_LOW_MAX - H else "LOW"
            return "HIGH"  # stay HIGH (buffer zone)
        elif previous == "MEDIUM":
            if pcu >= TrafficState.DENSITY_MEDIUM_MAX + H:  # >= 22 → promote
                return "HIGH"
            if pcu < TrafficState.DENSITY_LOW_MAX - H:  # < 8 → demote
                return "LOW"
            return "MEDIUM"  # stay MEDIUM (buffer zone)
        else:  # previous == "LOW"
            if pcu >= TrafficState.DENSITY_LOW_MAX + H:  # >= 12 → promote
                return "HIGH" if pcu >= TrafficState.DENSITY_MEDIUM_MAX + H else "MEDIUM"
            return "LOW"  # stay LOW (buffer zone)

    # ──────────────────────────────────────────────
    # Queue + Discharge Model
    # ──────────────────────────────────────────────

    def get_effective_lane_count(self, road_id: str) -> int:
        """
        Internal roads (between junctions) are always treated as exactly 
        2 lanes in the simulation model. External roads use their base value.
        """
        meta = self._road_meta.get(road_id, {})
        from_j = meta.get("from_junction")
        to_j = meta.get("to_junction")
        
        # Internal roads always return 2
        if from_j and to_j:
            return 2
            
        # Fallback to configured value, capped at MAX_EFFECTIVE_LANES
        return min(meta.get("lanes", 2), self.MAX_EFFECTIVE_LANES)

    def compute_discharge(self, road_id: str, green_time: float,
                          discharge_factor: float = 1.0) -> dict:
        """
        Compute how many vehicles can pass during green phase.

        capacity = green_time * DISCHARGE_RATE_PER_LANE * lanes * discharge_factor
        vehicles_passed = min(queue, capacity)
        remaining = queue - vehicles_passed
        """
        lanes = self.get_effective_lane_count(road_id)
        state = self._road_states.get(road_id, {})
        queue = state.get("queue", 0.0)

        capacity = green_time * self.DISCHARGE_RATE_PER_LANE * lanes * discharge_factor
        vehicles_passed = min(queue, capacity)
        remaining = max(0.0, queue - vehicles_passed)

        return {
            "road_id": road_id,
            "queue_before": round(queue, 1),
            "capacity": round(capacity, 1),
            "vehicles_passed": round(vehicles_passed, 1),
            "remaining_queue": round(remaining, 1),
            "green_time": green_time,
            "effective_lanes": lanes,
            "discharge_factor": discharge_factor,
        }

    def apply_discharge(self, road_id: str, green_time: float,
                        discharge_factor: float = 1.0) -> dict:
        """Compute and apply discharge, syncing queue → PCU → density."""
        result = self.compute_discharge(road_id, green_time, discharge_factor)
        with self._lock:
            if road_id in self._road_states:
                remaining = result["remaining_queue"]
                prev_density = self._road_states[road_id].get("density", "")
                self._road_states[road_id]["queue"] = remaining
                self._road_states[road_id]["pcu"] = remaining  # keep PCU synced
                self._road_states[road_id]["vehicles"] = int(round(remaining))
                self._road_states[road_id]["density"] = self.classify_density(remaining, prev_density)
                self._road_states[road_id]["last_discharged"] = result["vehicles_passed"]
        return result

    # ──────────────────────────────────────────────
    # Continuous Flow Model
    # ──────────────────────────────────────────────

    def decay_video_sources(self) -> int:
        """Downgrade video sources to 'propagated' after VIDEO_SOURCE_DECAY_SECONDS.
        Returns number of roads decayed."""
        now = time.time()
        decayed = 0
        with self._lock:
            for road_id, state in self._road_states.items():
                if state.get("source") == "video":
                    age = now - state.get("last_update", now)
                    if age > self.VIDEO_SOURCE_DECAY_SECONDS:
                        state["source"] = "propagated"
                        decayed += 1
        return decayed

    def simulate_baseline_arrivals(self) -> None:
        """Simulate continuous background traffic arriving at all roads.
        
        Adds a small amount of PCU per tick to every non-video road,
        simulating real-world vehicle arrivals. Without this, all roads
        drain to 0 since baseline is only set once at startup.
        
        Video roads are excluded — their data comes from detection.
        """
        arrival = self.BASELINE_ARRIVAL_RATE
        with self._lock:
            for road_id, state in self._road_states.items():
                source = state.get("source", "baseline")
                if source == "video":
                    continue  # video roads get real data, not simulated arrivals
                
                old_pcu = state.get("pcu", 0.0)
                new_pcu = old_pcu + arrival
                prev_density = state.get("density", "")
                state["pcu"] = round(new_pcu, 1)
                state["queue"] = round(new_pcu, 1)
                state["vehicles"] = int(round(new_pcu))
                state["density"] = self.classify_density(new_pcu, prev_density)

    def discharge_all_roads(self, signal_history: dict = None,
                             tick_interval: float = 5.0) -> dict:
        """Discharge only GREEN roads. RED roads keep their queue.
        
        CRITICAL: Scales discharge by (tick_interval / cycle_time) so we only
        discharge the proportional amount for this tick, not the full green phase.
        """
        results = {}
        road_ids = list(self._road_states.keys())

        for road_id in road_ids:
            state = self._road_states.get(road_id, {})
            queue = state.get("queue", 0.0)
            if queue <= 0:
                continue

            # ★ ONLY discharge roads with GREEN signal
            if state.get("signal") != "GREEN":
                continue

            # Determine discharge factor based on source
            source = state.get("source", "baseline")
            factor = self.VIDEO_DISCHARGE_FACTOR if source == "video" else 1.0

            # Determine green time and cycle time from signal history
            green_time = self.DEFAULT_GREEN_TIME
            cycle_time = 90.0  # default cycle
            if signal_history:
                meta = self._road_meta.get(road_id, {})
                to_j = meta.get("to_junction", "")
                j_plan = signal_history.get(to_j, {})
                if isinstance(j_plan, dict):
                    if j_plan.get("green_duration"):
                        green_time = float(j_plan["green_duration"])
                    if j_plan.get("cycle_time"):
                        cycle_time = float(j_plan["cycle_time"])

            # Scale: how much of the green phase falls within this tick?
            effective_green = tick_interval * (green_time / max(cycle_time, 1.0))

            result = self.apply_discharge(road_id, effective_green, factor)
            if result["vehicles_passed"] > 0:
                results[road_id] = result

        return results

    def propagate_all_junctions(self) -> List[dict]:
        """Propagate discharged vehicles from all junctions to outgoing roads.
        Uses last_discharged tracked by apply_discharge."""
        all_updates = []

        for j_id, j_data in self._junction_roads.items():
            incoming = j_data.get("incoming_roads", [])
            outgoing = j_data.get("outgoing_roads", [])
            if not outgoing:
                continue

            # Sum discharged vehicles from all incoming roads
            total_discharged = 0.0
            for r_id in incoming:
                state = self._road_states.get(r_id, {})
                total_discharged += state.get("last_discharged", 0.0)

            if total_discharged <= 0:
                continue

            updates = self.propagate_from_junction(j_id, total_discharged)
            all_updates.extend(updates)

            # Reset last_discharged after propagation
            with self._lock:
                for r_id in incoming:
                    if r_id in self._road_states:
                        self._road_states[r_id]["last_discharged"] = 0.0

        return all_updates

    # ──────────────────────────────────────────────
    # Traffic Propagation
    # ──────────────────────────────────────────────

    def propagate_from_junction(self, junction_id: str, vehicles_passed: float) -> List[dict]:
        """
        Distribute passed vehicles evenly to outgoing roads of a junction.
        Limited to 1-hop (direct outgoing roads only).

        A damping factor (0.7) is applied so ~30% of vehicles "exit" the
        network each cycle (representing vehicles reaching destinations).
        Without damping, traffic grows unrealistically.

        Returns list of updates made.
        """
        j_roads = self._junction_roads.get(junction_id, {})
        outgoing = j_roads.get("outgoing_roads", [])
        if not outgoing or vehicles_passed <= 0:
            return []

        # Apply damping: only 70% of passed vehicles continue to next road
        damped_flow = vehicles_passed * self.PROPAGATION_DAMPING
        flow_per_road = damped_flow / len(outgoing)
        updates = []

        with self._lock:
            for road_id in outgoing:
                if road_id not in self._road_states:
                    continue
                old_pcu = self._road_states[road_id]["pcu"]
                prev_density = self._road_states[road_id].get("density", "")
                new_pcu = old_pcu + flow_per_road
                self._road_states[road_id]["pcu"] = round(new_pcu, 1)
                self._road_states[road_id]["queue"] = round(new_pcu, 1)
                self._road_states[road_id]["vehicles"] = int(round(new_pcu))
                self._road_states[road_id]["density"] = self.classify_density(new_pcu, prev_density)
                self._road_states[road_id]["last_update"] = time.time()
                self._road_states[road_id]["source"] = "propagation"
                updates.append({
                    "road_id": road_id,
                    "added_pcu": round(flow_per_road, 1),
                    "new_pcu": round(new_pcu, 1),
                    "new_density": self._road_states[road_id]["density"],
                })

        return updates

    # ──────────────────────────────────────────────
    # Delay + Cost Calculation
    # ──────────────────────────────────────────────

    def compute_junction_delay(self, junction_id: str) -> float:
        """
        Compute junction delay based on average queue of incoming roads.
        delay = avg_queue × DELAY_ALPHA
        """
        j_roads = self._junction_roads.get(junction_id, {})
        incoming = j_roads.get("incoming_roads", [])
        if not incoming:
            return 0.0

        total_queue = sum(
            self._road_states.get(r, {}).get("queue", 0.0) for r in incoming
        )
        avg_queue = total_queue / len(incoming)
        return round(avg_queue * self.DELAY_ALPHA, 2)

    def compute_road_travel_time(self, road_id: str) -> float:
        """
        Travel time = length_m / (speed_limit_kmh / 3.6)
        Returns travel time in seconds.
        """
        meta = self._road_meta.get(road_id, {})
        length_m = meta.get("length_m", 300)
        speed_kmh = meta.get("speed_limit", 40)
        speed_ms = speed_kmh / 3.6
        if speed_ms <= 0:
            speed_ms = 11.1  # ~40 km/h fallback
        return round(length_m / speed_ms, 2)

    def compute_road_cost(self, road_id: str) -> float:
        """
        Full routing cost: travel_time + junction_delay at destination.
        cost = travel_time + junction_delay
        """
        travel_time = self.compute_road_travel_time(road_id)
        meta = self._road_meta.get(road_id, {})
        dest_junction = meta.get("to_junction")
        delay = self.compute_junction_delay(dest_junction) if dest_junction else 0.0
        return round(travel_time + delay, 2)

    # ──────────────────────────────────────────────
    # Read Accessors
    # ──────────────────────────────────────────────

    def get_road_state(self, road_id: str) -> Optional[dict]:
        """Get state for a single road."""
        return self._road_states.get(road_id)

    def get_road_pcu(self, road_id: str) -> float:
        """Get current PCU for a road."""
        return self._road_states.get(road_id, {}).get("pcu", 0.0)

    def get_road_density(self, road_id: str) -> str:
        """Get current density level for a road."""
        return self._road_states.get(road_id, {}).get("density", "LOW")

    def get_all_states(self) -> Dict[str, dict]:
        """Return full state dict for all roads (for API)."""
        return dict(self._road_states)

    def get_junction_incoming_pcu(self, junction_id: str) -> Dict[str, float]:
        """Get PCU values for all incoming roads at a junction."""
        j_roads = self._junction_roads.get(junction_id, {})
        incoming = j_roads.get("incoming_roads", [])
        return {r: self.get_road_pcu(r) for r in incoming}

    def get_junction_outgoing_pcu(self, junction_id: str) -> Dict[str, float]:
        """Get PCU values for all outgoing roads at a junction."""
        j_roads = self._junction_roads.get(junction_id, {})
        outgoing = j_roads.get("outgoing_roads", [])
        return {r: self.get_road_pcu(r) for r in outgoing}

    def get_junction_roads(self, junction_id: str) -> Optional[dict]:
        """Get incoming/outgoing road lists for a junction."""
        return self._junction_roads.get(junction_id)

    def get_road_meta(self, road_id: str) -> Optional[dict]:
        """Get road metadata (lanes, length, speed)."""
        return self._road_meta.get(road_id)

    def get_summary(self) -> dict:
        """Get summary statistics for monitoring."""
        total = len(self._road_states)
        by_density = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
        by_source = {}
        for state in self._road_states.values():
            d = state.get("density", "LOW")
            by_density[d] = by_density.get(d, 0) + 1
            s = state.get("source", "unknown")
            by_source[s] = by_source.get(s, 0) + 1
        return {
            "total_roads": total,
            "by_density": by_density,
            "by_source": by_source,
            "total_junctions": len(self._junction_roads),
        }
