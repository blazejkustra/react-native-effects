import {
  type ComponentRef,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

/** Wallpaper decode and layout settle before the snapshot is taken. */
const SETTLE_MS = 450;

async function snapshot(view: RefObject<ComponentRef<typeof View> | null>) {
  const raw = await captureRef(view, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });
  return raw.startsWith('file://') ? raw : `file://${raw}`;
}

/**
 * Snapshots a view into a PNG for a ShaderView `texture`. Call `schedule()`
 * once the view has laid out, or `invalidate()` when its size changes so a
 * stretched stale snapshot is never shown. The latest snapshot wins and the
 * previous file is released.
 */
export function useSnapshotTexture(
  view: RefObject<ComponentRef<typeof View> | null>
) {
  const [uri, setUri] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const capture = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const next = await snapshot(view);
      if (gen !== generation.current) {
        releaseCapture(next);
        return;
      }
      setUri((prev) => {
        if (prev) {
          releaseCapture(prev);
        }
        return next;
      });
    } catch (e) {
      console.warn('[cracks] snapshot failed:', e);
    }
  }, [view]);

  const schedule = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(capture, SETTLE_MS);
  }, [capture]);

  const invalidate = useCallback(() => {
    generation.current++;
    setUri((prev) => {
      if (prev) {
        releaseCapture(prev);
      }
      return null;
    });
    schedule();
  }, [schedule]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  return { uri, schedule, invalidate };
}
