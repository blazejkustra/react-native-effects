import { useEffect, useRef } from 'react';
import { DeviceMotion } from 'expo-sensors';

/** Radians of tilt away from the resting hold that reach the full -1..1. */
const FULL_TILT_RAD = 0.45;
/** The resting hold drifts with the hand; follow it slowly (s). */
const BASELINE_TAU = 2.5;
const SMOOTH_TAU = 0.08;

type TiltState = {
  x: number;
  y: number;
  baseBeta: number | null;
  baseGamma: number;
  rawX: number;
  rawY: number;
  override: { x: number; y: number } | null;
};

type DebugHook = (x: number | null, y?: number) => void;

/**
 * Tilt of the phone relative to how it is being held, as `x` (roll) and `y`
 * (pitch) in -1..1, smoothed. The baseline follows the hand slowly, so the
 * card rests flat however the phone is held and only the motion reads.
 * In dev builds `globalThis[debugName](x, y)` overrides the sensor; `null`
 * hands control back.
 */
export function useHoldTilt(debugName: string): React.RefObject<TiltState> {
  const state = useRef<TiltState>({
    x: 0,
    y: 0,
    baseBeta: null,
    baseGamma: 0,
    rawX: 0,
    rawY: 0,
    override: null,
  });

  useEffect(() => {
    const s = state.current;
    let last = Date.now();
    DeviceMotion.setUpdateInterval(16);
    const sub = DeviceMotion.addListener(({ rotation }) => {
      if (!rotation) {
        return;
      }
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (s.baseBeta === null) {
        s.baseBeta = rotation.beta;
        s.baseGamma = rotation.gamma;
      }
      const k = Math.min(1, dt / BASELINE_TAU);
      s.baseBeta += (rotation.beta - s.baseBeta) * k;
      s.baseGamma += (rotation.gamma - s.baseGamma) * k;
      s.rawX = clampUnit((rotation.gamma - s.baseGamma) / FULL_TILT_RAD);
      s.rawY = clampUnit((rotation.beta - s.baseBeta) / FULL_TILT_RAD);
    });

    if (__DEV__) {
      const hook: DebugHook = (x, y = 0) => {
        s.override = x === null ? null : { x, y };
      };
      (globalThis as Record<string, unknown>)[debugName] = hook;
    }

    let frame = 0;
    let prev = Date.now();
    const step = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const tx = s.override ? s.override.x : s.rawX;
      const ty = s.override ? s.override.y : s.rawY;
      const k = Math.min(1, dt / SMOOTH_TAU);
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      sub.remove();
      if (__DEV__) {
        delete (globalThis as Record<string, unknown>)[debugName];
      }
    };
  }, [debugName]);

  return state;
}

function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
