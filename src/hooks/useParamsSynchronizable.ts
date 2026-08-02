import { useCallback, useRef } from 'react';
import { createSynchronizable } from 'react-native-worklets';
import { LIVE_FLOAT_COUNT } from '../shaders/uniforms';
import type { ParamsSynchronizable } from '../components/ShaderView/types';

/**
 * Creates a {@link ParamsSynchronizable} — a live float channel written into
 * the `u.live` / `u.liveData` slots of a {@link ShaderView} every frame. It has
 * its own uniform region, so it leaves all 8 static `params` untouched.
 *
 * The returned `setParamsSynchronizable` runs on the JS thread (call it from gesture or scroll
 * handlers); the values are read by the off-thread render loop. By convention
 * the first four floats carry `(x, y, active, extra)` for pointer input, or
 * `(progress, ...)` for scroll-driven effects — but the meaning is up to the
 * shader consuming `u.live`.
 *
 * Pass `initial` to seed the channel's starting value (read once on first
 * render), so the shader has a sane resting state before the first update —
 * e.g. `[0.5, 0.5, 0, 0]` to start a pointer at screen center. Defaults to all
 * zeros.
 *
 * The channel's length is fixed at the length of `initial` (min 4, max
 * {@link LIVE_FLOAT_COUNT}). The first 4 floats land in `u.live`; floats 4+
 * fill `u.liveData` vec4-by-vec4 — seed a longer `initial` for trail /
 * multi-point effects. `setParamsSynchronizable` replaces the whole channel:
 * slots beyond the values provided reset to 0.
 */
export function useParamsSynchronizable(
  initial: readonly number[] = [0, 0, 0, 0]
): {
  paramsSynchronizable: ParamsSynchronizable;
  setParamsSynchronizable: (...values: number[]) => void;
} {
  // Lazily create once; `initial` is only a seed, so it is read on first render
  // and ignored thereafter. Its length fixes the channel size for the lifetime
  // of the hook.
  const ref = useRef<ParamsSynchronizable | null>(null);
  if (ref.current === null) {
    const size = Math.max(4, Math.min(initial.length, LIVE_FLOAT_COUNT));
    const seed = new Float64Array(size);
    for (let i = 0; i < Math.min(initial.length, size); i++) {
      seed[i] = initial[i]!;
    }
    ref.current = createSynchronizable<Float64Array>(seed);
  }
  const paramsSynchronizable = ref.current;

  const setParamsSynchronizable = useCallback(
    (...values: number[]) => {
      paramsSynchronizable.setBlocking((prev) => {
        const next = new Float64Array(prev.length);
        for (let i = 0; i < Math.min(values.length, next.length); i++) {
          next[i] = values[i]!;
        }
        return next;
      });
    },
    [paramsSynchronizable]
  );

  return { paramsSynchronizable, setParamsSynchronizable };
}
