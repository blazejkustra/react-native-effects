import { useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

/** Acceleration beyond gravity (g) that counts as a full shake. */
const FULL_SHAKE_G = 1.2;
const SHAKE_ATTACK = 0.08;
const SHAKE_RELEASE = 0.9;
/** The print hangs from the fingers: a soft, ringing spring (deg). */
const SWAY_STIFFNESS = 90;
const SWAY_DAMPING = 5;
const SWAY_KICK = 30;
/** Synthetic shake frequency while the debug override is set (Hz). */
const OVERRIDE_HZ = 4;

type ShakeSim = {
  level: number;
  lateral: number;
  lateralPrev: number;
  sway: number;
  swayVel: number;
  override: number | null;
  overridePhase: number;
};

type DebugGlobal = { __polaroidShake?: (level: number | null) => void };

/**
 * Shaking the phone like an instant print.
 *
 * Reads the accelerometer: anything beyond gravity is shake, run through an
 * envelope into `level` (0..1), which the screen uses to speed development a
 * little. Sideways jerks kick a soft spring that the print sways on (`sway`,
 * degrees). `__polaroidShake(level)` overrides the sensor with a synthetic
 * 4 Hz shake in dev builds; `null` hands control back.
 */
export function usePolaroidShake(): {
  level: React.RefObject<number>;
  sway: SharedValue<number>;
} {
  const level = useRef(0);
  const sway = useSharedValue(0);
  const sim = useRef<ShakeSim>({
    level: 0,
    lateral: 0,
    lateralPrev: 0,
    sway: 0,
    swayVel: 0,
    override: null,
    overridePhase: 0,
  });

  useEffect(() => {
    const s = sim.current;
    let raw = 0;
    Accelerometer.setUpdateInterval(16);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      raw = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
      s.lateral = x;
    });

    if (__DEV__) {
      (globalThis as DebugGlobal).__polaroidShake = (v) => {
        s.override = v;
      };
    }

    let last = Date.now();
    let frame = 0;
    const step = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let shake = Math.min(1, raw / FULL_SHAKE_G);
      if (s.override !== null) {
        s.overridePhase += dt * OVERRIDE_HZ * Math.PI * 2;
        shake = s.override;
        s.lateral = s.override * Math.sin(s.overridePhase);
      }
      const tau = shake > s.level ? SHAKE_ATTACK : SHAKE_RELEASE;
      s.level += (shake - s.level) * Math.min(1, dt / tau);

      const jerk = (s.lateral - s.lateralPrev) / Math.max(dt, 1e-3);
      s.lateralPrev = s.lateral;
      const kick = Math.max(-40, Math.min(40, jerk)) * SWAY_KICK * 0.01;
      s.swayVel +=
        (-SWAY_STIFFNESS * s.sway - SWAY_DAMPING * s.swayVel + kick * 60) * dt;
      s.sway += s.swayVel * dt;
      s.sway = Math.max(-9, Math.min(9, s.sway));

      level.current = s.level;
      sway.value = s.sway;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      sub.remove();
      if (__DEV__) {
        delete (globalThis as DebugGlobal).__polaroidShake;
      }
    };
  }, [sway]);

  return { level, sway };
}
