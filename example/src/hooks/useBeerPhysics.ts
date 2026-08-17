import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Fraction of the screen height the surface sits at when the glass is full. */
const REST_LEVEL = 0.8;
/** Under-damped surface spring (~1.5 Hz, ζ ≈ 0.47) — lag, overshoot, ring. */
const STIFFNESS = 90;
const DAMPING = 9;
/** In-plane tilt below this (rad) never drains. */
const DRAIN_START = 0.35;
/** In-plane tilt at which the drain rate saturates. */
const DRAIN_FULL = 1.35;
const MAX_DRAIN_RATE = 0.5; // level / sec
const REFILL_RATE = 0.35; // level / sec
/** Per-sample accelerometer jerk below this is treated as sensor noise. */
const JERK_NOISE_FLOOR = 0.02;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type BeerSim = {
  /** Confidence-blended sensor angle the spring chases (rad, unwrapped). */
  targetAngle: number;
  /** Sprung display angle written to the shader. */
  angle: number;
  angleVel: number;
  /** In-plane signal confidence 0..1 (0 when the phone lies flat). */
  conf: number;
  /** Gravity points out of the top half of the screen → max drain. */
  pastHorizontal: boolean;
  /** How much beer is left, 1 = full glass, 0 = empty. */
  level: number;
  pouring: boolean;
  pourT: number;
  slosh: number;
  bubblePhase: number;
  lastAx: number;
  lastAy: number;
  /** Accumulated above-noise-floor jerk since the last frame. */
  jerkAccum: number;
};

/**
 * The physics of a phone-sized glass of beer.
 *
 * Reads the accelerometer's in-plane components (x, y — z is ignored, so lying
 * flat is simply "no signal" and holds the last surface angle), springs the
 * liquid surface toward world-level, and continuously integrates a smooth
 * drain-rate function of the tilt magnitude — no gates, no hold timers: tip
 * far enough and the beer just flows.
 *
 * Writes the live channel every frame:
 * `u.live = (surfaceAngle rad, surfaceLevelOnScreen 0..1, sloshEnergy 0..1,
 * pourIntensity 0..1)` and `u.liveData[0].x = bubblePhase`.
 *
 * Returns `refill` — call it on tap; it pours from any level (unless already
 * pouring or full), and the stream eases out as the glass tops up.
 */
export function useBeerPhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  refill: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, REST_LEVEL, 0, 0, 0, 0, 0, 0]);

  const simRef = useRef<BeerSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      targetAngle: 0,
      angle: 0,
      angleVel: 0,
      conf: 0,
      pastHorizontal: false,
      level: 1,
      pouring: false,
      pourT: 0,
      slosh: 0,
      bubblePhase: 0,
      lastAx: 0,
      lastAy: -1,
      jerkAccum: 0,
    };
  }

  // Accelerometer → target surface angle. In-plane (x, y) only; z ignored.
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
          const s = simRef.current as BeerSim;

          // Upright portrait reads y ≈ -1; the liquid counter-rotates the
          // phone so its surface stays level with the world.
          const reading = Math.atan2(x, -y);
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);

          // Weak in-plane signal (phone near-flat) HOLDS the last angle —
          // blend toward the new reading by conf² along the shortest path.
          let delta = reading - s.targetAngle;
          if (delta > Math.PI) {
            delta -= 2 * Math.PI;
          } else if (delta < -Math.PI) {
            delta += 2 * Math.PI;
          }
          s.targetAngle += delta * conf * conf;
          s.conf = conf;
          s.pastHorizontal = y > 0;

          // Jerk with a noise floor so idly holding the phone stays calm.
          const jerk = Math.hypot(x - s.lastAx, y - s.lastAy);
          s.lastAx = x;
          s.lastAy = y;
          s.jerkAccum += Math.max(0, jerk - JERK_NOISE_FLOOR);
        });
      } catch {
        // No accelerometer (simulator) → the beer just stands still.
      }
    })();

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
    };
  }, []);

  // Simulation loop: spring, drain, pour, slosh, bubble phase.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as BeerSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      // Under-damped spring toward the sensor angle → liquid-like lag/ring.
      s.angleVel += (s.targetAngle - s.angle) * STIFFNESS * dt;
      s.angleVel -= s.angleVel * DAMPING * dt;
      s.angle += s.angleVel * dt;

      // Slosh energy: spring angular speed + accelerometer jerk, ~1s decay.
      s.slosh = Math.min(
        1,
        s.slosh + Math.abs(s.angleVel) * 0.12 * dt + s.jerkAccum * 1.5
      );
      s.jerkAccum = 0;
      s.slosh *= Math.exp(-dt / 1.0);

      // Drinking: one smooth continuous rate function of tilt magnitude,
      // integrated every frame. Past horizontal (y > 0) is simply max rate.
      const tiltMag = Math.abs(s.targetAngle);
      const rate =
        MAX_DRAIN_RATE *
        s.conf *
        (s.pastHorizontal ? 1 : smoothstep(DRAIN_START, DRAIN_FULL, tiltMag));
      s.level = Math.max(0, s.level - rate * dt);

      // Refill pour: ramps in on tap and pours until the glass is full,
      // the stream easing out as the level tops up — so a refill works from
      // ANY level, a near-full glass just gets a short dribble.
      let pour = 0;
      if (s.pouring) {
        s.pourT += dt;
        pour =
          smoothstep(0, 0.35, s.pourT) * (1 - smoothstep(0.92, 1, s.level));
        s.level = Math.min(1, s.level + REFILL_RATE * dt);
        if (s.level >= 1) {
          s.pouring = false;
        }
      }

      // Integrated phase — never time × varying speed, or bubbles teleport.
      s.bubblePhase += dt * (1 + pour * 2 + s.slosh * 0.5);

      setParamsSynchronizable(
        s.angle,
        s.level * REST_LEVEL,
        s.slosh,
        pour,
        s.bubblePhase,
        0,
        0,
        0
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const refill = useCallback(() => {
    const s = simRef.current as BeerSim;
    if (!s.pouring && s.level < 1) {
      s.pouring = true;
      s.pourT = 0;
    }
  }, []);

  return { paramsSynchronizable, refill };
}
