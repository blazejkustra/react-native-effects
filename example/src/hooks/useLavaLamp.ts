import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/**
 * The vessel, in the units the shader uses: photo pixels, Y up from the
 * glass floor. `halfWidth` must match the shader's `glassHalfWidth`.
 */
export const GLASS_HEIGHT = 662;
function halfWidth(y: number): number {
  const t = Math.min(1, Math.max(0, 1 - y / GLASS_HEIGHT));
  return 86 + 46 * (1 - (1 - t) * (1 - t));
}

/** Wax on the bulb warms quickly; out in the liquid it cools slowly (s). */
const HEAT_TAU = 6;
const COOL_TAU = 45;
/**
 * Wax in the pool clings to it until it is this hot, so it leaves the
 * bottom hot enough to make it all the way up.
 */
const RELEASE_TEMP = 0.94;
/** Upward acceleration per unit of temperature above neutral (px/s^2). */
const BUOYANCY = 85;
/** Paraffin in water is syrupy: velocity relaxes at this rate (1/s). */
const DRAG = 1.6;
/** The heater warms only the bottom of the glass (px). */
const HEATER_ZONE = 45;
const WALL_STIFFNESS = 30;
const TILT_RATE = 3;

type Blob = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  temp: number;
  /** Held in the pool until it is hot enough to break free. */
  stuck: boolean;
};

type LavaSim = {
  blobs: Blob[];
  /** Up, in the vessel's frame (unit vector, y up). */
  up: { x: number; y: number };
  upTarget: { x: number; y: number };
  tiltOverride: number | null;
  phase: number;
};

const SEED_BLOBS: Array<Omit<Blob, 'vx'>> = [
  { x: -15, y: 560, r: 58, temp: 0.5, vy: -3, stuck: false },
  { x: 20, y: 330, r: 52, temp: 0.8, vy: 14, stuck: false },
  { x: -30, y: 200, r: 40, temp: 0.45, vy: -8, stuck: false },
  { x: 45, y: 30, r: 56, temp: 0.75, vy: 0, stuck: true },
  { x: -50, y: 30, r: 48, temp: 0.5, vy: 0, stuck: true },
  { x: 25, y: 630, r: 36, temp: 0.49, vy: 0, stuck: false },
  { x: 50, y: 430, r: 32, temp: 0.47, vy: -6, stuck: false },
];

/** Temperature the wax drifts toward at height y: hot on the bulb. */
function ambientTemp(y: number, onBulb: boolean): number {
  return onBulb ? 1.1 : 0.42 - 0.25 * (y / GLASS_HEIGHT);
}

function stepBlob(b: Blob, s: LavaSim, dt: number) {
  const onBulb = b.y < HEATER_ZONE + b.r * 0.2;
  const tau = onBulb ? HEAT_TAU : COOL_TAU;
  b.temp += (ambientTemp(b.y, onBulb) - b.temp) * (dt / tau);
  if (onBulb && b.temp < 0.5) {
    b.stuck = true;
  } else if (b.stuck && b.temp > RELEASE_TEMP) {
    b.stuck = false;
  }
  const buoyant = b.stuck ? Math.min(0, b.temp - 0.5) : b.temp - 0.5;
  const lift = buoyant * BUOYANCY;
  b.vx += s.up.x * lift * dt;
  b.vy += s.up.y * lift * dt;

  const hw = halfWidth(b.y) - b.r * 0.75;
  if (b.x > hw) {
    b.vx -= (b.x - hw) * WALL_STIFFNESS * dt;
  } else if (b.x < -hw) {
    b.vx -= (b.x + hw) * WALL_STIFFNESS * dt;
  }
  const floor = b.r * 0.35;
  const ceiling = GLASS_HEIGHT - b.r * 0.55;
  if (b.y < floor) {
    b.vy += (floor - b.y) * WALL_STIFFNESS * dt;
  } else if (b.y > ceiling) {
    b.vy -= (b.y - ceiling) * WALL_STIFFNESS * dt;
  }

  const damp = Math.exp(-DRAG * dt);
  b.vx *= damp;
  b.vy *= damp;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

/** Blobs that overlap too far push apart gently, so they bump and pass. */
function separate(blobs: Blob[], dt: number) {
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const a = blobs[i] as Blob;
      const b = blobs[j] as Blob;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const minD = (a.r + b.r) * 0.7;
      if (d < minD) {
        const push = ((minD - d) / d) * 3 * dt;
        a.vx -= dx * push;
        a.vy -= dy * push;
        b.vx += dx * push;
        b.vy += dy * push;
      }
    }
  }
}

/**
 * A lava lamp's wax, simulated.
 *
 * A handful of wax blobs, each with a temperature. The bulb heats the wax
 * pooled on the bottom of the glass, which clings there until it is hot and
 * then lets go. Warm wax is lighter than the liquid and rises, cools slowly
 * up near the cap, turns heavy and sinks back to the pool to warm up again. Everything happens in syrup, so it takes tens of
 * seconds. Buoyancy acts along real gravity from the accelerometer, so tilting
 * the phone sends the wax drifting toward whichever side is now up.
 *
 * Writes `u.live = (phase, 0, 0, 0)` and one blob per `u.liveData[i]` as
 * `(x, y, radius, stretch)` in photo pixels, y up from the glass floor.
 */
export function useLavaLamp() {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(new Array(4 + SEED_BLOBS.length * 4).fill(0));

  const simRef = useRef<LavaSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      blobs: SEED_BLOBS.map((b) => ({ ...b, vx: 0 })),
      up: { x: 0, y: 1 },
      upTarget: { x: 0, y: 1 },
      tiltOverride: null,
      phase: 0,
    };
  }

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) {
          return;
        }
        Accelerometer.setUpdateInterval(50);
        sub = Accelerometer.addListener(({ x, y }) => {
          const s = simRef.current as LavaSim;
          const len = Math.hypot(x, y);
          if (s.tiltOverride !== null || len < 0.3) {
            return;
          }
          s.upTarget = { x: -x / len, y: -y / len };
        });
      } catch {
        // No accelerometer (simulator): the lamp stands upright.
      }
    };
    start();

    // `__lavaTilt(rad)` tilts the phone by that angle (positive = right side
    // down) until `__lavaTilt(null)` hands control back to the sensor.
    if (__DEV__) {
      const g = globalThis as { __lavaTilt?: (rad: number | null) => void };
      g.__lavaTilt = (rad) => {
        const s = simRef.current as LavaSim;
        s.tiltOverride = rad;
        if (rad !== null) {
          s.upTarget = { x: Math.sin(rad), y: Math.cos(rad) };
        }
      };
    }

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        delete (globalThis as { __lavaTilt?: unknown }).__lavaTilt;
      }
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as LavaSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const k = Math.min(1, TILT_RATE * dt);
      s.up.x += (s.upTarget.x - s.up.x) * k;
      s.up.y += (s.upTarget.y - s.up.y) * k;
      const len = Math.hypot(s.up.x, s.up.y) || 1;
      s.up.x /= len;
      s.up.y /= len;

      for (const b of s.blobs) {
        stepBlob(b, s, dt);
      }
      separate(s.blobs, dt);
      s.phase += dt * 0.25;

      const out: number[] = [s.phase, 0, 0, 0];
      for (const b of s.blobs) {
        const speed = Math.hypot(b.vx, b.vy);
        out.push(b.x, b.y, b.r, Math.min(0.6, speed / 40));
      }
      setParamsSynchronizable(...out);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  return { paramsSynchronizable, blobCount: SEED_BLOBS.length };
}
