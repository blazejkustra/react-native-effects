import { useCallback, useEffect, useRef } from 'react';
import { Accelerometer } from 'expo-sensors';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';

/** Spring that carries the ball's own tilt (rad). Stiff — it IS the hand. */
const TILT_STIFFNESS = 120;
const TILT_DAMPING = 16;

/**
 * Shake detection, same shape as the snow globe: the accelerometer is
 * differentiated sample to sample, anything under `SHAKE_FLOOR` g of change is
 * hand jitter rather than a shake, and what is left is low-passed into `jerk`.
 */
const SHAKE_FLOOR = 0.035;
const SHAKE_GAIN = 3.4;
const JERK_TAU = 0.09;
/** Debug/tap impulses decay with this time constant (s). */
const KICK_TAU = 0.26;

/**
 * How churned the fluid is, 0..1. Fast to answer a shake, slow to settle —
 * that long release is what makes the ball feel full of something viscous.
 */
const CHURN_ATTACK = 0.06;
const CHURN_RELEASE = 1.45;

/** Churn that knocks a settled answer back off the window. */
const SHAKE_TRIGGER = 0.3;
/** Churn the fluid has to fall below before the die can float back up. */
const CALM = 0.12;

/** How fast a churning fluid drags the die back down, in rise units per second. */
const SINK_RATE = 2.4;

/**
 * Buoyancy. The die is lighter than the fluid, so it accelerates up and then
 * bumps the glass — a light damping leaves one visible bounce, which is the
 * detail that reads as "something floated up and touched the window".
 */
const RISE_STIFFNESS = 26;
const RISE_DAMPING = 5.4;
/** Fraction of the speed kept when it hits the glass. */
const GLASS_BOUNCE = 0.45;

/** Sideways wobble as it rises: a soft spring, kicked once per trip. */
const SWAY_STIFFNESS = 30;
const SWAY_DAMPING = 3.2;
const SWAY_KICK = 2.1;

/** Swirl phase rate at rest and fully churned; amplitude is `churn`. */
const SWIRL_REST = 0.11;
const SWIRL_CHURNED = 2.2;
/** Bubble rise rate, in window radii per second. */
const BUBBLE_REST = 0.05;
const BUBBLE_CHURNED = 0.85;

/** Only push a new value at the UI thread once it has moved this far. */
const SYNC_EPSILON = 0.004;

/** Where the die sits when it is still deep in the murk, in window radii. */
const SUBMERGED_DEPTH = 0.55;
/** How far the sway pushes it off the rise axis, in window radii. */
const SWAY_REACH = 0.1;

type Phase = 'settled' | 'sinking' | 'submerged' | 'rising';

type BallSim = {
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
  /** Decaying impulse from a tap or `__ballShake`. */
  kick: number;
  /** How churned the fluid is, 0..1. */
  churn: number;
  phase: Phase;
  /** 0 = lost in the murk, 1 = pressed against the window. */
  rise: number;
  riseVel: number;
  /** Signed sideways wobble of the die, in window radii-ish. */
  sway: number;
  swayVel: number;
  /** Integrated phases — never time x a speed that varies at runtime. */
  swirlPhase: number;
  bubblePhase: number;
};

export type Magic8BallPhysics = {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  /** Shake it by hand — a tap on the ball, or the debug hook. */
  shake: (strength?: number) => void;
  /** 0..1, how far the die has floated up. Drives the answer text. */
  rise: SharedValue<number>;
  /**
   * Where the die is, relative to the middle of the window, in window radii.
   * Screen convention: y grows DOWNWARD, so it can be fed straight into a
   * transform.
   */
  drift: SharedValue<{ x: number; y: number }>;
};

/**
 * The physics of a Magic 8-ball.
 *
 * One input: the accelerometer. Its in-plane gravity angle says which way is
 * really up, and the die floats up along that axis — tip the phone and the
 * answer rises in from a different corner of the window. Differentiating the
 * same signal gives a shake, which churns the fluid; churn drags the die back
 * down off the glass, and only once the fluid has calmed does buoyancy carry
 * a new answer up into the window, bumping the glass once as it arrives.
 *
 * Writes the live channel every frame:
 * `u.live = (tilt rad, churn 0..1, rise 0..1, swirlPhase)`,
 * `u.liveData[0] = (bubblePhase, sway, 0, 0)`.
 */
export function useMagic8BallPhysics({
  onSubmerged,
}: {
  /**
   * Called the moment the old answer is fully out of sight, which is when a
   * new one should be chosen — swapping it any later would be visible.
   */
  onSubmerged?: () => void;
} = {}): Magic8BallPhysics {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 1, 0, 0, 0, 0, 0]);

  const rise = useSharedValue(1);
  const drift = useSharedValue({ x: 0, y: 0 });

  // Held in a ref so the simulation effect never re-runs when the screen
  // re-renders with a new answer.
  const onSubmergedRef = useRef(onSubmerged);
  onSubmergedRef.current = onSubmerged;

  const simRef = useRef<BallSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      tiltTarget: 0,
      tilt: 0,
      tiltVel: 0,
      tiltOverride: null,
      prev: null,
      jerk: 0,
      kick: 0,
      churn: 0,
      phase: 'settled',
      rise: 1,
      riseVel: 0,
      sway: 0,
      swayVel: 0,
      swirlPhase: 0,
      bubblePhase: 0,
    };
  }

  const shake = useCallback((strength = 1) => {
    const s = simRef.current as BallSim;
    s.kick = Math.max(s.kick, Math.max(0, Math.min(1.5, strength)));
  }, []);

  // Accelerometer -> in-plane gravity angle + shake. Upright portrait reads
  // y ~ -1, and a positive angle means the phone's right-hand side has
  // dropped (same convention as the snow globe, lighter and candle).
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
          const s = simRef.current as BallSim;

          if (s.prev !== null) {
            const d = Math.hypot(x - s.prev.x, y - s.prev.y, z - s.prev.z);
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
        // No accelerometer (simulator) -> the ball sits upright and the debug
        // hooks below are the only way to move it.
      }
    })();

    // The simulator has no accelerometer, so let a debugger shake and tilt it.
    // `__ballTilt(rad)` holds the gravity angle until `__ballTilt(null)` hands
    // control back to the sensor.
    if (__DEV__) {
      const g = globalThis as {
        __ballShake?: (strength?: number) => void;
        __ballTilt?: (rad: number | null) => void;
        __ballState?: () => Record<string, number | string | null>;
      };
      g.__ballShake = (strength = 1) => {
        const s = simRef.current as BallSim;
        s.kick = Math.max(s.kick, Math.max(0, Math.min(1.5, strength)));
      };
      g.__ballTilt = (rad: number | null) => {
        const s = simRef.current as BallSim;
        if (rad === null) {
          s.tiltOverride = null;
          return;
        }
        s.tiltOverride = rad;
        s.tiltTarget = rad;
      };
      g.__ballState = () => {
        const s = simRef.current as BallSim;
        return {
          tilt: s.tilt,
          tiltTarget: s.tiltTarget,
          tiltOverride: s.tiltOverride,
          churn: s.churn,
          phase: s.phase,
          rise: s.rise,
          riseVel: s.riseVel,
          sway: s.sway,
          jerk: s.jerk,
          kick: s.kick,
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
          __ballShake?: unknown;
          __ballTilt?: unknown;
          __ballState?: unknown;
        };
        delete g.__ballShake;
        delete g.__ballTilt;
        delete g.__ballState;
      }
    };
  }, []);

  // Simulation loop: tilt spring, churn envelope, the sink/rise state machine,
  // sway spring, integrated phases.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;
    let syncedRise = -1;
    let syncedX = Number.NaN;
    let syncedY = Number.NaN;

    const step = (now: number) => {
      const s = simRef.current as BallSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      s.jerk *= Math.exp(-dt / JERK_TAU);
      s.kick *= Math.exp(-dt / KICK_TAU);
      const drive = Math.min(1, Math.max(s.jerk, s.kick));

      const churnTau = drive > s.churn ? CHURN_ATTACK : CHURN_RELEASE;
      s.churn += (drive - s.churn) * Math.min(1, dt / churnTau);

      s.tiltVel += (s.tiltTarget - s.tilt) * TILT_STIFFNESS * dt;
      s.tiltVel -= s.tiltVel * TILT_DAMPING * dt;
      s.tilt += s.tiltVel * dt;

      // A hard enough shake takes a settled or still-rising answer back down.
      if (
        s.churn > SHAKE_TRIGGER &&
        s.phase !== 'sinking' &&
        s.phase !== 'submerged'
      ) {
        s.phase = 'sinking';
        s.riseVel = 0;
      }

      if (s.phase === 'sinking') {
        // The more violently the fluid is moving, the faster it strips the die
        // off the glass.
        s.rise -= SINK_RATE * dt * (0.35 + s.churn);
        if (s.rise <= 0) {
          s.rise = 0;
          s.phase = 'submerged';
          // Out of sight: safe to pick the next answer.
          onSubmergedRef.current?.();
        }
      } else if (s.phase === 'submerged') {
        if (s.churn < CALM) {
          s.phase = 'rising';
          s.riseVel = 0;
          s.swayVel = (Math.random() * 2 - 1) * SWAY_KICK;
        }
      } else if (s.phase === 'rising') {
        s.riseVel += (1 - s.rise) * RISE_STIFFNESS * dt;
        s.riseVel -= s.riseVel * RISE_DAMPING * dt;
        s.rise += s.riseVel * dt;
        if (s.rise > 1) {
          // It has met the glass; it cannot go further, and most of the
          // energy goes into the fluid rather than back into the die.
          s.rise = 1;
          if (s.riseVel > 0) {
            s.riseVel = -s.riseVel * GLASS_BOUNCE;
          }
        }
        if (Math.abs(1 - s.rise) < 0.004 && Math.abs(s.riseVel) < 0.03) {
          s.rise = 1;
          s.riseVel = 0;
          s.phase = 'settled';
        }
      }

      s.swayVel += (0 - s.sway) * SWAY_STIFFNESS * dt;
      s.swayVel -= s.swayVel * SWAY_DAMPING * dt;
      s.sway += s.swayVel * dt;

      s.swirlPhase +=
        dt * (SWIRL_REST + (SWIRL_CHURNED - SWIRL_REST) * s.churn);
      s.bubblePhase +=
        dt * (BUBBLE_REST + (BUBBLE_CHURNED - BUBBLE_REST) * s.churn);

      setParamsSynchronizable(
        s.tilt,
        s.churn,
        s.rise,
        s.swirlPhase,
        s.bubblePhase,
        s.sway,
        0,
        0
      );

      // The answer text has to sit on the die, so it needs the same offset the
      // shader computes: up the world-up axis as it rises, plus the sway
      // across it. Pushed to the UI thread only when it has actually moved, so
      // a settled ball costs nothing.
      if (Math.abs(s.rise - syncedRise) > SYNC_EPSILON) {
        rise.value = s.rise;
        syncedRise = s.rise;
      }
      const upX = -Math.sin(s.tilt);
      const upY = Math.cos(s.tilt);
      const depth = SUBMERGED_DEPTH * (1 - s.rise);
      const dx = -upX * depth + -upY * s.sway * SWAY_REACH;
      const dyUv = -upY * depth + upX * s.sway * SWAY_REACH;
      if (
        !(Math.abs(dx - syncedX) < SYNC_EPSILON) ||
        !(Math.abs(-dyUv - syncedY) < SYNC_EPSILON)
      ) {
        syncedX = dx;
        syncedY = -dyUv;
        // uv is y-up, a transform is y-down.
        drift.value = { x: syncedX, y: syncedY };
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable, rise, drift]);

  return { paramsSynchronizable, shake, rise, drift };
}
