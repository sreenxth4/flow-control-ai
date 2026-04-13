"""PhaseController: enforces non-conflicting phases and bounds (stub for Phase 0)."""
from typing import Dict, Any


class PhaseController:
    def __init__(self, min_green: int = 10, max_green: int = 60):
        self.min_green = min_green
        self.max_green = max_green

    def sanitize_plan(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        # Phase 0: just clamp greens if provided
        sanitized = {"phases": []}
        for phase in plan.get("phases", []):
            green = phase.get("green", self.min_green)
            green = max(self.min_green, min(self.max_green, green))
            sanitized["phases"].append({**phase, "green": green})
        return sanitized
