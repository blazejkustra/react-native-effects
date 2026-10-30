import { useCallback, useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { useParamsSynchronizable } from 'react-native-effects';
import { FAILURE_STAGES } from './HingeFailure';

/** How long each stage takes to set in: crack, colour lines, ink, spread. */
const STAGE_MS = [650, 700, 1300, 1700];
/** The panel looks healthy for a beat before it starts to go. */
const START_DELAY_MS = 900;
const GLITCH_MS = 320;

type State = {
  target: number;
  damage: number;
  damageOverride: number | null;
  glitch: number;
  last: number;
};

function approach(value: number, target: number, step: number) {
  return value < target
    ? Math.min(target, value + step)
    : Math.max(target, value - step);
}

/**
 * Drives {@link HingeFailure}. `play()` shows a healthy panel for a moment and
 * then lets the hinge fail through every stage on its own, `advance()` skips
 * to the next stage (or replays once fully broken), `reset()` puts a fresh
 * panel in. Every new stage lands with a short glitch. In `__DEV__`,
 * `__crackgateDamage(0..4)` pins the damage and `null` hands it back.
 */
export function useHingeFailure() {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 0, 0]);
  const state = useRef<State>({
    target: 0,
    damage: 0,
    damageOverride: null,
    glitch: 0,
    last: 0,
  });
  const raf = useRef(0);
  const startTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const publish = useCallback(() => {
    const s = state.current;
    setParamsSynchronizable(s.damageOverride ?? s.damage, s.glitch, 0, 0);
  }, [setParamsSynchronizable]);

  const step = useCallback(
    (now: number) => {
      const s = state.current;
      const dt = Math.min(64, now - (s.last || now));
      s.last = now;
      const before = Math.floor(s.damage);
      const stageMs = STAGE_MS[Math.min(before, 3)] ?? 1000;
      s.damage = approach(s.damage, s.target, dt / stageMs);
      if (Math.floor(s.damage) > before) {
        s.glitch = 1;
        Vibration.vibrate(25);
      }
      s.glitch = Math.max(0, s.glitch - dt / GLITCH_MS);
      publish();
      if (s.damage === s.target && s.glitch === 0) {
        raf.current = 0;
        s.last = 0;
        return;
      }
      raf.current = requestAnimationFrame(step);
    },
    [publish]
  );

  const kick = useCallback(() => {
    if (!raf.current) {
      raf.current = requestAnimationFrame(step);
    }
  }, [step]);

  const reset = useCallback(() => {
    clearTimeout(startTimer.current);
    const s = state.current;
    s.target = 0;
    s.damage = 0;
    s.glitch = 0;
    publish();
  }, [publish]);

  const play = useCallback(() => {
    reset();
    startTimer.current = setTimeout(() => {
      state.current.target = FAILURE_STAGES;
      kick();
    }, START_DELAY_MS);
  }, [kick, reset]);

  const advance = useCallback(() => {
    const s = state.current;
    if (s.damage >= FAILURE_STAGES) {
      play();
      return;
    }
    clearTimeout(startTimer.current);
    s.damage = Math.floor(s.damage) + 1;
    s.target = FAILURE_STAGES;
    s.glitch = 1;
    Vibration.vibrate(25);
    kick();
  }, [kick, play]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as {
      __crackgateDamage?: (value: number | null) => void;
    };
    g.__crackgateDamage = (value) => {
      state.current.damageOverride =
        value === null ? null : Math.max(0, Math.min(FAILURE_STAGES, value));
      publish();
    };
    return () => {
      delete g.__crackgateDamage;
    };
  }, [publish]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(startTimer.current);
    },
    []
  );

  return { paramsSynchronizable, play, advance, reset };
}
