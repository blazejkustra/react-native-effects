import { useCallback, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';
import { CRACK_CHANNEL_LENGTH, MAX_IMPACTS } from './CrackedGlass';

/** The crack runs out from the impact over this long. */
const GROW_MS = 120;
const TILT_SMOOTHING = 0.15;

type Impact = {
  x: number;
  y: number;
  seed: number;
  strength: number;
  start: number;
};

type Tilt = { x: number; y: number };

function grown(impact: Impact, now: number) {
  const t = Math.min(1, (now - impact.start) / GROW_MS);
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Impacts and tilt for {@link CrackedGlass}. `hit(x, y)` cracks the glass at
 * a point (logical px) with a short buzz; past {@link MAX_IMPACTS} the oldest
 * impact is replaced. Tilt moves the light the crack edges catch: the
 * accelerometer on a device, or `__crackTilt(x, y)` in `__DEV__` (0.5, 0.5
 * is flat; `null` hands control back to the sensor).
 */
export function useCrackedGlass() {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(new Array(CRACK_CHANNEL_LENGTH).fill(0));
  const impacts = useRef<Impact[]>([]);
  const tilt = useRef<Tilt>({ x: 0.5, y: 0.5 });
  const tiltOverride = useRef<Tilt | null>(null);
  const raf = useRef(0);

  const write = useCallback(
    (now: number) => {
      const t = tiltOverride.current ?? tilt.current;
      const data = [impacts.current.length, t.x, t.y, 0];
      for (const impact of impacts.current) {
        data.push(impact.x, impact.y, grown(impact, now), impact.seed);
        data.push(impact.strength, 0, 0, 0);
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
      const growing = impacts.current.some((i) => grown(i, now) < 1);
      raf.current = growing ? requestAnimationFrame(step) : 0;
    };
    if (!raf.current) {
      raf.current = requestAnimationFrame(step);
    }
  }, [write]);

  const hit = useCallback(
    (x: number, y: number) => {
      const impact: Impact = {
        x,
        y,
        seed: Math.random(),
        strength: 0.85 + Math.random() * 0.3,
        start: performance.now(),
      };
      impacts.current = [...impacts.current, impact].slice(-MAX_IMPACTS);
      Vibration.vibrate(40);
      animate();
    },
    [animate]
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
      __crackHit?: (x: number, y: number) => void;
    };
    g.__crackTilt = (x, y = 0.5) => {
      tiltOverride.current = x === null ? null : { x, y };
      write(performance.now());
    };
    g.__crackHit = hit;
    return () => {
      delete g.__crackTilt;
      delete g.__crackHit;
    };
  }, [hit, write]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { paramsSynchronizable, hit, reset };
}
