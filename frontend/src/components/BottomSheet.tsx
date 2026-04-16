import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";

// ─── Snap positions (percentage of viewport height) ───
const SNAP_COLLAPSED = 7;   // ~60px peek
const SNAP_HALF = 50;       // half screen
const SNAP_FULL = 85;       // near full screen
const SNAPS = [SNAP_COLLAPSED, SNAP_HALF, SNAP_FULL];

// Minimum px moved before we decide: "this is a drag, not a tap"
const DRAG_THRESHOLD = 8;

type SnapPosition = "collapsed" | "half" | "full";
const SNAP_MAP: Record<SnapPosition, number> = {
  collapsed: SNAP_COLLAPSED,
  half: SNAP_HALF,
  full: SNAP_FULL,
};

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
  const [snapVh, setSnapVh] = useState(SNAP_MAP[defaultSnap]);
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

  // Force re-render only when we commit to dragging
  const [, forceRender] = useState(0);

  // ── Helpers ──
  const getSnapName = (vh: number): SnapPosition => {
    if (vh <= SNAP_COLLAPSED + 5) return "collapsed";
    if (vh >= SNAP_FULL - 5) return "full";
    return "half";
  };

  const resolveSnap = useCallback((vh: number, vel: number): number => {
    // Velocity-aware snapping: flick up → next higher snap, flick down → next lower
    const flickThreshold = 0.4; // px/ms
    if (vel > flickThreshold) {
      // Flicking UP → go to next snap above current
      for (const s of SNAPS) {
        if (s > vh + 3) return s;
      }
      return SNAP_FULL;
    }
    if (vel < -flickThreshold) {
      // Flicking DOWN → go to next snap below current
      for (let i = SNAPS.length - 1; i >= 0; i--) {
        if (SNAPS[i] < vh - 3) return SNAPS[i];
      }
      return SNAP_COLLAPSED;
    }
    // No flick → nearest snap
    let closest = SNAPS[0];
    let minDist = Math.abs(vh - SNAPS[0]);
    for (const s of SNAPS) {
      const d = Math.abs(vh - s);
      if (d < minDist) { minDist = d; closest = s; }
    }
    return closest;
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
      } else if (!draggingDown && snapVh < SNAP_FULL - 2) {
        // Dragging up but sheet isn't full → expand the sheet first
        isSheetDrag.current = true;
      } else {
        // Let content scroll normally
        isSheetDrag.current = false;
      }
    }

    if (!isSheetDrag.current) return; // let native scroll handle it

    // ── Move the sheet ──
    const deltaVh = (deltaFromStart / window.innerHeight) * 100;
    const newVh = Math.max(SNAP_COLLAPSED, Math.min(SNAP_FULL, startVh.current + deltaVh));
    setSnapVh(newVh);
    forceRender((n) => n + 1);
  }, [snapVh]);

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;

    if (isSheetDrag.current) {
      const snapped = resolveSnap(snapVh, velocity.current);
      setSnapVh(snapped);
      onSnapChange?.(getSnapName(snapped));
    }
    gestureDecided.current = false;
    isSheetDrag.current = false;
  }, [snapVh, resolveSnap, onSnapChange]);

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
    if (snapVh <= SNAP_COLLAPSED + 5) {
      setSnapVh(SNAP_HALF);
      onSnapChange?.("half");
    } else {
      setSnapVh(SNAP_COLLAPSED);
      onSnapChange?.("collapsed");
    }
  }, [snapVh, onSnapChange]);

  // Track drag distance for tap detection
  useEffect(() => {
    dragDistanceRef.current = lastY.current - startY.current;
  });

  const isCollapsed = snapVh <= SNAP_COLLAPSED + 5;
  const isDrag = isSheetDrag.current && gestureDecided.current;

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 z-[1001] bg-card rounded-t-2xl shadow-2xl border-t border-border md:hidden"
      style={{
        height: `${snapVh}dvh`,
        bottom: 0,
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
        className="h-[calc(100%-40px)] overflow-x-hidden overscroll-contain"
        onTouchStart={onContentTouchStart}
        style={{
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
