import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';
import {
  AREAS,
  AREA_RADIUS,
  CHANNEL_LENGTH,
  GRID_X,
  GRID_Y,
  PLAY_H,
  PLAY_W,
  TILT_SLOT,
} from '../components/scratchoff/ScratchCoating';
import { FLAKE_COUNT, FLAKE_STRIDE } from '../components/scratchoff/Flakes';
import { setScratchSpeed } from '../components/scratchoff/scratchSound';
import { useHoldTilt } from './useHoldTilt';

/** Finger contact radius (pt) and how much one pass removes. */
const BRUSH_R = 17;
const BRUSH_STRENGTH = 0.7;
/** Fraction of an area's cells scratched through before it reveals itself. */
const AUTO_REVEAL_AT = 0.6;
const REVEAL_SECONDS = 0.7;
const GRAVITY = 1500;
const FLAKE_LIFE = 1.1;

const CELL_W = PLAY_W / GRID_X;
const CELL_H = PLAY_H / GRID_Y;

type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  life: number;
};

function insideArea(x: number, y: number, i: number): boolean {
  const a = AREAS[i]!;
  const r = AREA_RADIUS * 0.5;
  return x > a.x + r && x < a.x + a.w - r && y > a.y + r && y < a.y + a.h - r;
}

function cellsOf(i: number): number[] {
  const cells: number[] = [];
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      if (insideArea((gx + 0.5) * CELL_W, (gy + 0.5) * CELL_H, i)) {
        cells.push(gy * GRID_X + gx);
      }
    }
  }
  return cells;
}

const AREA_CELLS = AREAS.map((_, i) => cellsOf(i));

/**
 * State of a scratch card: the coverage grid the shader cuts the latex
 * with, each area's auto-reveal sweep, the tilt, and the falling flakes.
 *
 * `stroke(x, y, first)` takes the finger in play-area points. Each segment is
 * stamped into the grid with a soft round brush, flakes are flicked off along
 * it, and the scratch noise follows its speed. Once 60% of an area's cells are
 * through, the area sweeps itself clean with a haptic tick. The channel is
 * rewritten every frame by one loop: `u.live` = reveal per area,
 * `u.liveData` = grid, then tilt. Tilt has a dev override,
 * `__scratchTilt(x, y)` / `__scratchTilt(null)`.
 */
export function useScratchCard() {
  const tilt = useHoldTilt('__scratchTilt');
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(new Array(CHANNEL_LENGTH).fill(0));
  const flakeState = useSharedValue<number[]>(
    new Array(FLAKE_COUNT * FLAKE_STRIDE).fill(0)
  );
  const grid = useRef(new Float64Array(GRID_X * GRID_Y));
  const reveal = useRef([0, 0, 0, 0]);
  const revealing = useRef([false, false, false, false]);
  const flakes = useRef<Flake[]>([]);
  const last = useRef({ x: 0, y: 0, t: 0 });
  const [revealed, setRevealed] = useState(0);

  const stamp = useCallback((x: number, y: number) => {
    const g = grid.current;
    const x0 = Math.max(0, Math.floor((x - BRUSH_R) / CELL_W));
    const x1 = Math.min(GRID_X - 1, Math.floor((x + BRUSH_R) / CELL_W));
    const y0 = Math.max(0, Math.floor((y - BRUSH_R) / CELL_H));
    const y1 = Math.min(GRID_Y - 1, Math.floor((y + BRUSH_R) / CELL_H));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const dx = (gx + 0.5) * CELL_W - x;
        const dy = (gy + 0.5) * CELL_H - y;
        const fall = 1 - Math.hypot(dx, dy) / BRUSH_R;
        if (fall > 0) {
          const i = gy * GRID_X + gx;
          g[i] = Math.min(1, g[i]! + fall * BRUSH_STRENGTH);
        }
      }
    }
  }, []);

  const flick = useCallback((x: number, y: number, dx: number, dy: number) => {
    const onCoat = AREAS.some((_, i) => insideArea(x, y, i));
    if (!onCoat || Math.random() > 0.55) {
      return;
    }
    const list = flakes.current;
    if (list.length >= FLAKE_COUNT) {
      list.shift();
    }
    list.push({
      x,
      y,
      vx: dx * 0.25 + (Math.random() - 0.5) * 140,
      vy: dy * 0.25 - 60 - Math.random() * 120,
      angle: Math.random() * 360,
      spin: (Math.random() - 0.5) * 1400,
      size: 1.5 + Math.random() * 3.5,
      life: FLAKE_LIFE * (0.6 + Math.random() * 0.4),
    });
  }, []);

  const checkAreas = useCallback(() => {
    const g = grid.current;
    AREA_CELLS.forEach((cells, i) => {
      if (revealing.current[i]) {
        return;
      }
      const through = cells.filter((c) => g[c]! > 0.5).length;
      if (through >= cells.length * AUTO_REVEAL_AT) {
        revealing.current[i] = true;
        Vibration.vibrate(20);
        setRevealed((n) => n + 1);
      }
    });
  }, []);

  const stroke = useCallback(
    (x: number, y: number, first: boolean) => {
      const now = Date.now();
      const prev = last.current;
      last.current = { x, y, t: now };
      if (first) {
        stamp(x, y);
        return;
      }
      const dx = x - prev.x;
      const dy = y - prev.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / 4));
      for (let s = 1; s <= steps; s++) {
        stamp(prev.x + (dx * s) / steps, prev.y + (dy * s) / steps);
      }
      const dt = Math.max(0.008, (now - prev.t) / 1000);
      const speed = dist / dt;
      setScratchSpeed(speed);
      const vx = dx / dt;
      const vy = dy / dt;
      for (let k = 0; k < Math.min(4, steps); k++) {
        flick(x - (dx * k) / steps, y - (dy * k) / steps, vx, vy);
      }
      checkAreas();
    },
    [checkAreas, flick, stamp]
  );

  const lift = useCallback(() => {
    setScratchSpeed(0);
  }, []);

  const reset = useCallback(() => {
    grid.current.fill(0);
    reveal.current = [0, 0, 0, 0];
    revealing.current = [false, false, false, false];
    flakes.current = [];
    setRevealed(0);
  }, []);

  useEffect(() => {
    const channel = new Array(CHANNEL_LENGTH).fill(0);
    const flakeOut = new Array(FLAKE_COUNT * FLAKE_STRIDE).fill(0);
    let prev = Date.now();
    let frame = 0;
    let hadFlakes = false;
    const step = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      for (let i = 0; i < 4; i++) {
        if (revealing.current[i]) {
          reveal.current[i] = Math.min(
            1,
            reveal.current[i]! + dt / REVEAL_SECONDS
          );
        }
        channel[i] = reveal.current[i];
      }
      const g = grid.current;
      for (let i = 0; i < g.length; i++) {
        channel[4 + i] = g[i];
      }
      channel[4 + TILT_SLOT * 4] = tilt.current.x;
      channel[5 + TILT_SLOT * 4] = tilt.current.y;
      setParamsSynchronizable(...channel);

      const list = flakes.current;
      for (const f of list) {
        f.vy += GRAVITY * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.angle += f.spin * dt;
        f.life -= dt;
      }
      flakes.current = list.filter((f) => f.life > 0);
      if (flakes.current.length === 0 && !hadFlakes) {
        frame = requestAnimationFrame(step);
        return;
      }
      hadFlakes = flakes.current.length > 0;
      flakeOut.fill(0);
      flakes.current.forEach((f, i) => {
        const o = i * FLAKE_STRIDE;
        flakeOut[o] = f.x;
        flakeOut[o + 1] = f.y;
        flakeOut[o + 2] = f.angle;
        flakeOut[o + 3] = f.size;
        flakeOut[o + 4] = f.life / FLAKE_LIFE;
      });
      flakeState.value = flakeOut.slice();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [flakeState, setParamsSynchronizable, tilt]);

  return {
    paramsSynchronizable,
    flakeState,
    stroke,
    lift,
    reset,
    revealed,
  };
}
