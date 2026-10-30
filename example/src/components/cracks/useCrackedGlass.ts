import { useCallback, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';
import { CRACK_CHANNEL_LENGTH, MAX_IMPACTS } from './CrackedGlass';
import { useCrackSound } from './useCrackSound';

/** Shake, cracks, debris and the spreading ink blot all settle by then. */
const SETTLE_S = 2.5;
const DEAD_PIXEL_CHANCE = 0.45;
const TILT_SMOOTHING = 0.15;

type Impact = {
  x: number;
  y: number;
  seed: number;
  strength: number;
  deadPixels: boolean;
  start: number;
};

type Tilt = { x: number; y: number };
type ImpactOverrides = Partial<
  Pick<Impact, 'seed' | 'strength' | 'deadPixels'>
>;

function ageOf(impact: Impact, now: number, slowdown: number) {
  return Math.min(SETTLE_S, (now - impact.start) / 1000 / slowdown);
}

/**
 * Impacts and tilt for {@link CrackedGlass}. `hit(x, y)` cracks the glass at
 * a point (logical px) with a short buzz and a breaking-glass sound; past
 * {@link MAX_IMPACTS} the oldest impact is replaced. Tilt moves the light the
 * crack edges catch: the accelerometer on a device, or `__crackTilt(x, y)` in
 * `__DEV__` (0.5, 0.5 is flat; `null` hands control back to the sensor).
 * `__crackHit(x, y, { seed, strength, deadPixels })` repeats a given impact
 * and `__crackSlow(factor)` slows every impact animation by that factor.
 */
export function useCrackedGlass() {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(new Array(CRACK_CHANNEL_LENGTH).fill(0));
  const impacts = useRef<Impact[]>([]);
  const tilt = useRef<Tilt>({ x: 0.5, y: 0.5 });
  const tiltOverride = useRef<Tilt | null>(null);
  const raf = useRef(0);
  const slowdown = useRef(1);
  const playCrack = useCrackSound();

  const write = useCallback(
    (now: number) => {
      const t = tiltOverride.current ?? tilt.current;
      const data = [impacts.current.length, t.x, t.y, 0];
      for (const impact of impacts.current) {
        data.push(impact.x, impact.y, ageOf(impact, now, slowdown.current));
        data.push(impact.seed, impact.strength, impact.deadPixels ? 1 : 0);
        data.push(0, 0);
      }
      while (data.length < CRACK_CHANNEL_LENGTH) {
        data.push(0);
      }
      setParamsSynchronizable(...data);
    },
    [setParamsSynchronizable]
  );

  const animate = useCallback(() => {
    const step = (now: number) => {
      write(now);
      const growing = impacts.current.some(
        (i) => ageOf(i, now, slowdown.current) < SETTLE_S
      );
      raf.current = growing ? requestAnimationFrame(step) : 0;
    };
    if (!raf.current) {
      raf.current = requestAnimationFrame(step);
    }
  }, [write]);

  const hit = useCallback(
    (x: number, y: number, overrides?: ImpactOverrides) => {
      const impact: Impact = {
        x,
        y,
        seed: Math.random(),
        strength: 0.85 + Math.random() * 0.3,
        deadPixels: Math.random() < DEAD_PIXEL_CHANCE,
        start: performance.now(),
        ...overrides,
      };
      impacts.current = [...impacts.current, impact].slice(-MAX_IMPACTS);
      Vibration.vibrate(40);
      playCrack();
      animate();
    },
    [animate, playCrack]
  );

  const reset = useCallback(() => {
    impacts.current = [];
    write(performance.now());
  }, [write]);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok) {
          return;
        }
        Accelerometer.setUpdateInterval(33);
        sub = Accelerometer.addListener(({ x, y }) => {
          const t = tilt.current;
          t.x += (0.5 + x * 0.5 - t.x) * TILT_SMOOTHING;
          t.y += (0.5 + (y + 0.55) * 0.5 - t.y) * TILT_SMOOTHING;
          if (!raf.current && !tiltOverride.current) {
            write(performance.now());
          }
        });
      })
      .catch(() => {});
    return () => sub?.remove();
  }, [write]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as {
      __crackTilt?: (x: number | null, y?: number) => void;
      __crackHit?: (x: number, y: number, overrides?: ImpactOverrides) => void;
      __crackSlow?: (factor: number) => void;
    };
    g.__crackTilt = (x, y = 0.5) => {
      tiltOverride.current = x === null ? null : { x, y };
      write(performance.now());
    };
    g.__crackHit = hit;
    g.__crackSlow = (factor) => {
      slowdown.current = Math.max(1, factor);
    };
    return () => {
      delete g.__crackSlow;
      delete g.__crackTilt;
      delete g.__crackHit;
    };
  }, [hit, write]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { paramsSynchronizable, hit, reset };
}
