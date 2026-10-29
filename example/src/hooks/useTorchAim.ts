import { useEffect, useRef } from 'react';
import { DeviceMotion } from 'expo-sensors';

/** Radians of tilt that swing the spot from the centre to the screen edge. */
const REACH_RAD = 0.42;

type Aim = { x: number; y: number };

function clampUnit(v: number) {
  return Math.max(-1, Math.min(1, v));
}

/**
 * Where the phone points, as `{ x, y }` in -1..1 (0 = the pose the phone had
 * when the screen opened). Read the returned ref every frame.
 *
 * `__torchAim(x, y)` holds the aim (the simulator has no motion sensor);
 * `__torchAim(null)` hands it back to the sensor.
 */
export function useTorchAim() {
  const aim = useRef<Aim>({ x: 0, y: 0 });
  const override = useRef<Aim | null>(null);

  useEffect(() => {
    let neutral: { beta: number; gamma: number } | null = null;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    const listen = async () => {
      const available = await DeviceMotion.isAvailableAsync().catch(
        () => false
      );
      if (!available || cancelled) return;
      DeviceMotion.setUpdateInterval(16);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation || override.current) return;
        neutral ??= { beta: rotation.beta, gamma: rotation.gamma };
        aim.current = {
          x: clampUnit((rotation.gamma - neutral.gamma) / REACH_RAD),
          y: clampUnit(-(rotation.beta - neutral.beta) / REACH_RAD),
        };
      });
    };
    listen();

    if (__DEV__) {
      const g = globalThis as {
        __torchAim?: (x: number | null, y?: number) => void;
      };
      g.__torchAim = (x, y = 0) => {
        if (x === null) {
          override.current = null;
          return;
        }
        override.current = { x: clampUnit(x), y: clampUnit(y) };
        aim.current = override.current;
      };
    }

    return () => {
      cancelled = true;
      sub?.remove();
      if (__DEV__) {
        delete (globalThis as { __torchAim?: unknown }).__torchAim;
      }
    };
  }, []);

  return aim;
}
