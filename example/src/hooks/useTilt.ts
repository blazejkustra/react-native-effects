import { useEffect, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  createSynchronizable,
  type Synchronizable,
} from 'react-native-worklets';
import { useParamsSynchronizable } from 'react-native-effects';
import { Accelerometer } from 'expo-sensors';

const SENSITIVITY = 1.4;
const DRAG_SCALE = 260; // px of drag for a full tilt sweep

/**
 * Provides a tilt channel for a foil shader, written into `u.live` as
 * `(tiltX, tiltY, active, 0)` with `0.5, 0.5` meaning "flat".
 *
 * On a device with a motion sensor it reads the accelerometer (tilt the phone →
 * foil shifts). When no sensor is available — the iOS simulator, or a build
 * without `expo-sensors` linked — it silently falls back to the returned `pan`
 * gesture (drag → foil shifts), so the demo still works everywhere. The pan
 * runs as a worklet and writes the synchronizable directly, off the JS thread.
 */
export function useTilt(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  pan: ReturnType<typeof Gesture.Pan>;
  source: 'motion' | 'touch';
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0.5, 0.5, 0, 0]);
  const [source, setSource] = useState<'motion' | 'touch'>('touch');

  // Tilt at the moment a drag begins, so the pan moves relative to it.
  const panStartRef = useRef<Synchronizable<Float64Array> | null>(null);
  if (panStartRef.current === null) {
    panStartRef.current = createSynchronizable<Float64Array>(
      Float64Array.of(0.5, 0.5)
    );
  }
  const panStart = panStartRef.current;

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
          // Portrait: x is left/right tilt, y is top/bottom tilt (gravity).
          const tx = Math.min(1, Math.max(0, 0.5 + x * 0.5 * SENSITIVITY));
          const ty = Math.min(1, Math.max(0, 0.5 + y * 0.5 * SENSITIVITY));
          setParamsSynchronizable(tx, ty, 1, 0);
        });
        setSource('motion');
      } catch {
        // No accelerometer (simulator / module not linked) → pan fallback.
      }
    })();

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
    };
  }, [setParamsSynchronizable]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      const p = paramsSynchronizable.getDirty();
      panStart.setBlocking(() => Float64Array.of(p[0] || 0.5, p[1] || 0.5));
    })
    .onUpdate((e) => {
      'worklet';
      const start = panStart.getDirty();
      const tx = Math.min(
        1,
        Math.max(0, (start[0] || 0.5) + e.translationX / DRAG_SCALE)
      );
      // Drag up → tilt "up": subtract translationY.
      const ty = Math.min(
        1,
        Math.max(0, (start[1] || 0.5) - e.translationY / DRAG_SCALE)
      );
      paramsSynchronizable.setBlocking(() => Float64Array.of(tx, ty, 1, 0));
    });

  return { paramsSynchronizable, pan, source };
}
