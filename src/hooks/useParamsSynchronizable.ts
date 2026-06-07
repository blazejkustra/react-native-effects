import { useCallback, useRef } from 'react';
import { createSynchronizable } from 'react-native-worklets';
import type { ParamsSynchronizable } from '../components/ShaderView/types';

/**
 * Creates a {@link ParamsSynchronizable} — a 4-float channel written into the
 * dedicated `u.live` slot of a {@link ShaderView} every frame. It has its own
 * uniform slot, so it leaves all 8 static `params` untouched.
 *
 * The returned `setParamsSynchronizable` runs on the JS thread (call it from gesture or scroll
 * handlers); the values are read by the off-thread render loop. By convention
 * the four floats carry `(x, y, active, extra)` for pointer input, or
 * `(progress, ...)` for scroll-driven effects — but the meaning is up to the
 * shader consuming `u.live`.
 *
 * Pass `initial` to seed the channel's starting value (read once on first
 * render), so the shader has a sane resting state before the first update —
 * e.g. `[0.5, 0.5, 0, 0]` to start a pointer at screen center. Defaults to all
 * zeros.
 */
export function useParamsSynchronizable(
  initial: readonly [number, number, number, number] = [0, 0, 0, 0]
): {
  paramsSynchronizable: ParamsSynchronizable;
  setParamsSynchronizable: (
    x: number,
    y: number,
    active: number,
    extra: number
  ) => void;
} {
  // Lazily create once; `initial` is only a seed, so it is read on first render
  // and ignored thereafter.
  const ref = useRef<ParamsSynchronizable | null>(null);
  if (ref.current === null) {
    ref.current = createSynchronizable<Float64Array>(
      Float64Array.of(initial[0], initial[1], initial[2], initial[3])
    );
  }
  const paramsSynchronizable = ref.current;

  const setParamsSynchronizable = useCallback(
    (x: number, y: number, active: number, extra: number) => {
      paramsSynchronizable.setBlocking(() =>
        Float64Array.of(x, y, active, extra)
      );
    },
    [paramsSynchronizable]
  );

  return { paramsSynchronizable, setParamsSynchronizable };
}
