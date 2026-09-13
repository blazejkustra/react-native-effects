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
/**
 * Churn the fluid has to fall below before the die can float back up. Set by
 * pacing, not by physics: the fluid is still visibly moving at 0.2, and
 * waiting for it to go properly still leaves three seconds of staring at murk.
 */
const CALM = 0.2;

/** How fast a churning fluid drags the die back down, in rise units per second. */
const SINK_RATE = 1.5;

/**
 * Buoyancy: a CONSTANT push, against linear drag — not a spring pulling the
 * die toward the window.
 *
 * This is the difference between the answer floating up and the answer popping
 * up. A spring is slowest where it starts and fastest where it arrives, so it
 * covers the whole window in the last third of a second however soft you make
 * it; softening it only adds dead time at the bottom. A light object in a
 * viscous fluid instead reaches terminal velocity (BUOYANCY / RISE_DRAG) in
 * the first few frames and then simply travels, at one steady speed, for as
 * long as the trip takes. Currently about 0.85 window radii per second, so the
 * climb reads over roughly a second and a half.
 */
const BUOYANCY = 2.2;
const RISE_DRAG = 2.6;
/** Fraction of the speed kept when it hits the glass. */
const GLASS_BOUNCE = 0.45;
/** Under this arrival speed it has nothing left to bounce with, so it rests. */
const GLASS_SETTLE = 0.18;

/** Sideways wobble as it rises: a soft spring, kicked once per trip. */
const SWAY_STIFFNESS = 30;
const SWAY_DAMPING = 3.2;
const SWAY_KICK = 2.1;

/**
 * How far off square the die is when it starts its climb (rad), and the spring
 * that turns it back. A die arriving already flat to the window is the single
 * most artificial thing this screen can do: it has been tumbling in the fluid,
 * so it has to come up turned and rotate the last few degrees into place.
 *
 * Under-damped on purpose — it overshoots square by a couple of degrees and
 * comes back, which is what a face settling against glass in a thick fluid
 * does. Softer than the rise spring, so the turn is still finishing after the
 * die has touched: two motions ending together read as one scripted move.
 */
const SPIN_MIN = 0.34;
const SPIN_MAX = 0.72;
const SPIN_STIFFNESS = 5;
const SPIN_DAMPING = 1.9;

/**
 * A second, much softer spring that carries the die's ORIENTATION to world-up.
 *
 * It cannot be the tilt spring. That one is stiff because it IS the hand — the
 * rise axis has to answer the phone immediately — but tilt comes from atan2 of
 * a raw accelerometer, which carries a degree or so of noise plus whatever the
 * hand is doing. Rotating the die (and the answer printed on it) straight off
 * that makes the text tremble while the phone is held still.
 *
 * Half a second to follow, well damped: noise never survives it, and a die
 * that heavy in a fluid that thick should lag the phone anyway.
 */
const ORIENT_STIFFNESS = 20;
const ORIENT_DAMPING = 7;

/** Swirl phase rate at rest and fully churned; amplitude is `churn`. */
const SWIRL_REST = 0.11;
const SWIRL_CHURNED = 2.2;

/** Only push a new value at the UI thread once it has moved this far. */
const SYNC_EPSILON = 0.004;

/**
 * Where the die sits when it is still deep in the murk, in window radii.
 * Hard-coded to the same number in the shader, which draws the die this text
 * sits on — change one and you change both.
 */
const SUBMERGED_DEPTH = 1.2;
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
  /** How far the die is turned off square (rad), and how fast. */
  spin: number;
  spinVel: number;
  /** The die's heading, lagging world-up (rad). */
  orient: number;
  orientVel: number;
  /** Integrated phase — never time x a speed that varies at runtime. */
  swirlPhase: number;
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
  /**
   * How the die is turned, in DEGREES and in the screen's sense (positive =
   * clockwise), so the answer text turns with the face it is printed on. Both
   * the world-up alignment and the spin left over from the climb.
   */
  spinDeg: SharedValue<number>;
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
 * `u.liveData[0] = (sway, die rotation rad, 0, 0)`.
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
  const spinDeg = useSharedValue(0);

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
      spin: 0,
      spinVel: 0,
      orient: 0,
      orientVel: 0,
      swirlPhase: 0,
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
          spin: s.spin,
          orient: s.orient,
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
    let syncedSpin = Number.NaN;

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
          // Which way it is turned is as random as which answer came up.
          s.spin =
            (Math.random() < 0.5 ? -1 : 1) *
            (SPIN_MIN + Math.random() * (SPIN_MAX - SPIN_MIN));
          s.spinVel = 0;
        }
      } else if (s.phase === 'rising') {
        s.riseVel += BUOYANCY * dt;
        s.riseVel -= s.riseVel * RISE_DRAG * dt;
        s.rise += s.riseVel * dt;
        if (s.rise >= 1) {
          // It has met the glass; it cannot go further, and most of the
          // energy goes into the fluid rather than back into the die.
          s.rise = 1;
          if (s.riseVel > GLASS_SETTLE) {
            s.riseVel = -s.riseVel * GLASS_BOUNCE;
          } else {
            s.riseVel = 0;
            s.phase = 'settled';
          }
        }
      }

      s.swayVel += (0 - s.sway) * SWAY_STIFFNESS * dt;
      s.swayVel -= s.swayVel * SWAY_DAMPING * dt;
      s.sway += s.swayVel * dt;

      s.spinVel += (0 - s.spin) * SPIN_STIFFNESS * dt;
      s.spinVel -= s.spinVel * SPIN_DAMPING * dt;
      s.spin += s.spinVel * dt;

      s.orientVel += (s.tilt - s.orient) * ORIENT_STIFFNESS * dt;
      s.orientVel -= s.orientVel * ORIENT_DAMPING * dt;
      s.orient += s.orientVel * dt;

      s.swirlPhase +=
        dt * (SWIRL_REST + (SWIRL_CHURNED - SWIRL_REST) * s.churn);

      setParamsSynchronizable(
        s.tilt,
        s.churn,
        s.rise,
        s.swirlPhase,
        s.sway,
        // One slot carries the die's whole rotation: the heading it is settling
        // to, plus the spin the climb left behind.
        s.spin + s.orient,
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
      // The text is printed on the die, so it takes the die's whole rotation:
      // world-up alignment plus whatever spin the climb has left. uv rotates
      // counter-clockwise, a transform clockwise.
      const turn = s.spin + s.orient;
      if (!(Math.abs(turn - syncedSpin) < SYNC_EPSILON)) {
        syncedSpin = turn;
        spinDeg.value = (-turn * 180) / Math.PI;
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
  }, [setParamsSynchronizable, rise, drift, spinDeg]);

  return { paramsSynchronizable, shake, rise, drift, spinDeg };
}
