import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/**
 * The glass interior, measured off the photo by `assets/hourglass/tools/profile.py`:
 * half-width of the inside every 10 px of canvas y, plus the landmarks the
 * volumes hang off. Regenerated with the atlas.
 */
const WALL = require('../../assets/hourglass/wall-table.json') as {
  cx: number;
  neckY: number;
  neckW: number;
  upperTop: number;
  lowerBottom: number;
  /** Where the photo's own sand reached in the upper bulb: the "full" line. */
  sandTopY: number;
  rows: [number, number][];
};

/** Angle of repose of dry sand — the slope a pile holds and a funnel drains at. */
export const REPOSE = 0.6; // rad, ~34 deg
const TAN_REPOSE = Math.tan(REPOSE);
/**
 * How far out from the neck the drain funnel reaches, as a fraction of the
 * half-width at the level. Sand only slumps where the drain undermines it, so
 * the funnel is a dip in the middle of a still-flat surface, not a full-width
 * V — a full-width one read as a folded sheet.
 */
const FUNNEL_REACH = 0.6;

/** Tilt spring (rad). Stiff — it is the hand. */
const TILT_STIFFNESS = 120;
const TILT_DAMPING = 16;
/**
 * Beyond this the surface model is not a funnel over a neck any more, so the
 * geometry stops following the phone while the flip logic below takes over.
 */
const TILT_CLAMP = 1.1;
/**
 * Flip hysteresis: the hourglass counts as turned over once the phone is past
 * FLIP_ON from upright, and as upright again once it is back inside FLIP_OFF.
 * Turning it over is what restarts it — as on the real thing, in both directions.
 */
const FLIP_ON = 2.4;
const FLIP_OFF = 0.75;
/** How fast the falling stream's grain scrolls, px/s in canvas space. */
const STREAM_SPEED = 900;
/** The stream does not stop dead when the sand runs out; it thins over this (s). */
const STREAM_FADE = 0.35;
/** The end-of-run glow: a single soft pulse this long (s). */
const DONE_PULSE = 1.6;
/** Only push a new frame at the UI thread once something moved this far. */
const SYNC_EPSILON = 0.002;

export const DURATIONS_MIN = [5, 15, 25] as const;
const DEFAULT_MIN = 25;

type Sim = {
  totalS: number;
  remainingS: number;
  running: boolean;
  paused: boolean;
  done: boolean;
  /** Debug: timer speed multiplier. */
  rateMul: number;
  /** Wall clock of the last tick, ms — the timer runs on real elapsed time. */
  lastWall: number;
  tiltTarget: number;
  tilt: number;
  tiltVel: number;
  tiltOverride: number | null;
  flipped: boolean;
  streamOn: number;
  streamPhase: number;
  doneAt: number;
  time: number;
  /** Cached geometry for the state dump. */
  geo: Geometry;
};

type Geometry = {
  /** Flat sand level in the source bulb, px above the neck. */
  lu: number;
  /** Depth of the drain funnel below that level, px. */
  depth: number;
  /** Flat level in the destination bulb, px below the neck. */
  ld: number;
  /** Height of the pile above that level, px. */
  peak: number;
  /** Interior half-width at each level, px. */
  wu: number;
  wl: number;
};

// ---- volumes ---------------------------------------------------------------
// Each bulb is a body of revolution about the neck axis; a slice at canvas y
// holds pi * w(y)^2 dy of sand. Cumulative tables let the level be found from
// a volume and back, which is all the surfaces need.

const ROWS = WALL.rows;
const ROW_STEP = ROWS[1]![0] - ROWS[0]![0];

function widthAt(y: number): number {
  const i = (y - ROWS[0]![0]) / ROW_STEP;
  const i0 = Math.max(0, Math.min(ROWS.length - 2, Math.floor(i)));
  const t = Math.max(0, Math.min(1, i - i0));
  return ROWS[i0]![1] + (ROWS[i0 + 1]![1] - ROWS[i0]![1]) * t;
}

/** Volume between two canvas y's, Simpson-ish at row resolution. */
function volumeBetween(y0: number, y1: number): number {
  let v = 0;
  const step = 2;
  for (let y = y0; y < y1; y += step) {
    const w = widthAt(y + step / 2);
    v += Math.PI * w * w * step;
  }
  return v;
}

/** All the sand there is: the photo's upper bulb, full line to neck. */
const SAND_VOLUME = volumeBetween(WALL.sandTopY, WALL.neckY);

function coneVolume(r: number, h: number): number {
  return (Math.PI * r * r * h) / 3;
}

/**
 * The interior as sample points about the neck, each weighted by how deep the
 * glass is there (the bulb is a body of revolution), so a count of points on
 * one side of a plane is a volume. This is what lets a tilted fill keep its
 * volume: the level is solved against the real shape, not read off a table
 * that only knows "up".
 */
const GRID = 10;
function samplePoints(y0: number, y1: number): Float32Array {
  const out: number[] = [];
  for (let y = y0 + GRID / 2; y < y1; y += GRID) {
    const w = widthAt(y);
    for (let x = -w + GRID / 2; x < w; x += GRID) {
      const depthHere = 2 * Math.sqrt(Math.max(0, w * w - x * x));
      out.push(x, y - WALL.neckY, depthHere * GRID * GRID);
    }
  }
  return Float32Array.from(out);
}
const SRC_PTS = samplePoints(WALL.upperTop, WALL.neckY);
const DST_PTS = samplePoints(WALL.neckY, WALL.lowerBottom);

/** Volume of the points at or beyond level L along the unit direction g. */
function volumeBeyond(
  pts: Float32Array,
  gx: number,
  gy: number,
  L: number
): number {
  let v = 0;
  for (let i = 0; i < pts.length; i += 3) {
    if (pts[i]! * gx + pts[i + 1]! * gy >= L) {
      v += pts[i + 2]!;
    }
  }
  return v;
}

/**
 * Where the sand sits for a remaining fraction f, with the sand's own frame
 * turned by psi from the screen.
 *
 * Source bulb: a flat fill (a plane at right angles to the sand frame) that a
 * funnel of repose slope has been dug out of. The funnel's volume is credited
 * back to the flat level so the total stays honest.
 *
 * Destination: sand landing at one point piles up as a cone at repose slope
 * until the cone's base meets the glass; from then on the pile rides on a
 * rising flat fill. Solved by bisection on the flat level with the cone that
 * fits at that level. Both levels are solved against the sampled interior in
 * the tilted frame, so tilting the phone slides the fill without gaining or
 * losing any.
 */
function solveGeometry(f: number, psi: number): Geometry {
  const vSrc = SAND_VOLUME * f;
  const vDst = SAND_VOLUME - vSrc;
  const gx = Math.sin(psi);
  const gy = Math.cos(psi);
  // Turned over, the lower bulb is the source and the upper the floor.
  const over = gy < 0;
  const srcPts = over ? DST_PTS : SRC_PTS;
  const dstPts = over ? SRC_PTS : DST_PTS;
  const srcReach = over
    ? WALL.lowerBottom - WALL.neckY
    : WALL.neckY - WALL.upperTop;
  const floorDist = over
    ? WALL.neckY - WALL.upperTop
    : WALL.lowerBottom - WALL.neckY;

  // Source: sand is everything at s >= -lu inside its bulb.
  let lu = 0;
  let wu = WALL.neckW;
  let depth = 0;
  if (vSrc > 0) {
    let lo = 0;
    let hi = srcReach + 40;
    let vCone = 0;
    for (let pass = 0; pass < 2; pass++) {
      lo = 0;
      hi = srcReach + 40;
      for (let i = 0; i < 20; i++) {
        const mid = 0.5 * (lo + hi);
        if (volumeBeyond(srcPts, gx, gy, -mid) < vSrc + vCone) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      lu = 0.5 * (lo + hi);
      wu = widthAt(WALL.neckY - lu * gy);
      depth = Math.max(0, Math.min(TAN_REPOSE * wu * FUNNEL_REACH, lu - 6));
      vCone = coneVolume(depth / TAN_REPOSE, depth);
    }
  }

  // Destination: sand is everything at s >= ld inside its bulb, plus the
  // cone on top of it.
  const floorW = widthAt(WALL.neckY + (floorDist - 30) * gy);
  let ld = floorDist;
  let peak = 0;
  let wl = floorW;
  if (vDst > 0) {
    const rFree = Math.cbrt((3 * vDst) / (Math.PI * TAN_REPOSE));
    if (rFree <= floorW) {
      // A cone on the floor: the floor itself is round, so the level sits a
      // little below where the cone's base would meet a flat one.
      peak = rFree * TAN_REPOSE;
      ld = floorDist - Math.min(30, peak * 0.4);
      wl = Math.max(rFree, floorW);
    } else {
      let lo = 40;
      let hi = floorDist + 40;
      for (let i = 0; i < 22; i++) {
        const mid = 0.5 * (lo + hi);
        const w = widthAt(WALL.neckY + mid * gy);
        const h = Math.min(w * TAN_REPOSE, mid - 30);
        const total = volumeBeyond(dstPts, gx, gy, mid) + coneVolume(w, h);
        if (total > vDst) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      ld = 0.5 * (lo + hi);
      wl = widthAt(WALL.neckY + ld * gy);
      peak = Math.max(0, Math.min(wl * TAN_REPOSE, ld - 30));
    }
  }

  return { lu, depth, ld, peak, wu, wl };
}

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) {
    r -= 2 * Math.PI;
  }
  while (r < -Math.PI) {
    r += 2 * Math.PI;
  }
  return r;
}

export type HourglassPhysics = {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** Pick a duration (minutes) and start over. */
  setDuration: (minutes: number) => void;
  /** Tap the glass. */
  togglePause: () => void;
  /** Start over at the current duration. */
  restart: () => void;
  getState: () => {
    remainingS: number;
    totalS: number;
    running: boolean;
    paused: boolean;
    done: boolean;
    flipped: boolean;
  };
};

/**
 * The physics of an hourglass that is also a timer.
 *
 * The timer is the ground truth: it counts real elapsed seconds, and the sand
 * is drawn from the fraction left. The accelerometer says which way is down:
 * tilt turns the sand surfaces (they hold their repose slope rather than
 * levelling like a liquid), and turning the phone over swaps which bulb is
 * the source and restarts the run — in either direction, like the real thing.
 *
 * Writes the live channel every frame:
 * `u.live = (sand frame rad, source level px, funnel depth px, dest level px)`,
 * `u.liveData[0] = (pile height px, stream 0..1, stream phase px, done glow 0..1)`,
 * `u.liveData[1] = (source half-width px, dest half-width px, gravity rad, 0)`.
 */
export function useHourglassPhysics(): HourglassPhysics {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(new Array<number>(12).fill(0));

  const simRef = useRef<Sim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      totalS: DEFAULT_MIN * 60,
      remainingS: DEFAULT_MIN * 60,
      running: true,
      paused: false,
      done: false,
      rateMul: 1,
      lastWall: 0,
      tiltTarget: 0,
      tilt: 0,
      tiltVel: 0,
      tiltOverride: null,
      flipped: false,
      streamOn: 1,
      streamPhase: 0,
      doneAt: -1,
      time: 0,
      geo: solveGeometry(1, 0),
    };
  }

  const restartSim = useCallback((s: Sim) => {
    s.remainingS = s.totalS;
    s.running = true;
    s.paused = false;
    s.done = false;
    s.doneAt = -1;
  }, []);

  // Accelerometer -> in-plane gravity angle. Upright portrait reads y ~ -1; a
  // positive angle means the phone's right-hand side has dropped.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) {
          return;
        }
        Accelerometer.setUpdateInterval(16);
        sub = Accelerometer.addListener(({ x, y }) => {
          const s = simRef.current as Sim;
          if (s.tiltOverride !== null) {
            return;
          }
          const reading = Math.atan2(x, -y);
          // Weak in-plane signal (phone near-flat) holds the last angle
          // instead of thrashing on atan2 noise.
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);
          s.tiltTarget += wrapAngle(reading - s.tiltTarget) * conf * conf;
        });
      } catch {
        // No accelerometer (simulator): upright, and the debug hooks below are
        // the only way to move it.
      }
    })();

    if (__DEV__) {
      const g = globalThis as {
        __hourglassTilt?: (rad: number | null) => void;
        __hourglassFlip?: () => void;
        __hourglassRate?: (mul: number) => void;
        __hourglassState?: () => Record<string, number | boolean | null>;
      };
      g.__hourglassTilt = (rad: number | null) => {
        const s = simRef.current as Sim;
        if (rad === null) {
          s.tiltOverride = null;
          return;
        }
        s.tiltOverride = rad;
        s.tiltTarget = rad;
      };
      // Turn it over: the gravity angle goes round by half a turn, and the
      // flip logic in the loop does the rest, exactly as a real turn would.
      g.__hourglassFlip = () => {
        const s = simRef.current as Sim;
        const base = s.tiltOverride ?? s.tiltTarget;
        s.tiltOverride = wrapAngle(base + Math.PI);
        s.tiltTarget = s.tiltOverride;
      };
      g.__hourglassRate = (mul: number) => {
        const s = simRef.current as Sim;
        s.rateMul = Math.max(0, mul);
      };
      g.__hourglassState = () => {
        const s = simRef.current as Sim;
        return {
          remaining: s.remainingS,
          total: s.totalS,
          fraction: s.remainingS / s.totalS,
          running: s.running,
          paused: s.paused,
          done: s.done,
          rateMul: s.rateMul,
          tilt: s.tilt,
          tiltTarget: s.tiltTarget,
          tiltOverride: s.tiltOverride,
          flipped: s.flipped,
          streamOn: s.streamOn,
          lu: s.geo.lu,
          depth: s.geo.depth,
          ld: s.geo.ld,
          peak: s.geo.peak,
        };
      };
    }

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        const g = globalThis as {
          __hourglassTilt?: unknown;
          __hourglassFlip?: unknown;
          __hourglassRate?: unknown;
          __hourglassState?: unknown;
        };
        delete g.__hourglassTilt;
        delete g.__hourglassFlip;
        delete g.__hourglassRate;
        delete g.__hourglassState;
      }
    };
  }, []);

  // Simulation loop: timer on the wall clock, tilt spring, flip, geometry.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;
    let lastSent: number[] | null = null;
    let geoF = -1;
    let geoPsi = 0;
    const frame = new Array<number>(12).fill(0);

    const step = (now: number) => {
      const s = simRef.current as Sim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const wall = Date.now();
      const dtWall = s.lastWall === 0 ? dt : (wall - s.lastWall) / 1000;
      s.lastWall = wall;
      s.time += dt;

      s.tiltVel += (s.tiltTarget - s.tilt) * TILT_STIFFNESS * dt;
      s.tiltVel -= s.tiltVel * TILT_DAMPING * dt;
      s.tilt += s.tiltVel * dt;

      // Turned over? Judged on the sensor's angle, not the sprung one, so a
      // flip registers the moment the hand finishes it.
      const fromUpright = Math.abs(wrapAngle(s.tiltTarget));
      if (!s.flipped && fromUpright > FLIP_ON) {
        s.flipped = true;
        restartSim(s);
      } else if (s.flipped && fromUpright < FLIP_OFF) {
        s.flipped = false;
        restartSim(s);
      }

      // The geometry only follows the phone so far from whichever way is
      // "up" for the current source bulb.
      const base = s.flipped ? Math.PI : 0;
      const dev = Math.max(
        -TILT_CLAMP,
        Math.min(TILT_CLAMP, wrapAngle(s.tilt - base))
      );
      const tiltEff = base + dev;
      // Sand is not a liquid: tipped a little it stays put against the glass,
      // and only past the angle of repose does it slide to keep its slope.
      // So the sand's own frame lags the phone by the slope it can hold.
      const psi = base + (dev - REPOSE * Math.tanh(dev / REPOSE));
      // On its side the neck is not below the source any more: no flow.
      const flow = Math.max(0, Math.cos(dev));

      if (s.running && !s.paused && !s.done) {
        s.remainingS -= dtWall * s.rateMul * flow;
        if (s.remainingS <= 0) {
          s.remainingS = 0;
          s.done = true;
          s.running = false;
          s.doneAt = s.time;
        }
      }
      const f = Math.max(
        0,
        Math.min(1, s.totalS > 0 ? s.remainingS / s.totalS : 0)
      );
      // The solve walks a few thousand points; only redo it once the fraction
      // or the frame has moved enough to show.
      if (Math.abs(f - geoF) > 0.0008 || Math.abs(psi - geoPsi) > 0.003) {
        s.geo = solveGeometry(f, psi);
        geoF = f;
        geoPsi = psi;
      }

      const streamTarget =
        s.running && !s.paused && !s.done && flow > 0.05 && f > 0 ? flow : 0;
      s.streamOn +=
        (streamTarget - s.streamOn) *
        Math.min(1, dt / (streamTarget > s.streamOn ? 0.08 : STREAM_FADE));
      s.streamPhase += dt * STREAM_SPEED * (0.4 + 0.6 * s.streamOn);

      let glow = 0;
      if (s.doneAt >= 0) {
        const u = (s.time - s.doneAt) / DONE_PULSE;
        glow = u < 1 ? Math.sin(u * Math.PI) : 0;
      }

      frame[0] = psi;
      frame[1] = s.geo.lu;
      frame[2] = s.geo.depth;
      frame[3] = s.geo.ld;
      frame[4] = s.geo.peak;
      frame[5] = s.streamOn;
      frame[6] = s.streamPhase;
      frame[7] = glow;
      frame[8] = s.geo.wu;
      frame[9] = s.geo.wl;
      frame[10] = tiltEff;
      frame[11] = 0;

      let changed = lastSent === null;
      if (lastSent) {
        for (let i = 0; i < frame.length; i++) {
          if (Math.abs(frame[i]! - lastSent[i]!) > SYNC_EPSILON) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        setParamsSynchronizable(...frame);
        lastSent = frame.slice();
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable, restartSim]);

  const setDuration = useCallback(
    (minutes: number) => {
      const s = simRef.current as Sim;
      s.totalS = minutes * 60;
      restartSim(s);
    },
    [restartSim]
  );

  const togglePause = useCallback(() => {
    const s = simRef.current as Sim;
    if (s.done) {
      return;
    }
    s.paused = !s.paused;
  }, []);

  const restart = useCallback(() => {
    restartSim(simRef.current as Sim);
  }, [restartSim]);

  const getState = useCallback(() => {
    const s = simRef.current as Sim;
    return {
      remainingS: s.remainingS,
      totalS: s.totalS,
      running: s.running,
      paused: s.paused,
      done: s.done,
      flipped: s.flipped,
    };
  }, []);

  return { paramsSynchronizable, setDuration, togglePause, restart, getState };
}
