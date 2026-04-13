"""Shared schemas (lightweight placeholders for Phase 0)."""
from typing import List, Dict, Any

# Simple dict-based placeholders; will refine with pydantic later
MapDTO = Dict[str, Any]
JunctionDTO = Dict[str, Any]
RoadDTO = Dict[str, Any]
SignalPhaseDTO = Dict[str, Any]
RouteRequestDTO = Dict[str, Any]
RouteResponseDTO = Dict[str, Any]
