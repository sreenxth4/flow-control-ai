import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";

const COLLAPSED_PEEK_PX = 72;
const HEADER_HEIGHT_PX = 44;

// Minimum px moved before we decide: "this is a drag, not a tap"
const DRAG_THRESHOLD = 8;

interface SnapMetrics {
  collapsed: number;
  half: number;
  full: number;
}

const getViewportHeight = () => {
  if (typeof window === "undefined") {
    return 800;
  }
  return window.visualViewport?.height ?? window.innerHeight;
};

const calculateSnaps = (): SnapMetrics => {
  const vh = Math.max(getViewportHeight(), 1);
  const collapsed = Math.min(16, Math.max(9, (COLLAPSED_PEEK_PX / vh) * 100));
  const half = 50;
  const fullByHeader = ((vh - HEADER_HEIGHT_PX) / vh) * 100;
  const full = Math.min(92, Math.max(72, fullByHeader));
  return { collapsed, half, full };
};

const emitSheetEvent = (name: string, detail: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

type SnapPosition = "collapsed" | "half" | "full";

interface BottomSheetProps {
  children: ReactNode;
  peekLabel?: string;
  peekIcon?: string;
  defaultSnap?: SnapPosition;
  onSnapChange?: (snap: SnapPosition) => void;
}

export function BottomSheet({
  children,
  peekLabel = "Open panel",
  peekIcon = "☰",
  defaultSnap = "collapsed",
  onSnapChange,
}: BottomSheetProps) {
  const [snapMetrics, setSnapMetrics] = useState<SnapMetrics>(() => calculateSnaps());
  const [snapVh, setSnapVh] = useState(() => calculateSnaps()[defaultSnap]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Drag state (refs to avoid re-render cascades during gesture) ──
  const dragging = useRef(false);
  const gestureDecided = useRef(false);  // true once we know: drag or scroll
  const isSheetDrag = useRef(false);     // true = move the sheet; false = let it scroll
  const startY = useRef(0);
  const startVh = useRef(0);
  const lastY = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);           // px/ms for flick detection
  const dragSignalActive = useRef(false);

  // Force re-render only when we commit to dragging

  // ── Helpers ──
  const getSnapName = (vh: number, metrics: SnapMetrics): SnapPosition => {
    const halfPointLow = (metrics.collapsed + metrics.half) / 2;
    const halfPointHigh = (metrics.half + metrics.full) / 2;
    if (vh <= halfPointLow) return "collapsed";
    if (vh >= halfPointHigh) return "full";
    return "half";
  };

  const resolveSnap = useCallback((vh: number, vel: number, metrics: SnapMetrics): number => {
    const snapList = [metrics.collapsed, metrics.half, metrics.full];
    // Velocity-aware snapping: flick up → next higher snap, flick down → next lower
    const flickThreshold = 0.4; // px/ms
    if (vel > flickThreshold) {
      // Flicking UP → go to next snap above current
      for (const s of snapList) {
        if (s > vh + 3) return s;
      }
      return metrics.full;
    }
    if (vel < -flickThreshold) {
      // Flicking DOWN → go to next snap below current
      for (let i = snapList.length - 1; i >= 0; i--) {
        if (snapList[i] < vh - 3) return snapList[i];
      }
      return metrics.collapsed;
    }
    // No flick → nearest snap
    let closest = snapList[0];
    let minDist = Math.abs(vh - snapList[0]);
    for (const s of snapList) {
      const d = Math.abs(vh - s);
      if (d < minDist) { minDist = d; closest = s; }
    }
    return closest;
  }, []);

  useEffect(() => {
    const syncSnaps = () => {
      setSnapMetrics((prevMetrics) => {
        const nextMetrics = calculateSnaps();
        setSnapVh((currentVh) => {
          const currentSnap = getSnapName(currentVh, prevMetrics);
          return nextMetrics[currentSnap];
        });
        return nextMetrics;
      });
    };

    const vv = window.visualViewport;
    window.addEventListener("resize", syncSnaps, { passive: true });
    window.addEventListener("orientationchange", syncSnaps, { passive: true });
    if (vv) {
      vv.addEventListener("resize", syncSnaps, { passive: true });
      vv.addEventListener("scroll", syncSnaps, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", syncSnaps);
      window.removeEventListener("orientationchange", syncSnaps);
      if (vv) {
        vv.removeEventListener("resize", syncSnaps);
        vv.removeEventListener("scroll", syncSnaps);
      }
    };
  }, []);

  // ── Gesture start (from ANYWHERE on the sheet) ──
  const handlePointerDown = useCallback((clientY: number, fromHeader: boolean) => {
    dragging.current = true;
    gestureDecided.current = false;
    isSheetDrag.current = false;
    startY.current = clientY;
    lastY.current = clientY;
    lastTime.current = Date.now();
    velocity.current = 0;
    startVh.current = snapVh;

    // If touching the header area, immediately decide: this IS a sheet drag
    if (fromHeader) {
      gestureDecided.current = true;
      isSheetDrag.current = true;
      if (!dragSignalActive.current) {
        dragSignalActive.current = true;
        emitSheetEvent("traffic:sheet-drag", { active: true });
      }
    }
  }, [snapVh]);

  const handlePointerMove = useCallback((clientY: number) => {
    if (!dragging.current) return;

    const deltaFromStart = startY.current - clientY; // positive = finger moved UP
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = (lastY.current - clientY) / dt; // positive = up
    }
    lastY.current = clientY;
    lastTime.current = now;

    // ── Decide: sheet drag or scroll? (only once per gesture) ──
    if (!gestureDecided.current) {
      if (Math.abs(deltaFromStart) < DRAG_THRESHOLD) return; // wait for enough movement

      gestureDecided.current = true;
      const scrollEl = scrollRef.current;
      const isAtTop = !scrollEl || scrollEl.scrollTop <= 0;
      const draggingDown = deltaFromStart < 0; // finger going down

      if (draggingDown && isAtTop) {
        // At scroll top + dragging down → collapse the sheet
        isSheetDrag.current = true;
      } else if (!draggingDown && snapVh < snapMetrics.full - 2) {
        // Dragging up but sheet isn't full → expand the sheet first
        isSheetDrag.current = true;
      } else {
        // Let content scroll normally
        isSheetDrag.current = false;
      }

      if (isSheetDrag.current && !dragSignalActive.current) {
        dragSignalActive.current = true;
        emitSheetEvent("traffic:sheet-drag", { active: true });
      }
    }

    if (!isSheetDrag.current) return; // let native scroll handle it

    // ── Move the sheet ──
    const deltaVh = (deltaFromStart / getViewportHeight()) * 100;
    const newVh = Math.max(
      snapMetrics.collapsed,
      Math.min(snapMetrics.full, startVh.current + deltaVh)
    );
    setSnapVh(newVh);
  }, [snapVh, snapMetrics]);

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    if (isSheetDrag.current) {
      const snapped = resolveSnap(snapVh, velocity.current, snapMetrics);
      setSnapVh(snapped);
      const snapName = getSnapName(snapped, snapMetrics);
      onSnapChange?.(snapName);
      emitSheetEvent("traffic:sheet-snap", { snap: snapName, snapVh: snapped });
    }

    if (dragSignalActive.current) {
      dragSignalActive.current = false;
      emitSheetEvent("traffic:sheet-drag", { active: false });
    }

    gestureDecided.current = false;
    isSheetDrag.current = false;
  }, [snapVh, resolveSnap, onSnapChange, snapMetrics]);

  // ── Touch events on the HEADER (always draggable) ──
  const onHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    handlePointerDown(e.touches[0].clientY, true);
  }, [handlePointerDown]);

  // ── Touch events on CONTENT area (smart: drag vs scroll) ──
  const onContentTouchStart = useCallback((e: React.TouchEvent) => {
    handlePointerDown(e.touches[0].clientY, false);
  }, [handlePointerDown]);

  // ── Shared move/end (attached to window for reliability) ──
  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      handlePointerMove(e.touches[0].clientY);
      // Prevent native scroll when we're dragging the sheet
      if (isSheetDrag.current && gestureDecided.current) {
        e.preventDefault();
      }
    };
    const onEnd = () => handlePointerUp();

    // passive: false so we can preventDefault on touch scroll
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [handlePointerMove, handlePointerUp]);

  // ── Mouse support (desktop testing) ──
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handlePointerDown(e.clientY, true);
  }, [handlePointerDown]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => handlePointerMove(e.clientY);
    const onUp = () => handlePointerUp();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // ── Tap on peek bar → toggle collapsed ↔ half ──
  const dragDistanceRef = useRef(0);
  const handlePeekTap = useCallback(() => {
    // Only toggle if it wasn't a real drag
    if (Math.abs(dragDistanceRef.current) > DRAG_THRESHOLD) return;
    if (snapVh <= snapMetrics.collapsed + 3) {
      setSnapVh(snapMetrics.half);
      onSnapChange?.("half");
      emitSheetEvent("traffic:sheet-snap", { snap: "half", snapVh: snapMetrics.half });
    } else {
      setSnapVh(snapMetrics.collapsed);
      onSnapChange?.("collapsed");
      emitSheetEvent("traffic:sheet-snap", { snap: "collapsed", snapVh: snapMetrics.collapsed });
    }
  }, [snapVh, onSnapChange, snapMetrics]);

  // Track drag distance for tap detection
  useEffect(() => {
    dragDistanceRef.current = lastY.current - startY.current;
  });

  const isCollapsed = snapVh <= snapMetrics.collapsed + 3;
  const isDrag = isSheetDrag.current && gestureDecided.current;

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 bg-card rounded-t-2xl shadow-2xl border-t border-border md:hidden"
      style={{
        zIndex: "var(--z-bottom-sheet)",
        height: `calc(var(--app-vh, 100dvh) * ${snapVh / 100})`,
        bottom: "var(--safe-area-inset-bottom)",
        transition: isDrag ? "none" : "height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        willChange: "height",
      }}
    >
      {/* ── HEADER: always draggable ── */}
      <div
        className="flex flex-col items-center cursor-grab active:cursor-grabbing select-none"
        onTouchStart={onHeaderTouchStart}
        onMouseDown={onHeaderMouseDown}
        onClick={handlePeekTap}
        style={{ touchAction: "none" }}
      >
        {/* Drag pill */}
        <div className="pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
        </div>
        {/* Peek label when collapsed */}
        {isCollapsed && (
          <div className="pb-1.5 text-xs font-medium text-foreground flex items-center gap-1.5">
            <span>{peekIcon}</span>
            <span>{peekLabel}</span>
          </div>
        )}
      </div>

      {/* ── CONTENT: scroll OR drag depending on gesture ── */}
      <div
        ref={scrollRef}
        className="overflow-x-hidden overscroll-contain"
        onTouchStart={onContentTouchStart}
        style={{
          height: `calc(100% - ${HEADER_HEIGHT_PX}px)`,
          overflowY: isCollapsed ? "hidden" : "auto",
          WebkitOverflowScrolling: "touch",
          // When sheet is being dragged, disable content scroll
          touchAction: isDrag ? "none" : "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
