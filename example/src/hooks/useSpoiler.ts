import { useCallback, useEffect, useRef } from 'react';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  useParamsSynchronizable,
  type ParamsSynchronizable,
} from 'react-native-effects';

// Telegram's spoiler timeline: the burst clears the text in about a third of a
// second, the text stays readable for a few seconds, then the cloud settles
// back over it.
export const BURST_MS = 420;
export const TEXT_FADE_MS = 240;
export const REVEAL_HOLD_MS = 5000;
export const REHIDE_MS = 480;
/** The particle field loops seamlessly every this many seconds. */
export const LOOP_S = 6;

export type SpoilerPhase = 'hidden' | 'revealing' | 'revealed' | 'hiding';

export type SpoilerRect = { x: number; y: number; w: number; h: number };

export type SpoilerDebugState = {
  id: string;
  phase: SpoilerPhase;
  revealed: boolean;
  /** Seconds since the last reveal started, or null while hidden. */
  sinceReveal: number | null;
  /** Window rect of the bubble, logical px, as last measured. */
  rect: SpoilerRect | null;
};

type Entry = {
  order: number;
  /** Reveal as if tapped at a normalised point of the bubble rect. */
  revealAt: (nx: number, ny: number) => void;
  hide: () => void;
  getState: () => SpoilerDebugState;
};

// Every mounted spoiler registers here so the dev globals can reach them by
// their order in the conversation.
const registry = new Map<string, Entry>();

/**
 * One hidden span's state machine, bridged into a ShaderView live channel as
 * `(cover, burst, tapX, tapY)`: `cover` is how much of the particle cloud is
 * drawn (1 hidden, 0 revealed), `burst` is how far the tap has blown the
 * particles outward, and the tap sits in canvas-local logical px.
 *
 * `textOpacity` drives the real text overlay so the reveal is the RN text
 * fading in under a cloud that flies apart, never a shader drawing type.
 */
export function useSpoiler({ id, order }: { id: string; order: number }): {
  paramsSynchronizable: ParamsSynchronizable;
  textOpacity: SharedValue<number>;
  /** Reveal from a tap at canvas-local logical px. */
  reveal: (x?: number, y?: number) => void;
  hide: () => void;
  /** Canvas size, so a reveal with no tap point can start from the centre. */
  setCanvasSize: (w: number, h: number) => void;
  /** Bubble's window rect, for the debug state. */
  setRect: (rect: SpoilerRect) => void;
} {
  const cover = useSharedValue(1);
  const burst = useSharedValue(0);
  const tapX = useSharedValue(0);
  const tapY = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  const phase = useRef<SpoilerPhase>('hidden');
  const revealedAt = useRef<number | null>(null);
  const canvas = useRef({ w: 0, h: 0 });
  const rect = useRef<SpoilerRect | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { paramsSynchronizable } = useParamsSynchronizable([1, 0, 0, 0]);
  useAnimatedReaction(
    () => [cover.value, burst.value, tapX.value, tapY.value] as const,
    ([c, b, x, y]) => {
      'worklet';
      paramsSynchronizable.setBlocking(() => Float64Array.of(c, b, x, y));
    }
  );

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const settleHidden = useCallback(() => {
    phase.current = 'hidden';
    revealedAt.current = null;
  }, []);
  const settleRevealed = useCallback(() => {
    if (phase.current === 'revealing') {
      phase.current = 'revealed';
    }
  }, []);

  const hide = useCallback(() => {
    if (phase.current === 'hidden' || phase.current === 'hiding') {
      return;
    }
    clearHold();
    phase.current = 'hiding';
    textOpacity.value = withTiming(0, { duration: TEXT_FADE_MS });
    // The particles come back at their resting places, not by replaying the
    // burst backwards; that is what Telegram does and it reads as settling.
    burst.value = 0;
    cover.value = withTiming(
      1,
      { duration: REHIDE_MS, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) {
          runOnJS(settleHidden)();
        }
      }
    );
  }, [burst, clearHold, cover, settleHidden, textOpacity]);

  const reveal = useCallback(
    (x?: number, y?: number) => {
      // Tapping revealed text does nothing; it hides again on its own.
      if (phase.current !== 'hidden') {
        return;
      }
      phase.current = 'revealing';
      revealedAt.current = Date.now();
      tapX.value = x ?? canvas.current.w / 2;
      tapY.value = y ?? canvas.current.h / 2;
      textOpacity.value = withTiming(1, {
        duration: TEXT_FADE_MS,
        easing: Easing.out(Easing.quad),
      });
      burst.value = withTiming(
        1,
        { duration: BURST_MS, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(settleRevealed)();
          }
        }
      );
      // The sparks linger while they fly and vanish late, so the flight reads
      // before the cloud is gone.
      cover.value = withTiming(0, {
        duration: BURST_MS,
        easing: Easing.in(Easing.cubic),
      });
      holdTimer.current = setTimeout(hide, REVEAL_HOLD_MS);
    },
    [burst, cover, hide, settleRevealed, tapX, tapY, textOpacity]
  );

  const setCanvasSize = useCallback((w: number, h: number) => {
    canvas.current = { w, h };
  }, []);
  const setRect = useCallback((r: SpoilerRect) => {
    rect.current = r;
  }, []);

  useEffect(() => {
    registry.set(id, {
      order,
      revealAt: (nx, ny) =>
        reveal(nx * canvas.current.w, ny * canvas.current.h),
      hide,
      getState: () => ({
        id,
        phase: phase.current,
        revealed: phase.current === 'revealed' || phase.current === 'revealing',
        sinceReveal:
          revealedAt.current === null
            ? null
            : (Date.now() - revealedAt.current) / 1000,
        rect: rect.current,
      }),
    });
    return () => {
      registry.delete(id);
    };
  }, [hide, id, order, reveal]);

  useEffect(() => clearHold, [clearHold]);

  return {
    paramsSynchronizable,
    textOpacity,
    reveal,
    hide,
    setCanvasSize,
    setRect,
  };
}

/**
 * Dev-only globals so the simulator, which cannot tap a text span with any
 * precision, can drive the spoilers:
 *  - `__spoilerReveal(index = 0, x = 0.5, y = 0.5)` — reveal spoiler `index`
 *    (in conversation order) as if tapped at that normalised point of its
 *    bubble.
 *  - `__spoilerHide(index = 0)` — hide it now.
 *  - `__spoilerState()` — every spoiler's phase, time since reveal and rect.
 */
export function useSpoilerDebugHooks() {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as Record<string, unknown>;
    const ordered = () =>
      [...registry.values()].sort((a, b) => a.order - b.order);
    g.__spoilerReveal = (index = 0, x = 0.5, y = 0.5) => {
      const entry = ordered()[index];
      if (!entry) {
        return false;
      }
      entry.revealAt(x, y);
      return true;
    };
    g.__spoilerHide = (index = 0) => {
      const entry = ordered()[index];
      if (!entry) {
        return false;
      }
      entry.hide();
      return true;
    };
    g.__spoilerState = () => ({
      spoilers: ordered().map((e) => e.getState()),
      loopPeriodS: LOOP_S,
    });
    return () => {
      delete g.__spoilerReveal;
      delete g.__spoilerHide;
      delete g.__spoilerState;
    };
  }, []);
}
