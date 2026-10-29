import { useCallback, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { useParamsSynchronizable } from 'react-native-effects';
import { FAILURE_STAGES } from './HingeFailure';

/** How long each stage takes to set in: hairline, white row, colour lines, flicker. */
const STAGE_MS = [380, 150, 380, 900];
const FLEX_IN_MS = 700;
const FLEX_OUT_MS = 260;

type State = {
  stage: number;
  damage: number;
  damageOverride: number | null;
  flex: number;
  flexing: boolean;
  last: number;
};

function approach(value: number, target: number, step: number) {
  return value < target
    ? Math.min(target, value + step)
    : Math.max(target, value - step);
}

/**
 * Drives {@link HingeFailure}: `advance()` moves the panel one failure stage
 * further (each fold, unfold or flex) and plays the stages in between, `setFlexing` bends the crease while
 * the panel is held, `reset()` puts a fresh panel in. In `__DEV__`,
 * `__crackgateDamage(0..4)` pins the damage and `null` hands it back.
 */
export function useHingeFailure() {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 0, 0]);
  const state = useRef<State>({
    stage: 0,
    damage: 0,
    damageOverride: null,
    flex: 0,
    flexing: false,
    last: 0,
  });
  const raf = useRef(0);

  const step = useCallback(
    (now: number) => {
      const s = state.current;
      const dt = Math.min(64, now - (s.last || now));
      s.last = now;
      const stageMs = STAGE_MS[Math.min(Math.floor(s.damage), 3)] ?? 400;
      s.damage = s.damageOverride ?? approach(s.damage, s.stage, dt / stageMs);
      s.flex = approach(
        s.flex,
        s.flexing ? 1 : 0,
        dt / (s.flexing ? FLEX_IN_MS : FLEX_OUT_MS)
      );
      setParamsSynchronizable(s.damage, s.flex, 0, 0);
      const settled = s.damage === s.stage && s.flex === (s.flexing ? 1 : 0);
      if (settled || s.damageOverride !== null) {
        raf.current = 0;
        s.last = 0;
        return;
      }
      raf.current = requestAnimationFrame(step);
    },
    [setParamsSynchronizable]
  );

  const kick = useCallback(() => {
    if (!raf.current) {
      raf.current = requestAnimationFrame(step);
    }
  }, [step]);

  /** Moves at least one stage further and at least to `minStage`. */
  const advance = useCallback(
    (minStage = 0) => {
      const s = state.current;
      if (s.stage >= FAILURE_STAGES) {
        return;
      }
      s.stage = Math.min(FAILURE_STAGES, Math.max(s.stage + 1, minStage));
      if (s.stage <= 2) {
        Vibration.vibrate(30);
      }
      kick();
    },
    [kick]
  );

  const setFlexing = useCallback(
    (flexing: boolean) => {
      state.current.flexing = flexing;
      kick();
    },
    [kick]
  );

  const reset = useCallback(() => {
    const s = state.current;
    s.stage = 0;
    s.damage = 0;
    setParamsSynchronizable(0, s.flex, 0, 0);
    kick();
  }, [kick, setParamsSynchronizable]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as {
      __crackgateDamage?: (value: number | null) => void;
    };
    g.__crackgateDamage = (value) => {
      const s = state.current;
      s.damageOverride =
        value === null ? null : Math.max(0, Math.min(FAILURE_STAGES, value));
      if (value === null) {
        s.damage = s.stage;
      }
      setParamsSynchronizable(s.damageOverride ?? s.damage, s.flex, 0, 0);
    };
    return () => {
      delete g.__crackgateDamage;
    };
  }, [setParamsSynchronizable]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { paramsSynchronizable, advance, setFlexing, reset };
}
