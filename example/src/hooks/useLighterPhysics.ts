import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Spring that carries the lighter's own tilt (rad). Stiff — it IS the hand. */
const TILT_STIFFNESS = 140;
const TILT_DAMPING = 17;
/** Hot gas has inertia: the flame leans on a softer, ringier spring. */
const LEAN_STIFFNESS = 95;
const LEAN_DAMPING = 11;
/** How far the flame is dragged behind a fast rotation (s). */
const LEAN_DRAG = 0.13;
/** Flame envelope rates: catching is slower than snuffing. */
const IGNITE_RATE = 11;
const SNUFF_RATE = 16;
/** Flare that follows the strike, and the wheel's spark burst (s). */
const FLARE_TAU = 0.17;
const SPARK_DURATION = 0.38;
/** How long the wisp of smoke lingers after the flame is put out (s). */
const SMOKE_DURATION = 3.6;

type LighterSim = {
  /** In-plane gravity angle from the sensor (rad), confidence-blended. */
  tiltTarget: number;
  tilt: number;
  tiltVel: number;
  /** Horizontal component of the flame's up-vector, screen space. */
  lean: number;
  leanVel: number;
  lit: boolean;
  flame: number;
  flare: number;
  sparkAge: number;
  smokeAge: number;
  /** Integrated turbulence phase — never time x varying speed. */
  phase: number;
};

/**
 * The physics of a pocket lighter.
 *
 * The phone IS the lighter: it stays put on screen and the flame leans to
 * stay world-vertical. `atan2(x, -y)` is the same in-plane gravity angle the
 * beer example uses, blended by confidence² so a phone lying flat holds its
 * last angle instead of spinning. Without a sensor (a simulator) the angle
 * simply stays at zero and the flame burns straight up.
 *
 * The lean is a second, softer spring fed by that angle plus a term
 * proportional to its rate of change, so the flame lags a quick twist and
 * rings back afterwards rather than tracking it rigidly.
 *
 * Writes the live channel every frame:
 * `u.live = (flame 0..1, lean, flare 0..1, smoke 0..1)`,
 * `u.liveData[0] = (turbulencePhase, smokeAge 0..1, sparkAge 0..1, 0)`.
 */
export function useLighterPhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** Strike or snuff — wire it to a tap. */
  toggle: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 0, 0, 0, 1, 1, 0]);

  const simRef = useRef<LighterSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      tiltTarget: 0,
      tilt: 0,
      tiltVel: 0,
      lean: 0,
      leanVel: 0,
      lit: false,
      flame: 0,
      flare: 0,
      sparkAge: 1,
      smokeAge: 1,
      phase: 0,
    };
  }

  // Accelerometer -> in-plane gravity angle. Upright portrait reads y ~ -1,
  // and a positive angle means the phone's right-hand side has dropped.
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
          const s = simRef.current as LighterSim;
          const reading = Math.atan2(x, -y);
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);

          // Weak in-plane signal (phone near-flat) HOLDS the last angle.
          let delta = reading - s.tiltTarget;
          if (delta > Math.PI) {
            delta -= 2 * Math.PI;
          } else if (delta < -Math.PI) {
            delta += 2 * Math.PI;
          }
          s.tiltTarget += delta * conf * conf;
        });
      } catch {
        // No accelerometer (simulator) -> the flame just burns straight up.
      }
    })();

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
    };
  }, []);

  // Simulation loop: tilt spring, lean spring, flame envelope, smoke, sparks.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as LighterSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      s.tiltVel += (s.tiltTarget - s.tilt) * TILT_STIFFNESS * dt;
      s.tiltVel -= s.tiltVel * TILT_DAMPING * dt;
      s.tilt += s.tiltVel * dt;

      // The flame points at the ceiling: whatever the lighter tilted, the
      // flame gives back — plus a drag term so it trails a fast twist.
      const leanTarget =
        -Math.sin(s.tilt) - s.tiltVel * LEAN_DRAG * Math.cos(s.tilt);
      s.leanVel += (leanTarget - s.lean) * LEAN_STIFFNESS * dt;
      s.leanVel -= s.leanVel * LEAN_DAMPING * dt;
      s.lean += s.leanVel * dt;

      const rate = s.lit ? IGNITE_RATE : SNUFF_RATE;
      s.flame += ((s.lit ? 1 : 0) - s.flame) * Math.min(1, rate * dt);
      if (!s.lit && s.flame < 0.002) {
        s.flame = 0;
      }
      s.flare *= Math.exp(-dt / FLARE_TAU);
      s.sparkAge = Math.min(1, s.sparkAge + dt / SPARK_DURATION);
      s.smokeAge = Math.min(1, s.smokeAge + dt / SMOKE_DURATION);

      // Smoke fades in as the flame dies, then thins out as it climbs.
      const age = s.smokeAge;
      const smoke =
        age >= 1
          ? 0
          : Math.min(1, age / 0.1) * Math.pow(1 - age, 1.3) * (1 - s.flame);

      // Turbulence runs faster on a big flame and while the lighter is moving.
      s.phase += dt * (0.85 + s.flame * 0.55 + Math.abs(s.tiltVel) * 0.22);

      setParamsSynchronizable(
        s.flame,
        s.lean,
        s.flare,
        smoke,
        s.phase,
        s.smokeAge,
        s.sparkAge,
        0
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const toggle = useCallback(() => {
    const s = simRef.current as LighterSim;
    if (s.lit) {
      s.lit = false;
      s.smokeAge = 0;
    } else {
      s.lit = true;
      s.flare = 1;
      s.sparkAge = 0;
      s.smokeAge = 1;
    }
  }, []);

  return { paramsSynchronizable, toggle };
}
