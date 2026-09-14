import { useEffect } from 'react';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  useParamsSynchronizable,
  type ParamsSynchronizable,
} from 'react-native-effects';

/**
 * A one-shot 0..1 progress for a screen effect, bridged into a ShaderView
 * live channel as `u.live.x`. Runs linearly over `durationMs` from mount and
 * calls `onDone` once, so the effect's owner can unmount it; the shader
 * shapes its own envelope from the linear progress.
 */
export function useEffectProgress(
  durationMs: number,
  onDone: () => void
): ParamsSynchronizable {
  const progress = useSharedValue(0);
  const { paramsSynchronizable } = useParamsSynchronizable([0, 0, 0, 0]);

  useAnimatedReaction(
    () => progress.value,
    (p) => {
      'worklet';
      paramsSynchronizable.setBlocking(() => Float64Array.of(p, 0, 0, 0));
    }
  );

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: durationMs, easing: Easing.linear },
      (finished) => {
        if (finished) {
          runOnJS(onDone)();
        }
      }
    );
    // Play once from mount; a re-render must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return paramsSynchronizable;
}
