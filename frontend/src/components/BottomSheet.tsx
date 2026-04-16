import { useRef, useState, useCallback, useEffect, type ReactNode } from "react";

// ─── Snap positions (percentage of viewport height from BOTTOM) ───
const SNAP_COLLAPSED = 7;   // ~60px peek
const SNAP_HALF = 50;       // half screen
const SNAP_FULL = 92;       // near full screen

type SnapPosition = "collapsed" | "half" | "full";
const SNAP_MAP: Record<SnapPosition, number> = {
  collapsed: SNAP_COLLAPSED,
  half: SNAP_HALF,
  full: SNAP_FULL,
};

interface BottomSheetProps {
  children: ReactNode;
  /** Label shown on the collapsed peek bar */
  peekLabel?: string;
  /** Emoji/icon before the label */
  peekIcon?: string;
  /** Initial snap position */
  defaultSnap?: SnapPosition;
  /** Called when snap position changes */
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
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartVh = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Resolve nearest snap ──
  const resolveSnap = useCallback((vh: number): number => {
    const snaps = [SNAP_COLLAPSED, SNAP_HALF, SNAP_FULL];
    let closest = snaps[0];
    let minDist = Math.abs(vh - snaps[0]);
    for (const s of snaps) {
      const d = Math.abs(vh - s);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    return closest;
  }, []);

  const getSnapName = (vh: number): SnapPosition => {
    if (vh <= SNAP_COLLAPSED + 5) return "collapsed";
    if (vh >= SNAP_FULL - 5) return "full";
    return "half";
  };

  // ── Drag handlers ──
  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartVh.current = snapVh;
  }, [snapVh]);

  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;
    const deltaY = dragStartY.current - clientY; // positive = drag up
    const deltaPx = deltaY;
    const deltaVh = (deltaPx / window.innerHeight) * 100;
    const newVh = Math.max(SNAP_COLLAPSED, Math.min(SNAP_FULL, dragStartVh.current + deltaVh));
    setSnapVh(newVh);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const snapped = resolveSnap(snapVh);
    setSnapVh(snapped);
    onSnapChange?.(getSnapName(snapped));
  }, [isDragging, snapVh, resolveSnap, onSnapChange]);

  // ── Touch events ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  const onTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // ── Mouse events (for desktop testing) ──
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  }, [handleDragStart]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const onUp = () => handleDragEnd();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // ── Tap on peek bar → toggle between collapsed and half ──
  const handlePeekTap = useCallback(() => {
    if (snapVh <= SNAP_COLLAPSED + 5) {
      setSnapVh(SNAP_HALF);
      onSnapChange?.("half");
    } else {
      setSnapVh(SNAP_COLLAPSED);
      onSnapChange?.("collapsed");
    }
  }, [snapVh, onSnapChange]);

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 z-[1001] bg-card rounded-t-2xl shadow-2xl border-t border-border md:hidden"
      style={{
        height: `${snapVh}vh`,
        bottom: 0,
        transition: isDragging ? "none" : "height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        willChange: "height",
        touchAction: "none",
      }}
    >
      {/* ── Drag handle ── */}
      <div
        className="flex flex-col items-center cursor-grab active:cursor-grabbing select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onClick={handlePeekTap}
        style={{ touchAction: "none" }}
      >
        <div className="pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
        </div>
        {snapVh <= SNAP_COLLAPSED + 5 && (
          <div className="pb-1.5 text-xs font-medium text-foreground flex items-center gap-1.5">
            <span>{peekIcon}</span>
            <span>{peekLabel}</span>
          </div>
        )}
      </div>

      {/* ── Content (scrollable when sheet is open) ── */}
      <div
        className="h-[calc(100%-40px)] overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
    </div>
  );
}
