import { useCallback, useEffect, useRef } from 'react';
import { useParamsSynchronizable } from 'react-native-effects';

/**
 * Detachment bands. The seeds leave the head in a fixed order (downwind rim
 * first, centre last); that order is cut into this many bands, and the moment
 * each band let go is what the shader needs to fly its seeds. Two floats per
 * band (time, wind distance) are shipped in `u.liveData[1..]`.
 */
export const DANDELION_BANDS = 64;
const BAND_FLOATS = DANDELION_BANDS * 2;
/** 4 (`u.live`) + 4 (`u.liveData[0]`) + the bands. */
export const DANDELION_CHANNEL_LENGTH = 8 + BAND_FLOATS;

/** Breath envelope: snaps up with the puff, lets go more slowly (s). */
const GUST_ATTACK = 0.05;
const GUST_RELEASE = 0.25;
/**
 * Breath below this does nothing to the head. A quiet room through the mic's
 * boost sits around 0.05–0.1; speech at arm's length brushes it; a puff at the
 * phone goes well past it.
 */
const GUST_FLOOR = 0.14;
/**
 * How fast breath energy strips the head, in fractions of the head per second
 * at a full breath. Energy scales with the SQUARE of the push, so a gentle
 * puff takes a few seeds and a hard blow the lot; a linear curve had a 0.35
 * puff held for a second strip half the head.
 */
const DETACH_RATE = 2.2;
/**
 * The release front does not track the energy continuously. It waits until
 * the energy is a WAVE ahead, then sweeps through that wave at FRONT_RATE
 * (fractions of the head per second) and stops again. Two reasons. Seeds
 * really do leave a clock in little bursts rather than one at a time. And the
 * shader can only gather a tuft whose origin it can invert to: neighbouring
 * cells that let go at very different moments have flown very different
 * distances, and the inversion tears. Inside a fast sweep neighbours are
 * released ~10 ms apart, so the seed field stays a smooth deformation of the
 * head however slowly the energy itself is climbing.
 */
const FRONT_RATE = 1.6;
const WAVE = 0.05;
/** Wind the loose seeds ride, logical px/s: a little always, plus the breath. */
const WIND_AMBIENT = 10;
const WIND_GAIN = 170;
/** How far the whole head leans into a full breath, logical px, and its spring. */
const LEAN_PX = 7;
const LEAN_STIFFNESS = 60;
const LEAN_DAMPING = 7;
/** Resting sway of the head on its stem, logical px. */
const SWAY_PX = 0.9;
/** Only push a new frame at the UI thread once something moved this far. */
const SYNC_EPSILON = 0.0005;

type DandelionSim = {
  /** Latest breath level from the mic (0..1). */
  breath: number;
  /** Debugger override; while set the mic is ignored. */
  breathOverride: number | null;
  /** Envelope-followed breath the head actually feels. */
  gust: number;
  /** Integrated breath energy, 0..1 — how much of the head has been earned off. */
  energy: number;
  /** Fraction of the seed order that has let go, 0..1 (trails `energy` in waves). */
  detached: number;
  /** True while the front is mid-sweep. */
  sweeping: boolean;
  /** Seconds since mount — the shader's clock for seed age. */
  time: number;
  /** Integrated wind distance, logical px — how far a seed loose since t=0 has travelled. */
  wind: number;
  /** Per band: the clock and wind distance when it let go, -1 while attached. */
  bandTime: Float64Array;
  bandWind: Float64Array;
  lean: number;
  leanVel: number;
  /** Integrated sway phase — never time x a varying rate. */
  swayPhase: number;
};

function makeSim(): DandelionSim {
  return {
    breath: 0,
    breathOverride: null,
    gust: 0,
    energy: 0,
    detached: 0,
    sweeping: false,
    time: 0,
    wind: 0,
    bandTime: new Float64Array(DANDELION_BANDS).fill(-1),
    bandWind: new Float64Array(DANDELION_BANDS).fill(0),
    lean: 0,
    leanVel: 0,
    swayPhase: 0,
  };
}

/**
 * The physics of blowing on a dandelion clock.
 *
 * One input: the microphone. Its level runs through a fast-attack envelope
 * into `gust`. Gust above a floor pays into `energy`, and the seeds let go in
 * a fixed order as the energy climbs — a puff takes a few from the downwind
 * rim, a held breath strips the head. Nothing comes back until `reset()`.
 *
 * Loose seeds ride the wind, whose speed is the ambient breeze plus the
 * current gust; the shader gets the integrated wind distance and the clock,
 * plus the moment each detachment band let go, so a seed's travel is simply
 * the wind distance since its own release.
 *
 * Writes the live channel every frame:
 * `u.live = (detached 0..1, 0, time s, wind px)`,
 * `u.liveData[0] = (lean px, sway px, 0, 0)`,
 * `u.liveData[1 + k/2]` = `(time, wind)` of bands `k` and `k+1`, -1 while attached.
 */
export function useDandelionPhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** Feed the latest breath level (0..1) — call it from the mic loop. */
  setBreath: (level: number) => void;
  /** Grow the head back. */
  reset: () => void;
  /** Fraction of the seeds gone, 0..1 (for UI copy). */
  getDetached: () => number;
} {
  const initial = useRef<number[] | null>(null);
  if (initial.current === null) {
    const arr = new Array<number>(DANDELION_CHANNEL_LENGTH).fill(0);
    for (let k = 0; k < DANDELION_BANDS; k++) {
      arr[8 + k * 2] = -1;
    }
    initial.current = arr;
  }
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(initial.current);

  const simRef = useRef<DandelionSim | null>(null);
  if (simRef.current === null) {
    simRef.current = makeSim();
  }
  const frame = useRef<number[]>(
    new Array<number>(DANDELION_CHANNEL_LENGTH).fill(0)
  );

  // The simulator's mic hears nothing: let a debugger blow on it.
  // `__dandelionBlow(level)` holds the breath at that level until
  // `__dandelionBlow(null)` hands control back to the mic.
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as {
      __dandelionBlow?: (level: number | null) => void;
      __dandelionReset?: () => void;
      __dandelionState?: () => Record<string, number | null>;
    };
    g.__dandelionBlow = (level: number | null) => {
      const s = simRef.current as DandelionSim;
      if (level === null) {
        s.breathOverride = null;
        s.breath = 0;
        return;
      }
      s.breathOverride = Math.max(0, Math.min(1, level));
      s.breath = s.breathOverride;
    };
    g.__dandelionReset = () => {
      const s = simRef.current as DandelionSim;
      s.energy = 0;
      s.detached = 0;
      s.sweeping = false;
      s.bandTime.fill(-1);
      s.bandWind.fill(0);
    };
    g.__dandelionState = () => {
      const s = simRef.current as DandelionSim;
      let bandsGone = 0;
      for (let k = 0; k < DANDELION_BANDS; k++) {
        if (s.bandTime[k]! >= 0) {
          bandsGone++;
        }
      }
      return {
        breath: s.breath,
        breathOverride: s.breathOverride,
        gust: s.gust,
        energy: s.energy,
        detached: s.detached,
        bandsGone,
        time: s.time,
        wind: s.wind,
        lean: s.lean,
      };
    };
    return () => {
      delete g.__dandelionBlow;
      delete g.__dandelionReset;
      delete g.__dandelionState;
    };
  }, []);

  // Simulation loop: breath envelope, energy -> detachment bands, wind, lean.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;
    let lastSent: number[] | null = null;

    const step = (now: number) => {
      const s = simRef.current as DandelionSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      s.time += dt;

      const tau = s.breath > s.gust ? GUST_ATTACK : GUST_RELEASE;
      s.gust += (s.breath - s.gust) * Math.min(1, dt / tau);
      const push = Math.max(0, s.gust - GUST_FLOOR) / (1 - GUST_FLOOR);
      const push2 = push * push;

      s.wind += dt * (WIND_AMBIENT + push2 * WIND_GAIN);

      if (push > 0 && s.energy < 1) {
        s.energy = Math.min(1, s.energy + push2 * DETACH_RATE * dt);
      }
      // The front sweeps once a wave's worth of energy is banked (or the head is
      // nearly gone), and keeps sweeping until it has caught the energy up.
      // Whatever is banked below a wave when the breath stops is released
      // then, so a puff ends with its last few seeds letting go rather than
      // holding on until the next one.
      const behind = s.energy - s.detached;
      if (
        behind > 0 &&
        (s.sweeping || behind >= WAVE || s.energy >= 1 || push === 0)
      ) {
        s.sweeping = true;
        s.detached = Math.min(s.energy, s.detached + FRONT_RATE * dt);
        if (s.detached >= s.energy) {
          s.sweeping = false;
        }
        // Every band whose start the front has now passed lets go this frame.
        for (let k = 0; k < DANDELION_BANDS; k++) {
          if (s.bandTime[k]! < 0 && s.detached >= k / DANDELION_BANDS) {
            s.bandTime[k] = s.time;
            s.bandWind[k] = s.wind;
          }
        }
      }

      // The head leans away from the breath and trembles a little in it.
      s.swayPhase += dt * (0.9 + s.gust * 6.0);
      const leanTarget =
        push * LEAN_PX + Math.sin(s.swayPhase * 3.1) * push * 1.6;
      s.leanVel += (leanTarget - s.lean) * LEAN_STIFFNESS * dt;
      s.leanVel -= s.leanVel * LEAN_DAMPING * dt;
      s.lean += s.leanVel * dt;
      const sway = Math.sin(s.swayPhase) * SWAY_PX;

      const f = frame.current;
      f[0] = s.detached;
      f[1] = 0; // spare
      f[2] = s.time;
      f[3] = s.wind;
      f[4] = s.lean;
      f[5] = sway;
      f[6] = 0;
      f[7] = 0;
      for (let k = 0; k < DANDELION_BANDS; k++) {
        f[8 + k * 2] = s.bandTime[k]!;
        f[9 + k * 2] = s.bandWind[k]!;
      }

      // Time and wind always move, so this is about not re-sending the band
      // table when nothing else changed — the setter copies the whole channel.
      let changed = lastSent === null;
      if (lastSent) {
        for (let i = 0; i < f.length; i++) {
          if (Math.abs(f[i]! - lastSent[i]!) > SYNC_EPSILON) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        setParamsSynchronizable(...f);
        lastSent = f.slice();
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const setBreath = useCallback((level: number) => {
    const s = simRef.current as DandelionSim;
    if (s.breathOverride !== null) {
      return;
    }
    s.breath = Math.max(0, Math.min(1, level));
  }, []);

  const reset = useCallback(() => {
    const s = simRef.current as DandelionSim;
    s.energy = 0;
    s.detached = 0;
    s.sweeping = false;
    s.bandTime.fill(-1);
    s.bandWind.fill(0);
  }, []);

  const getDetached = useCallback(
    () => (simRef.current as DandelionSim).detached,
    []
  );

  return { paramsSynchronizable, setBreath, reset, getDetached };
}
