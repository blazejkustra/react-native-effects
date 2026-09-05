import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** A cigarette left alone burns to the filter in this long (s). */
const SMOLDER_TIME = 360;
/** Pulling on it burns the tobacco this much faster on top. */
const DRAW_TIME = 20;
/** How much of the tobacco's length the ash can grow to before it drops. */
const ASH_MAX = 0.26;
/** Press shorter than this is a tap (flick the ash / light up), not a drag. */
const TAP_MAX = 0.22;
/** A drag only starts to pull once the finger has been down this long (s). */
const DRAW_DELAY = 0.1;
const DRAW_IN_RATE = 4.5;
const DRAW_OUT_RATE = 3.0;
/** How long the after-drag surge of smoke takes to climb out of the picture (s). */
const PUFF_DURATION = 3.4;
/** How long a dropped piece of ash stays in the picture (s). */
const CHUNK_DURATION = 1.6;
/** Fade out the spent butt, fade in a fresh one (s). */
const SWAP_DURATION = 0.9;
const SWAP_CROSS = 0.4;
/** Match-flare on lighting up (s). */
const FLARE_TAU = 0.45;
/** Ember envelope rates: catching is slow, dying at the filter slower. */
const EMBER_IN_RATE = 1.6;
const EMBER_OUT_RATE = 0.7;
/** Spring that carries the phone's in-plane tilt (rad). */
const TILT_STIFFNESS = 120;
const TILT_DAMPING = 16;

type CigaretteSim = {
  lit: boolean;
  ember: number;
  burn: number;
  ash: number;
  pressing: boolean;
  pressStart: number;
  draw: number;
  puff: number;
  puffAge: number;
  /** The piece of ash in the air: its length, sideways kick and age. */
  chunkLen: number;
  chunkKick: number;
  chunkAge: number;
  swapAge: number;
  flare: number;
  /** In-plane gravity angle from the sensor (rad), confidence-blended. */
  tiltTarget: number;
  tilt: number;
  tiltVel: number;
  /** Integrated turbulence phase — never time x varying speed. */
  phase: number;
};

/**
 * The physics of a lit cigarette.
 *
 * It smoulders on its own: the coal creeps down the tobacco, the ash grows
 * above it and breaks off by itself once it gets long. Hold a finger down to
 * take a drag — the coal flares, the tobacco burns faster and the sidestream
 * plume is pulled thin — and let go for the surge of smoke that follows. A
 * tap knocks the ash off: the column detaches, tumbles and falls. Once the
 * coal reaches the filter it goes out, and a tap swaps in a fresh one.
 *
 * The smoke rises toward the real ceiling: `atan2(x, -y)` is the same
 * in-plane gravity angle the lighter uses, blended by confidence² so a phone
 * lying flat holds its last angle, and carried on a stiff spring so the plume
 * bends with a twist instead of snapping.
 *
 * Writes the live channel every frame:
 * `u.live = (ember 0..1, draw 0..1, puff 0..1, tilt rad)`,
 * `u.liveData[0] = (turbulencePhase, burn 0..1, ash 0..1, puffAge 0..1)`,
 * `u.liveData[1] = (flick 0..1, chunkAge 0..1, flare 0..1, visibility 0..1)`,
 * `u.liveData[2] = (chunkLen 0..1, chunkKick -1..1, 0, 0)`.
 * `burn`, `ash` and `chunkLen` are fractions of the tobacco's length.
 */
export function useCigarettePhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  pressIn: () => void;
  pressOut: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0]);

  const simRef = useRef<CigaretteSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      lit: true,
      ember: 0,
      burn: 0.04,
      ash: 0.05,
      pressing: false,
      pressStart: 0,
      draw: 0,
      puff: 0,
      puffAge: 1,
      chunkLen: 0,
      chunkKick: 0,
      chunkAge: 1,
      swapAge: 1,
      flare: 1,
      tiltTarget: 0,
      tilt: 0,
      tiltVel: 0,
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
          const s = simRef.current as CigaretteSim;
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
        // No accelerometer (simulator) -> the smoke just rises straight up.
      }
    })();

    // The simulator has no accelerometer and no patience: let a debugger
    // feed the tilt, and skip ahead along the burn.
    if (__DEV__) {
      const g = globalThis as {
        __cigTilt?: (rad: number) => void;
        __cigBurn?: (burn: number) => void;
      };
      g.__cigTilt = (rad: number) => {
        (simRef.current as CigaretteSim).tiltTarget = rad;
      };
      g.__cigBurn = (burn: number) => {
        (simRef.current as CigaretteSim).burn = burn;
      };
    }

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        const g = globalThis as { __cigTilt?: unknown; __cigBurn?: unknown };
        delete g.__cigTilt;
        delete g.__cigBurn;
      }
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as CigaretteSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      s.tiltVel += (s.tiltTarget - s.tilt) * TILT_STIFFNESS * dt;
      s.tiltVel -= s.tiltVel * TILT_DAMPING * dt;
      s.tilt += s.tiltVel * dt;

      // Drag envelope: only once the press has outlived a tap.
      const held = s.pressing ? (now - s.pressStart) / 1000 : 0;
      const drawing = s.lit && s.pressing && held > DRAW_DELAY;
      const drawRate = drawing ? DRAW_IN_RATE : DRAW_OUT_RATE;
      s.draw += ((drawing ? 1 : 0) - s.draw) * Math.min(1, drawRate * dt);

      // The coal eats the tobacco; the ash is whatever it leaves behind.
      if (s.lit) {
        const dBurn = dt * (1 / SMOLDER_TIME + s.draw / DRAW_TIME);
        s.burn = Math.min(1, s.burn + dBurn);
        s.ash = Math.min(ASH_MAX, s.ash + dBurn);
        if (s.ash >= ASH_MAX) {
          // Too long to hold itself up: it breaks off, barely kicked.
          dropAsh(s, Math.random() < 0.5 ? -0.12 : 0.12);
        }
        if (s.burn >= 1) {
          s.lit = false;
        }
      }
      const emberRate = s.lit ? EMBER_IN_RATE : EMBER_OUT_RATE;
      s.ember += ((s.lit ? 1 : 0) - s.ember) * Math.min(1, emberRate * dt);
      if (!s.lit && s.ember < 0.002) {
        s.ember = 0;
      }

      // Swapping in a fresh one: fade the butt out, reset, fade in.
      if (s.swapAge < 1) {
        const before = s.swapAge;
        s.swapAge = Math.min(1, s.swapAge + dt / SWAP_DURATION);
        if (before < SWAP_CROSS && s.swapAge >= SWAP_CROSS) {
          s.lit = true;
          s.burn = 0;
          s.ash = 0;
          s.chunkAge = 1;
          s.flare = 1;
          s.puffAge = 1;
        }
      }
      const vis =
        s.swapAge >= 1
          ? 1
          : s.swapAge < SWAP_CROSS
            ? 1 - s.swapAge / SWAP_CROSS
            : (s.swapAge - SWAP_CROSS) / (1 - SWAP_CROSS);

      s.puffAge = Math.min(1, s.puffAge + dt / PUFF_DURATION);
      s.chunkAge = Math.min(1, s.chunkAge + dt / CHUNK_DURATION);
      s.flare *= Math.exp(-dt / FLARE_TAU);

      const puff = s.puffAge >= 1 ? 0 : s.puff * Math.pow(1 - s.puffAge, 0.7);
      const flick = s.chunkAge >= 1 ? 0 : 1;

      // Turbulence runs faster while air is being pulled through the tip.
      s.phase += dt * (0.75 + 0.45 * s.draw + 0.35 * puff);

      setParamsSynchronizable(
        s.ember,
        s.draw,
        puff,
        s.tilt,
        s.phase,
        s.burn,
        s.ash,
        s.puffAge,
        flick,
        s.chunkAge,
        s.flare,
        vis,
        s.chunkLen,
        s.chunkKick,
        0,
        0
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const pressIn = useCallback(() => {
    const s = simRef.current as CigaretteSim;
    s.pressing = true;
    s.pressStart = performance.now();
  }, []);

  const pressOut = useCallback(() => {
    const s = simRef.current as CigaretteSim;
    if (!s.pressing) {
      return;
    }
    s.pressing = false;
    const held = (performance.now() - s.pressStart) / 1000;

    if (held < TAP_MAX) {
      if (!s.lit && s.swapAge >= 1) {
        // Spent, or dying: swap in a fresh one.
        s.swapAge = 0;
      } else if (s.lit) {
        dropAsh(s, Math.random() < 0.5 ? -1 : 1);
      }
      return;
    }

    // Letting go after a real drag: the coal is at its hottest and the
    // sidestream surges.
    if (s.draw > 0.3) {
      s.puff = s.draw;
      s.puffAge = 0;
    }
  }, []);

  return { paramsSynchronizable, pressIn, pressOut };
}

/** Knock the ash column off. `kick` is the sideways impulse, -1..1. */
function dropAsh(s: CigaretteSim, kick: number) {
  if (s.ash < 0.015) {
    return;
  }
  s.chunkLen = s.ash;
  s.chunkKick = kick;
  s.chunkAge = 0;
  s.ash = 0;
  // Freshly bared coal glows brighter for a moment.
  s.flare = Math.max(s.flare, 0.45);
}
