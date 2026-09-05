import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Spring that carries the candle's own tilt (rad). Stiff — it IS the hand. */
const TILT_STIFFNESS = 140;
const TILT_DAMPING = 17;
/** Hot gas has inertia: the flame leans on a softer, ringier spring. */
const LEAN_STIFFNESS = 80;
const LEAN_DAMPING = 9;
/** How far the flame is dragged behind a fast rotation (s). */
const LEAN_DRAG = 0.13;
/** Flame envelope rates: catching is slower than being blown out. */
const IGNITE_RATE = 9;
const SNUFF_RATE = 22;
/** Flare that follows the relight (s). */
const FLARE_TAU = 0.2;
/** How long the wisp of smoke lingers after the flame is out (s). */
const SMOKE_DURATION = 4.2;
/** How long the wick tip stays red after the flame is gone (s). */
const EMBER_DURATION = 2.6;
/** Breath envelope: fast attack, slower release (s). */
const GUST_ATTACK = 0.05;
const GUST_RELEASE = 0.22;
/**
 * Snuff budget. Breath above `GUST_SNUFF_LEVEL` pays into it, anything below
 * drains it; the flame goes out once it holds `SNUFF_BUDGET` seconds. So a
 * sustained puff kills the candle but a cough or a loud room only makes it
 * gutter.
 */
const GUST_SNUFF_LEVEL = 0.45;
const SNUFF_BUDGET = 0.14;
/** Breath below this is treated as silence for choosing a lean side. */
const GUST_ONSET = 0.12;
/** How hard a full breath bends the flame over (screen-space lean). */
const GUST_LEAN = 0.85;

type CandleSim = {
  /** In-plane gravity angle from the sensor (rad), confidence-blended. */
  tiltTarget: number;
  tilt: number;
  tiltVel: number;
  /** Horizontal component of the flame's up-vector, screen space. */
  lean: number;
  leanVel: number;
  lit: boolean;
  flame: number;
  flare: number;
  smokeAge: number;
  emberAge: number;
  /** Raw breath level from the mic (0..1), latest sample. */
  breath: number;
  /** Debugger override for the breath; while set, the mic is ignored. */
  breathOverride: number | null;
  /** Envelope-followed breath the flame actually feels. */
  gust: number;
  /** Which way the current gust pushes the flame: -1 or +1. */
  gustDir: number;
  snuffBudget: number;
  /** Integrated turbulence phase — never time x varying speed. */
  phase: number;
};

/**
 * The physics of a birthday candle.
 *
 * Two inputs. The accelerometer tilts the candle with the phone while the
 * flame keeps pointing at the ceiling — the same in-plane gravity angle and
 * lagging lean spring as the lighter. The microphone is the breath: its level
 * runs through a fast-attack envelope into `gust`, which bends the flame over
 * (to a side picked fresh for each puff), shrinks it, and stirs its
 * turbulence. Blow hard enough for long enough and the snuff budget fills:
 * the flame collapses, the wick tip glows red for a couple of seconds and a
 * wisp of smoke goes up. A tap relights it.
 *
 * Writes the live channel every frame:
 * `u.live = (flame 0..1, lean, flare 0..1, smoke 0..1)`,
 * `u.liveData[0] = (turbulencePhase, smokeAge 0..1, gust 0..1, emberAge 0..1)`.
 */
export function useCandlePhysics(options: { onOut?: () => void } = {}): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** Feed the latest breath level (0..1) — call it from the mic loop. */
  setBreath: (level: number) => void;
  /** Light it (or light it again after it has been blown out). */
  light: () => void;
  /** Put it out by hand, as if pinched. */
  snuff: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([1, 0, 0, 0, 0, 1, 0, 1]);

  const onOutRef = useRef(options.onOut);
  onOutRef.current = options.onOut;

  const simRef = useRef<CandleSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      tiltTarget: 0,
      tilt: 0,
      tiltVel: 0,
      lean: 0,
      leanVel: 0,
      lit: true,
      flame: 1,
      flare: 0,
      smokeAge: 1,
      emberAge: 1,
      breath: 0,
      breathOverride: null,
      gust: 0,
      gustDir: 1,
      snuffBudget: 0,
      phase: 0,
    };
  }

  // Accelerometer -> in-plane gravity angle. Upright portrait reads y ~ -1,
  // and a positive angle means the phone's right-hand side has dropped.
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
          const s = simRef.current as CandleSim;
          const reading = Math.atan2(x, -y);
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);

          // Weak in-plane signal (phone near-flat) HOLDS the last angle.
          let delta = reading - s.tiltTarget;
          if (delta > Math.PI) {
            delta -= 2 * Math.PI;
          } else if (delta < -Math.PI) {
            delta += 2 * Math.PI;
          }
          s.tiltTarget += delta * conf * conf;
        });
      } catch {
        // No accelerometer (simulator) -> the candle just stands upright.
      }
    })();

    // The simulator has no accelerometer, and its mic (if the host lends it
    // one) hears nothing: let a debugger blow on the candle and tilt it.
    // `__candleBlow(level)` holds the breath at that level until
    // `__candleBlow(null)` hands control back to the mic.
    if (__DEV__) {
      const g = globalThis as {
        __candleBlow?: (level: number | null) => void;
        __candleTilt?: (rad: number) => void;
      };
      g.__candleBlow = (level: number | null) => {
        const s = simRef.current as CandleSim;
        if (level === null) {
          s.breathOverride = null;
          s.breath = 0;
          return;
        }
        s.breathOverride = Math.max(0, Math.min(1, level));
        s.breath = s.breathOverride;
      };
      g.__candleTilt = (rad: number) => {
        (simRef.current as CandleSim).tiltTarget = rad;
      };
    }

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        const g = globalThis as {
          __candleBlow?: unknown;
          __candleTilt?: unknown;
        };
        delete g.__candleBlow;
        delete g.__candleTilt;
      }
    };
  }, []);

  // Simulation loop: tilt spring, breath envelope, lean spring, flame
  // envelope, ember, smoke.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as CandleSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      s.tiltVel += (s.tiltTarget - s.tilt) * TILT_STIFFNESS * dt;
      s.tiltVel -= s.tiltVel * TILT_DAMPING * dt;
      s.tilt += s.tiltVel * dt;

      // Breath envelope: snaps up with the puff, lets go more slowly.
      const tau = s.breath > s.gust ? GUST_ATTACK : GUST_RELEASE;
      const wasQuiet = s.gust < GUST_ONSET;
      s.gust += (s.breath - s.gust) * Math.min(1, dt / tau);
      // Each new puff picks its own side, so the flame doesn't always fold the
      // same way and the next blow can catch it from the other side.
      if (wasQuiet && s.gust >= GUST_ONSET) {
        s.gustDir = Math.random() < 0.5 ? -1 : 1;
      }
      // Only a burning flame can be blown out, and it takes a held breath.
      if (s.lit) {
        s.snuffBudget += (s.gust - GUST_SNUFF_LEVEL) * dt;
        s.snuffBudget = Math.max(0, s.snuffBudget);
        if (s.snuffBudget >= SNUFF_BUDGET) {
          s.lit = false;
          s.snuffBudget = 0;
          s.smokeAge = 0;
          s.emberAge = 0;
          onOutRef.current?.();
        }
      }

      // The flame points at the ceiling, minus whatever the breath does to
      // it: a steady push to one side plus a wobble that grows with the gust.
      const wob =
        Math.sin(s.phase * 19.0) * 0.6 + Math.sin(s.phase * 7.3 + 1.7) * 0.4;
      const leanTarget =
        -Math.sin(s.tilt) -
        s.tiltVel * LEAN_DRAG * Math.cos(s.tilt) +
        s.gustDir * s.gust * GUST_LEAN +
        wob * s.gust * 0.35;
      s.leanVel += (leanTarget - s.lean) * LEAN_STIFFNESS * dt;
      s.leanVel -= s.leanVel * LEAN_DAMPING * dt;
      s.lean += s.leanVel * dt;

      const rate = s.lit ? IGNITE_RATE : SNUFF_RATE;
      s.flame += ((s.lit ? 1 : 0) - s.flame) * Math.min(1, rate * dt);
      if (!s.lit && s.flame < 0.002) {
        s.flame = 0;
      }
      s.flare *= Math.exp(-dt / FLARE_TAU);
      s.smokeAge = Math.min(1, s.smokeAge + dt / SMOKE_DURATION);
      s.emberAge = Math.min(1, s.emberAge + dt / EMBER_DURATION);

      // Smoke fades in as the flame dies, then thins out as it climbs.
      const age = s.smokeAge;
      const smoke =
        age >= 1
          ? 0
          : Math.min(1, age / 0.1) * Math.pow(1 - age, 1.3) * (1 - s.flame);

      // Turbulence runs faster under a breath and while the phone is moving.
      s.phase +=
        dt * (0.7 + s.flame * 0.4 + s.gust * 2.2 + Math.abs(s.tiltVel) * 0.22);

      setParamsSynchronizable(
        s.flame,
        s.lean,
        s.flare,
        smoke,
        s.phase,
        s.smokeAge,
        s.gust,
        s.emberAge
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const setBreath = useCallback((level: number) => {
    const s = simRef.current as CandleSim;
    if (s.breathOverride !== null) {
      return;
    }
    s.breath = Math.max(0, Math.min(1, level));
  }, []);

  const light = useCallback(() => {
    const s = simRef.current as CandleSim;
    if (s.lit) {
      return;
    }
    s.lit = true;
    s.flare = 1;
    s.snuffBudget = 0;
    s.smokeAge = 1;
    s.emberAge = 1;
  }, []);

  const snuff = useCallback(() => {
    const s = simRef.current as CandleSim;
    if (!s.lit) {
      return;
    }
    s.lit = false;
    s.snuffBudget = 0;
    s.smokeAge = 0;
    s.emberAge = 0;
    onOutRef.current?.();
  }, []);

  return { paramsSynchronizable, setBreath, light, snuff };
}
