import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParamsSynchronizable } from 'react-native-effects';

/** Target bubble pitch, points. */
const TARGET_SPACING = 46;
/** `u.liveData` holds 384 floats, one per bubble. */
const MAX_BUBBLES = 384;
/** How long a bubble takes to crumple flat (s). */
const POP_DURATION = 0.14;

export type BubbleGrid = {
  spacing: number;
  rowHeight: number;
  /** Bubbles per row, including the half bubble at the right edge. */
  stride: number;
  rows: number;
};

function gridFor(width: number, height: number, cols: number): BubbleGrid {
  const spacing = width / cols;
  const rowHeight = spacing * 0.8660254;
  const rows = Math.ceil(height / rowHeight) + 1;
  return { spacing, rowHeight, stride: cols + 1, rows };
}

function layoutGrid(width: number, height: number): BubbleGrid {
  let cols = Math.max(4, Math.round(width / TARGET_SPACING));
  let grid = gridFor(width, height, cols);
  while (grid.stride * grid.rows > MAX_BUBBLES && cols > 4) {
    cols -= 1;
    grid = gridFor(width, height, cols);
  }
  return grid;
}

/**
 * Bubble centre for (row, col), points. Even rows start half a bubble in,
 * odd rows sit on the left edge, so both edges show cut bubbles like a sheet
 * cut off the roll.
 */
function bubbleCenter(grid: BubbleGrid, row: number, col: number) {
  const shift = row % 2 === 0 ? 0.5 : 0;
  return { x: (col + shift) * grid.spacing, y: (row + 0.5) * grid.rowHeight };
}

function nearestBubble(grid: BubbleGrid, x: number, y: number): number {
  const r0 = Math.floor(y / grid.rowHeight - 0.5);
  let best = -1;
  let bestD = Infinity;
  for (let row = r0; row <= r0 + 1; row++) {
    if (row < 0 || row >= grid.rows) {
      continue;
    }
    const shift = row % 2 === 0 ? 0.5 : 0;
    const col = Math.round(x / grid.spacing - shift);
    if (col < 0 || col >= grid.stride) {
      continue;
    }
    const c = bubbleCenter(grid, row, col);
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < bestD) {
      bestD = d;
      best = row * grid.stride + col;
    }
  }
  return bestD < grid.spacing * 0.58 ? best : -1;
}

/**
 * The state of a sheet of bubble wrap.
 *
 * Each bubble owns one float of the live channel (`u.liveData`, flattened):
 * 0 is intact, 1 is popped flat, and in between it is crumpling. A press on
 * a bubble pops it; dragging pops every bubble the finger rolls over, for
 * every finger on the glass.
 */
export function useBubbleWrap(
  width: number,
  height: number,
  onPop: (index: number) => void
) {
  const grid = useMemo(() => layoutGrid(width, height), [width, height]);
  const count = grid.stride * grid.rows;

  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(new Array(4 + MAX_BUBBLES).fill(0));

  const stateRef = useRef<Float64Array>(new Float64Array(MAX_BUBBLES));
  const animatingRef = useRef(new Set<number>());
  const onPopRef = useRef(onPop);
  onPopRef.current = onPop;

  const flush = useCallback(() => {
    setParamsSynchronizable(0, 0, 0, 0, ...stateRef.current);
  }, [setParamsSynchronizable]);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;
    const step = (now: number) => {
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const animating = animatingRef.current;
      if (animating.size > 0) {
        const state = stateRef.current;
        for (const i of animating) {
          state[i] = Math.min(1, (state[i] ?? 0) + dt / POP_DURATION);
          if (state[i] === 1) {
            animating.delete(i);
          }
        }
        flush();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flush]);

  const pressAt = useCallback(
    (x: number, y: number) => {
      const i = nearestBubble(grid, x, y);
      if (i < 0 || i >= count || (stateRef.current[i] ?? 0) > 0) {
        return;
      }
      stateRef.current[i] = 0.001;
      animatingRef.current.add(i);
      onPopRef.current(i);
    },
    [grid, count]
  );

  // Touches jump between move events (the first one by the whole touch
  // slop), so press every bubble along the segment, not just its end.
  const lastTouchRef = useRef(new Map<string, { x: number; y: number }>());
  const dragTo = useCallback(
    (id: string, x: number, y: number) => {
      const last = lastTouchRef.current.get(id) ?? { x, y };
      const steps = Math.ceil(
        Math.hypot(x - last.x, y - last.y) / (grid.spacing * 0.3)
      );
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        pressAt(last.x + (x - last.x) * t, last.y + (y - last.y) * t);
      }
      pressAt(x, y);
      lastTouchRef.current.set(id, { x, y });
    },
    [grid, pressAt]
  );

  const releaseTouches = useCallback(() => {
    lastTouchRef.current.clear();
  }, []);

  const reset = useCallback(() => {
    stateRef.current.fill(0);
    animatingRef.current.clear();
    flush();
  }, [flush]);

  const poppedCount = useCallback(() => {
    let n = 0;
    for (let i = 0; i < count; i++) {
      if ((stateRef.current[i] ?? 0) > 0) {
        n++;
      }
    }
    return n;
  }, [count]);

  // `__bubblePop(x, y)` presses the sheet at screen fraction (x, y), y down.
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as { __bubblePop?: (x: number, y: number) => void };
    g.__bubblePop = (x, y) => pressAt(x * width, y * height);
    return () => {
      delete g.__bubblePop;
    };
  }, [pressAt, width, height]);

  return {
    paramsSynchronizable,
    grid,
    count,
    pressAt,
    dragTo,
    releaseTouches,
    reset,
    poppedCount,
  };
}
