import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Spring that carries the globe's own tilt (rad). Stiff — it IS the hand. */
const TILT_STIFFNESS = 120;
const TILT_DAMPING = 16;

/**
 * Shake detection. The accelerometer is differentiated sample to sample; a
 * hand at rest still jitters, so anything under `SHAKE_FLOOR` g of change is
 * treated as noise (the beer/lighter examples needed the same floor). What is
 * left is low-passed into `jerk` and mapped to a 0..1 drive.
 */
const SHAKE_FLOOR = 0.035;
const SHAKE_GAIN = 3.4;
const JERK_TAU = 0.09;

/**
 * Agitation envelope. Snow answers a shake immediately and then takes a long
 * time to settle — that slow release is the whole feel of the object, so the
 * two rates are deliberately far apart.
 */
const STIR_ATTACK = 0.07;
const STIR_RELEASE = 2.6;

/**
 * How much snow is in the air. Lags `stir` on the way down even further: the
 * globe keeps snowing for a few seconds after you stop moving it.
 */
const AIR_ATTACK = 0.16;
const AIR_RELEASE = 5.0;
/** A settled globe is never completely still — a few flakes always drift. */
const AIR_FLOOR = 0.022;

/** Fall speed in globe radii per second, at rest and fully stirred. */
const FALL_REST = 0.13;
const FALL_STIRRED = 0.52;
/** Swirl phase rate; the swirl amplitude itself is `stir` in the shader. */
const SWIRL_REST = 0.34;
const SWIRL_STIRRED = 2.9;

/**
 * Turning the globe drags the settled surface out of true on a soft spring,
 * so the drift lags the hand and overshoots slightly before it settles. Where
 * it settles is not level — the shader caps the lean at snow's angle of
 * repose — this spring is only the transient on the way there.
 */
const SURF_STIFFNESS = 42;
const SURF_DAMPING = 7.2;
/** How steeply the surface leans per rad/s of rotation. */
const SURF_DRAG = 0.16;
/** Ripples left on the surface by a shake; decay time (s). */
const WOBBLE_TAU = 1.7;

/** Debug shake impulses decay with this time constant (s). */
const KICK_TAU = 0.26;

type SnowSim = {
  /** In-plane gravity angle from the sensor (rad), confidence-blended. */
  tiltTarget: number;
  tilt: number;
  tiltVel: number;
  /** Debugger override for the tilt; while set, the sensor is ignored. */
  tiltOverride: number | null;
  /** Previous accelerometer sample, for differentiation. */
  prev: { x: number; y: number; z: number } | null;
  /** Low-passed |d(acceleration)| in g. */
  jerk: number;
  /** Decaying impulse from `__snowShake`, blended in as extra drive. */
  kick: number;
  /** Agitation, 0..1. */
  stir: number;
  /** Fraction of the snow that is airborne, 0..1. */
  airborne: number;
  /** Integrated fall phase — never time x varying speed. */
  fallPhase: number;
  /** Integrated swirl phase. */
  swirlPhase: number;
  /** Slope of the settled surface relative to level (rad-ish). */
  surfTilt: number;
  surfTiltVel: number;
  /** Ripple amplitude on the settled surface, 0..1. */
  wobble: number;
};

/**
 * The physics of a snow globe.
 *
 * One input: the accelerometer. Its in-plane gravity angle is the direction
 * the snow falls and the direction the settled snow slides toward, carried on
 * a stiff spring so the globe turns with the hand. Differentiating the same
 * signal gives a shake: past a noise floor it lifts snow off the pile
 * (`airborne`), speeds the fall up, and cranks the swirl amplitude, then
 * decays over several seconds while the snow comes back down. The settled
 * surface rides its own soft spring, so it lags a turn of the globe and
 * overshoots once before it comes to rest.
 *
 * Writes the live channel every frame:
 * `u.live = (tilt rad, stir 0..1, airborne 0..1, pile 0..1)`,
 * `u.liveData[0] = (fallPhase, swirlPhase, surfaceTilt, wobble 0..1)`.
 */
export function useSnowGlobePhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** Stir it by hand — a tap on the glass, or the debug hook. */
  shake: (strength?: number) => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, AIR_FLOOR, 1, 0, 0, 0, 0]);

  const simRef = useRef<SnowSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      tiltTarget: 0,
      tilt: 0,
      tiltVel: 0,
      tiltOverride: null,
      prev: null,
      jerk: 0,
      kick: 0,
      stir: 0,
      airborne: AIR_FLOOR,
      fallPhase: 0,
      swirlPhase: 0,
      surfTilt: 0,
      surfTiltVel: 0,
      wobble: 0,
    };
  }

  const shake = useCallback((strength = 1) => {
    const s = simRef.current as SnowSim;
    s.kick = Math.max(s.kick, Math.max(0, Math.min(1.5, strength)));
  }, []);

  // Accelerometer -> in-plane gravity angle + shake. Upright portrait reads
  // y ~ -1, and a positive angle means the phone's right-hand side has
  // dropped (same convention as the lighter and the candle).
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
        sub = Accelerometer.addListener(({ x, y, z }) => {
          const s = simRef.current as SnowSim;

          if (s.prev !== null) {
            const d = Math.hypot(x - s.prev.x, y - s.prev.y, z - s.prev.z);
            // One-pole low pass on the rectified jerk; the floor keeps a
            // resting hand from stirring the globe forever.
            const drive = Math.max(0, d - SHAKE_FLOOR) * SHAKE_GAIN;
            s.jerk += (drive - s.jerk) * 0.35;
          }
          s.prev = { x, y, z };

          if (s.tiltOverride !== null) {
            return;
          }
          const reading = Math.atan2(x, -y);
          // Weak in-plane signal (phone near-flat) HOLDS the last angle
          // instead of thrashing on atan2 noise.
          const conf = Math.min(1, Math.hypot(x, y) / 0.35);
          let delta = reading - s.tiltTarget;
          if (delta > Math.PI) {
            delta -= 2 * Math.PI;
          } else if (delta < -Math.PI) {
            delta += 2 * Math.PI;
          }
          s.tiltTarget += delta * conf * conf;
        });
      } catch {
        // No accelerometer (simulator) -> the globe just sits upright and the
        // debug hooks below are the only way to move it.
      }
    })();

    // The simulator has no accelerometer, so let a debugger shake and tilt it.
    // `__snowTilt(rad)` holds the gravity angle until `__snowTilt(null)` hands
    // control back to the sensor.
    if (__DEV__) {
      const g = globalThis as {
        __snowShake?: (strength?: number) => void;
        __snowTilt?: (rad: number | null) => void;
        __snowState?: () => Record<string, number | null>;
      };
      g.__snowShake = (strength = 1) => {
        const s = simRef.current as SnowSim;
        s.kick = Math.max(s.kick, Math.max(0, Math.min(1.5, strength)));
      };
      g.__snowTilt = (rad: number | null) => {
        const s = simRef.current as SnowSim;
        if (rad === null) {
          s.tiltOverride = null;
          return;
        }
        s.tiltOverride = rad;
        s.tiltTarget = rad;
      };
      g.__snowState = () => {
        const s = simRef.current as SnowSim;
        return {
          tilt: s.tilt,
          tiltTarget: s.tiltTarget,
          tiltOverride: s.tiltOverride,
          stir: s.stir,
          airborne: s.airborne,
          fallPhase: s.fallPhase,
          surfTilt: s.surfTilt,
          wobble: s.wobble,
        };
      };
    }

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        const g = globalThis as {
          __snowShake?: unknown;
          __snowTilt?: unknown;
          __snowState?: unknown;
        };
        delete g.__snowShake;
        delete g.__snowTilt;
        delete g.__snowState;
      }
    };
  }, []);

  // Simulation loop: tilt spring, stir envelope, airborne envelope, phases,
  // surface slosh.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as SnowSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      // Jerk decays on its own so a single shove does not stir forever.
      s.jerk *= Math.exp(-dt / JERK_TAU);
      s.kick *= Math.exp(-dt / KICK_TAU);
      const drive = Math.min(1, Math.max(s.jerk, s.kick));

      const stirTau = drive > s.stir ? STIR_ATTACK : STIR_RELEASE;
      s.stir += (drive - s.stir) * Math.min(1, dt / stirTau);

      const airTarget = Math.max(AIR_FLOOR, s.stir);
      const airTau = airTarget > s.airborne ? AIR_ATTACK : AIR_RELEASE;
      s.airborne += (airTarget - s.airborne) * Math.min(1, dt / airTau);

      const prevTilt = s.tilt;
      s.tiltVel += (s.tiltTarget - s.tilt) * TILT_STIFFNESS * dt;
      s.tiltVel -= s.tiltVel * TILT_DAMPING * dt;
      s.tilt += s.tiltVel * dt;
      const spin = dt > 0 ? (s.tilt - prevTilt) / dt : 0;

      // The settled surface wants to be level (slope 0 in gravity space) and
      // is dragged out of level by rotation.
      const surfTarget = -spin * SURF_DRAG;
      s.surfTiltVel += (surfTarget - s.surfTilt) * SURF_STIFFNESS * dt;
      s.surfTiltVel -= s.surfTiltVel * SURF_DAMPING * dt;
      s.surfTilt += s.surfTiltVel * dt;

      s.wobble = Math.max(s.wobble * Math.exp(-dt / WOBBLE_TAU), s.stir * 0.9);

      // Phases are integrated, never `time x speed` — the speeds change at
      // runtime and a product would teleport the pattern on every change.
      s.fallPhase += dt * (FALL_REST + (FALL_STIRRED - FALL_REST) * s.stir);
      s.swirlPhase += dt * (SWIRL_REST + (SWIRL_STIRRED - SWIRL_REST) * s.stir);

      // Snow in the air is snow off the pile.
      const pile = 1 - Math.min(1, s.airborne) * 0.75;

      setParamsSynchronizable(
        s.tilt,
        s.stir,
        s.airborne,
        pile,
        s.fallPhase,
        s.swirlPhase,
        s.surfTilt,
        s.wobble
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  return { paramsSynchronizable, shake };
}
