import { useCallback, useEffect, useRef, useState } from 'react';
import { Magnetometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Where the puddle rests, centred coords (x scaled by aspect, y-up). */
const REST = { x: 0, y: -0.02 };
/**
 * Field change (uT) ignored: Earth's ~50 uT swings by up to twice that in
 * the device frame just from turning the phone.
 */
const FIELD_DEADZONE = 80;
/** Field change that saturates the spikes (uT); a neodymium magnet nearby. */
const FIELD_FULL = 2000;
/** Knee of the log curve: smaller = more sensitive to a weak magnet. */
const FIELD_KNEE = 120;
/** How far the magnet's direction pulls the gather point, centred units. */
const FIELD_REACH = 0.32;
/** Samples averaged into the Earth-field baseline. */
const CALIBRATION_SAMPLES = 20;
const SENSOR_INTERVAL_MS = 20;
/** Spikes snap up and ring as they settle: a light, underdamped spring. */
const RISE_STIFFNESS = 110;
const RISE_DAMPING = 7.5;
/** The puddle itself is heavier: it creeps toward the magnet. */
const FLOW_STIFFNESS = 26;
const FLOW_DAMPING = 7.5;
/** Farthest the puddle centre slides off its rest point. */
const MAX_GATHER = 0.07;
/** A finger held down ramps up like a magnet being brought in (s). */
const TOUCH_RAMP = 0.35;
const TOUCH_STRENGTH = 0.9;

type Vec = { x: number; y: number };

type FerroSim = {
  aspect: number;
  /** Magnet position the field implies, centred coords. */
  magnet: Vec;
  strengthTarget: number;
  strength: number;
  strengthVel: number;
  center: Vec;
  centerVel: Vec;
  phase: number;
  touch: { at: Vec; held: number } | null;
  sensor: { magnet: Vec; strength: number };
  override: { magnet: Vec; strength: number } | null;
  baseline: { x: number; y: number; z: number } | null;
  calibration: { x: number; y: number; z: number; n: number };
};

export type FerroSource = 'sensor' | 'touch' | 'none';

function fieldToStrength(deltaUT: number): number {
  const d = Math.max(0, deltaUT - FIELD_DEADZONE);
  return Math.min(
    1,
    Math.log1p(d / FIELD_KNEE) / Math.log1p(FIELD_FULL / FIELD_KNEE)
  );
}

function clampLength(v: Vec, max: number): Vec {
  const len = Math.hypot(v.x, v.y);
  if (len <= max || len === 0) {
    return v;
  }
  return { x: (v.x / len) * max, y: (v.y / len) * max };
}

/**
 * Turns a real magnet near the phone into a magnet under a puddle of
 * ferrofluid.
 *
 * The magnetometer's raw field (uT) minus an Earth-field baseline gives the
 * magnet's field at the sensor. Its size maps through a log curve to spike
 * strength. Its in-plane direction says where the magnet is: under a dipole
 * the in-plane field points away from the axis for one pole and toward it for
 * the other, and the out-of-screen component tells the two apart, so the
 * fluid gathers toward the magnet whichever face is held to the phone.
 * Without a sensor (simulator) a held finger acts as the magnet.
 *
 * Writes `u.live = (centerX, centerY, strength, phase)` and
 * `u.liveData[0] = (magnetX, magnetY, strengthVelocity, 0)`, centred coords.
 */
export function useFerrofluidField(width: number, height: number) {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([REST.x, REST.y, 0, 0, REST.x, REST.y, 0, 0]);
  const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);

  const simRef = useRef<FerroSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      aspect: width / height,
      magnet: { ...REST },
      strengthTarget: 0,
      strength: 0,
      strengthVel: 0,
      center: { ...REST },
      centerVel: { x: 0, y: 0 },
      phase: 0,
      touch: null,
      sensor: { magnet: { ...REST }, strength: 0 },
      override: null,
      baseline: null,
      calibration: { x: 0, y: 0, z: 0, n: 0 },
    };
  }
  simRef.current.aspect = width / height;

  const calibrate = useCallback(() => {
    const s = simRef.current as FerroSim;
    s.baseline = null;
    s.calibration = { x: 0, y: 0, z: 0, n: 0 };
    s.sensor = { magnet: { ...REST }, strength: 0 };
  }, []);

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    const onReading = ({ x, y, z }: { x: number; y: number; z: number }) => {
      const s = simRef.current as FerroSim;
      if (s.baseline === null) {
        const c = s.calibration;
        c.x += x;
        c.y += y;
        c.z += z;
        c.n += 1;
        if (c.n >= CALIBRATION_SAMPLES) {
          s.baseline = { x: c.x / c.n, y: c.y / c.n, z: c.z / c.n };
        }
        return;
      }
      const dx = x - s.baseline.x;
      const dy = y - s.baseline.y;
      const dz = z - s.baseline.z;
      const mag = Math.hypot(dx, dy, dz);
      const strength = fieldToStrength(mag);
      const pole = dz >= 0 ? -1 : 1;
      const inPlane =
        mag > 1e-3 ? { x: dx / mag, y: dy / mag } : { x: 0, y: 0 };
      s.sensor = {
        strength,
        magnet: {
          x: REST.x + pole * inPlane.x * FIELD_REACH,
          y: REST.y + pole * inPlane.y * FIELD_REACH,
        },
      };
    };

    const start = async () => {
      try {
        const ok = await Magnetometer.isAvailableAsync();
        if (cancelled) {
          return;
        }
        setSensorAvailable(ok);
        if (!ok) {
          return;
        }
        Magnetometer.setUpdateInterval(SENSOR_INTERVAL_MS);
        sub = Magnetometer.addListener(onReading);
      } catch {
        if (!cancelled) {
          setSensorAvailable(false);
        }
      }
    };
    start();

    // The simulator has no magnetometer. `__ferroMagnet(x, y, strength)` holds
    // a magnet at screen fraction (x, y), y down, strength 0..1, until
    // `__ferroMagnet(null)` hands control back to the sensor and touch.
    if (__DEV__) {
      const g = globalThis as {
        __ferroMagnet?: (
          x: number | null,
          y?: number,
          strength?: number
        ) => void;
      };
      g.__ferroMagnet = (x, y = 0.5, strength = 1) => {
        const s = simRef.current as FerroSim;
        if (x === null) {
          s.override = null;
          return;
        }
        s.override = {
          magnet: { x: (x - 0.5) * s.aspect, y: 0.5 - y },
          strength: Math.max(0, Math.min(1, strength)),
        };
      };
    }

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        delete (globalThis as { __ferroMagnet?: unknown }).__ferroMagnet;
      }
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as FerroSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (s.touch) {
        s.touch.held = Math.min(1, s.touch.held + dt / TOUCH_RAMP);
      }
      if (s.override) {
        s.magnet = s.override.magnet;
        s.strengthTarget = s.override.strength;
      } else if (s.touch) {
        s.magnet = s.touch.at;
        s.strengthTarget = TOUCH_STRENGTH * s.touch.held;
      } else {
        s.magnet = s.sensor.magnet;
        s.strengthTarget = s.sensor.strength;
      }

      s.strengthVel += (s.strengthTarget - s.strength) * RISE_STIFFNESS * dt;
      s.strengthVel -= s.strengthVel * RISE_DAMPING * dt;
      s.strength = Math.max(0, s.strength + s.strengthVel * dt);

      const pull = clampLength(
        { x: s.magnet.x - REST.x, y: s.magnet.y - REST.y },
        MAX_GATHER
      );
      const gather = Math.min(1, s.strengthTarget * 1.2);
      const goal = { x: REST.x + pull.x * gather, y: REST.y + pull.y * gather };
      s.centerVel.x += (goal.x - s.center.x) * FLOW_STIFFNESS * dt;
      s.centerVel.y += (goal.y - s.center.y) * FLOW_STIFFNESS * dt;
      s.centerVel.x -= s.centerVel.x * FLOW_DAMPING * dt;
      s.centerVel.y -= s.centerVel.y * FLOW_DAMPING * dt;
      s.center.x += s.centerVel.x * dt;
      s.center.y += s.centerVel.y * dt;

      s.phase += dt * (0.6 + Math.abs(s.strengthVel) * 0.8);

      setParamsSynchronizable(
        s.center.x,
        s.center.y,
        s.strength,
        s.phase,
        s.magnet.x,
        s.magnet.y,
        s.strengthVel,
        0
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  /** Finger as a magnet: screen points, y down. Pass null on release. */
  const setTouch = useCallback(
    (point: { x: number; y: number } | null) => {
      const s = simRef.current as FerroSim;
      if (point === null) {
        s.touch = null;
        return;
      }
      const at = {
        x: (point.x / width - 0.5) * s.aspect,
        y: 0.5 - point.y / height,
      };
      s.touch = { at, held: s.touch ? s.touch.held : 0 };
    },
    [width, height]
  );

  return { paramsSynchronizable, setTouch, calibrate, sensorAvailable };
}
