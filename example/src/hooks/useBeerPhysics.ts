import { useCallback, useEffect, useRef } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useParamsSynchronizable } from 'react-native-effects';

/** Fraction of the screen area the beer fills when the glass is full. */
const FULL_LEVEL = 0.8;
const REFILL_RATE = 0.35; // level / sec
/**
 * Once the beer is (nearly) gone the head slides out of the mouth after it,
 * over this many seconds — the drain itself can empty the glass in a few
 * frames, and a head that vanishes with it reads as a collapse, not a drink.
 */
const FOAM_OUT_TIME = 1.1;
/** Fill fraction below which the head starts to leave... */
const FOAM_OUT_LEVEL = 0.06;
/** ...and above which it comes back — so a pour has beer under it first. */
const FOAM_IN_LEVEL = 0.14;

/**
 * First sloshing mode of a phone-sized glass — a damped pendulum on the
 * surface angle. A real phone-width tank rings at ~3.5 Hz; this is a little
 * slower and better damped so hand tremor does not show. The old 1.5 Hz
 * spring was the "100 ms lag" people noticed.
 */
const OMEGA1 = 15;
const ZETA1 = 0.3;
/** Symmetric hump mode (excited by vertical jolts and the pour). */
const OMEGA2 = 22;
const ZETA2 = 0.4;
/** Second antisymmetric mode (excited by the same lateral kicks as mode 1). */
const OMEGA3 = 26;
const ZETA3 = 0.45;
/** How strongly mode-1 angular acceleration feeds mode 3 (screen units). */
const MODE3_COUPLING = 0.25;
/** Mode-2 velocity kick per g of change in the in-plane gravity magnitude. */
const MODE2_KICK = 0.5;
const MODE_CLAMP = 0.025;
/** Integrator substep for the ~30 rad/s oscillators. */
const SUBSTEP = 1 / 240;
/**
 * Low-pass on the sensor before it reaches the physics. A finger tapping the
 * case is a one-sample spike; a body of beer has inertia and never sees it.
 */
const SENSOR_TAU = 0.05;

/**
 * Spilling. The mouth of the glass is the top edge of the screen: the moment
 * the liquid surface is above the lower of the two top corners, beer leaves,
 * fast enough that the surface visibly sits AT that corner while it drains
 * (level fraction per second per unit of head — a proportional controller
 * with an ~70 ms time constant, so the beer follows the corner as you tilt,
 * instead of hovering above it).
 */
const SPILL_GAIN = 15;
const MAX_SPILL_RATE = 3;

/** Per-sample accelerometer jerk below this is treated as sensor noise. */
const JERK_NOISE_FLOOR = 0.05;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Geometry lives in the shader's frame: aspect-corrected x in [-W/2, W/2]
 * (W = width / height), y up in [0, 1]. The liquid is the half-plane
 * `dot(p, down) >= k` clipped by that rectangle.
 */
type Chord = { area: number; sMin: number; sMax: number };
const scratchX = new Float64Array(8);
const scratchY = new Float64Array(8);

/**
 * Area of the rectangle where dot(p, down) - k >= 0 (Sutherland-Hodgman
 * against one half-plane + shoelace), plus the extent of the wetted surface
 * chord measured along the surface direction (perp to down).
 */
function clipRect(
  w: number,
  dx: number,
  dy: number,
  k: number,
  out: Chord
): void {
  const ex = -dy;
  const ey = dx;
  const hw = w / 2;
  // Corners CCW.
  let n = 0;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (let i = 0; i < 4; i++) {
    const ax = i === 0 || i === 3 ? -hw : hw;
    const ay = i < 2 ? 0 : 1;
    const j = (i + 1) & 3;
    const bx = j === 0 || j === 3 ? -hw : hw;
    const by = j < 2 ? 0 : 1;
    const fa = ax * dx + ay * dy - k;
    const fb = bx * dx + by * dy - k;
    if (fa >= 0) {
      scratchX[n] = ax;
      scratchY[n] = ay;
      n++;
    }
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb);
      const ix = ax + (bx - ax) * t;
      const iy = ay + (by - ay) * t;
      scratchX[n] = ix;
      scratchY[n] = iy;
      n++;
      const s = ix * ex + iy * ey;
      sMin = Math.min(sMin, s);
      sMax = Math.max(sMax, s);
    }
  }
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    area += scratchX[i]! * scratchY[j]! - scratchX[j]! * scratchY[i]!;
  }
  out.area = Math.abs(area) / 2;
  if (sMin === Infinity) {
    // No surface on screen (glass completely full or empty).
    out.sMin = -hw;
    out.sMax = hw;
  } else {
    out.sMin = sMin;
    out.sMax = sMax;
  }
}

/**
 * Volume conservation: find the surface offset k so that the clipped liquid
 * area equals `area`. Area is monotonic in k, so bisect between the corner
 * projections (everything liquid ... nothing liquid).
 */
function solveSurface(
  w: number,
  dx: number,
  dy: number,
  area: number,
  out: Chord
): number {
  const hw = w / 2;
  const c0 = -hw * dx;
  const c1 = hw * dx;
  const c2 = hw * dx + dy;
  const c3 = -hw * dx + dy;
  let lo = Math.min(c0, c1, c2, c3);
  let hi = Math.max(c0, c1, c2, c3);
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    clipRect(w, dx, dy, mid, out);
    if (out.area > area) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const k = (lo + hi) / 2;
  clipRect(w, dx, dy, k, out);
  return k;
}

type BeerSim = {
  /** View aspect (width / height) — must match the shader's resolution.z. */
  aspect: number;
  /** In-plane gravity magnitude straight from the sensor (g). */
  gmRaw: number;
  /** Low-passed in-plane gravity magnitude, 0 when the phone lies flat. */
  gm: number;
  lastGm: number;
  /** Confidence-blended sensor angle (rad, unwrapped), unfiltered. */
  rawAngle: number;
  /** Low-passed hydrostatic surface angle the mode-1 spring chases. */
  targetAngle: number;
  /** Sprung (mode-1) surface angle written to the shader. */
  angle: number;
  vel1: number;
  a2: number;
  v2: number;
  a3: number;
  v3: number;
  /** Accumulated above-noise-floor jerk since the last frame. */
  jerkAccum: number;
  /** How much beer is left as a fraction of the screen area, 0..FULL_LEVEL. */
  level: number;
  /** 0 = head seated on the surface, 1 = slid out of the mouth. */
  foamOut: number;
  pouring: boolean;
  pourT: number;
  /** Seconds since the pour was cut short by an overflow (fade-out), or -1. */
  pourEndT: number;
  slosh: number;
  bubblePhase: number;
  lastAx: number;
  lastAy: number;
  chord: Chord;
};

/**
 * The physics of a phone-sized glass of beer.
 *
 * The beer is a volume of liquid in a rectangular glass whose open mouth is
 * the top edge of the screen. Every frame the hydrostatic surface is solved
 * for the current effective gravity (accelerometer x/y — gravity AND your
 * hand's acceleration, so shaking sloshes it) and the remaining volume, so
 * the level is always exactly right for the tilt. The moment the surface
 * rises above the lower of the two top corners the beer flows out, fast
 * enough that the surface stays pinned to that corner as you keep tilting —
 * tip far enough and the glass empties, exactly like a real one. Pitch past
 * horizontal and gravity points out of the mouth: drinking. Nothing is
 * gated or timed.
 *
 * On top of the hydrostatic surface ride the first three sloshing modes as
 * damped oscillators near their real frequencies, driven by the sensor: the
 * surface lags, overshoots and rings like liquid, then settles.
 *
 * Live channel layout (12 floats):
 * `u.live = (angle, k, slosh, pour)`,
 * `u.liveData[0] = (bubblePhase, mode2, mode3, chordMid)`,
 * `u.liveData[1] = (chordHalf, level, mode1Curvature, 0)`.
 *
 * Returns `refill` (call on tap) and `onLayout` (attach to the glass view
 * so the geometry uses the real aspect ratio).
 */
export function useBeerPhysics(): {
  paramsSynchronizable: ReturnType<
    typeof useParamsSynchronizable
  >['paramsSynchronizable'];
  refill: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const { width, height } = useWindowDimensions();
  const initialAspect = width / Math.max(1, height);

  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([
      0,
      -FULL_LEVEL,
      0,
      0,
      0,
      0,
      0,
      0,
      initialAspect / 2,
      1,
      0,
      0,
    ]);

  const simRef = useRef<BeerSim | null>(null);
  if (simRef.current === null) {
    simRef.current = {
      aspect: initialAspect,
      gmRaw: 1,
      gm: 1,
      lastGm: 1,
      rawAngle: 0,
      targetAngle: 0,
      angle: 0,
      vel1: 0,
      a2: 0,
      v2: 0,
      a3: 0,
      v3: 0,
      jerkAccum: 0,
      level: FULL_LEVEL,
      foamOut: 0,
      pouring: false,
      pourT: 0,
      pourEndT: -1,
      slosh: 0,
      bubblePhase: 0,
      lastAx: 0,
      lastAy: -1,
      chord: { area: 0, sMin: 0, sMax: 0 },
    };
  }

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) {
      (simRef.current as BeerSim).aspect = w / h;
    }
  }, []);

  // Accelerometer → hydrostatic surface angle. In-plane (x, y) only: the
  // reading is effective gravity in the phone frame (screen x right, y up),
  // so the liquid surface is simply perpendicular to it.
  useEffect(() => {
    const onSample = (x: number, y: number) => {
      const s = simRef.current as BeerSim;

      // Upright portrait reads y ≈ -1 → angle 0; the liquid counter-rotates
      // the phone so its surface stays level with the world.
      const reading = Math.atan2(x, -y);
      const gm = Math.hypot(x, y);
      const conf = Math.min(1, gm / 0.35);

      // Weak in-plane signal (phone near-flat) HOLDS the last angle —
      // blend toward the new reading by conf² along the shortest path.
      let delta = reading - s.rawAngle;
      if (delta > Math.PI) {
        delta -= 2 * Math.PI;
      } else if (delta < -Math.PI) {
        delta += 2 * Math.PI;
      }
      s.rawAngle += delta * conf * conf;
      s.gmRaw = gm;

      // Jerk with a noise floor so idly holding the phone stays calm.
      const jerk = Math.hypot(x - s.lastAx, y - s.lastAy);
      s.lastAx = x;
      s.lastAy = y;
      s.jerkAccum += Math.max(0, jerk - JERK_NOISE_FLOOR);
    };

    if (__DEV__) {
      // The simulator has no accelerometer: drive the glass from the Metro
      // debugger with __beerFeed(x, y) — e.g. (0.7, -0.7) is a 45° tilt.
      (
        globalThis as { __beerFeed?: (x: number, y: number) => void }
      ).__beerFeed = onSample;
    }

    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) {
          return;
        }
        Accelerometer.setUpdateInterval(16);
        sub = Accelerometer.addListener(({ x, y }) => onSample(x, y));
      } catch {
        // No accelerometer (simulator) → the beer just stands still.
      }
    })();

    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
      if (__DEV__) {
        delete (globalThis as { __beerFeed?: unknown }).__beerFeed;
      }
    };
  }, []);

  // Simulation loop: sloshing modes, volume solve, spill, pour, bubbles.
  useEffect(() => {
    let raf = 0;
    let lastTs = 0;

    const step = (now: number) => {
      const s = simRef.current as BeerSim;
      const dt = lastTs === 0 ? 0.016 : Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      // Sensor low-pass: taps and case rattle are spikes a body of liquid
      // never feels; only the smoothed gravity vector reaches the physics.
      const lp = 1 - Math.exp(-dt / SENSOR_TAU);
      s.targetAngle += (s.rawAngle - s.targetAngle) * lp;
      s.gm += (s.gmRaw - s.gm) * lp;

      // Sloshing frequencies scale with sqrt(g_eff); a viscous floor keeps
      // the surface from coasting when the phone is flat and g_eff ~ 0.
      const g = Math.sqrt(Math.max(s.gm, 0.04));
      const w1 = OMEGA1 * g;
      const w2 = OMEGA2 * g;
      const w3 = OMEGA3 * g;
      const chordHalf = Math.max(0.02, (s.chord.sMax - s.chord.sMin) / 2);

      // Vertical jolt (change in smoothed |g|) → symmetric hump.
      s.v2 -= MODE2_KICK * (s.gm - s.lastGm);
      s.lastGm = s.gm;

      let remaining = dt;
      while (remaining > 0) {
        const h = Math.min(SUBSTEP, remaining);
        remaining -= h;

        // Mode 1: the surface angle as a damped pendulum about hydrostatic.
        const acc1 =
          (s.targetAngle - s.angle) * w1 * w1 - (2 * ZETA1 * w1 + 1.5) * s.vel1;
        s.vel1 += acc1 * h;
        s.angle += s.vel1 * h;

        // Mode 3: same lateral forcing, higher frequency, more damping.
        const acc3 =
          -MODE3_COUPLING * acc1 * chordHalf -
          w3 * w3 * s.a3 -
          (2 * ZETA3 * w3 + 1.5) * s.v3;
        s.v3 += acc3 * h;
        s.a3 += s.v3 * h;

        // Mode 2: free ringing after its kick.
        const acc2 = -w2 * w2 * s.a2 - (2 * ZETA2 * w2 + 1.5) * s.v2;
        s.v2 += acc2 * h;
        s.a2 += s.v2 * h;
      }
      s.a2 = clamp(s.a2, -MODE_CLAMP, MODE_CLAMP);
      s.a3 = clamp(s.a3, -MODE_CLAMP, MODE_CLAMP);

      // Slosh energy for ripples and bubble speed: mode velocities plus
      // hand jerk, fast attack, ~0.6 s decay.
      const sloshNow = clamp(
        Math.abs(s.vel1) * 0.04 +
          (Math.abs(s.v2) + Math.abs(s.v3)) * 4 +
          s.jerkAccum * 0.6,
        0,
        1
      );
      s.jerkAccum = 0;
      s.slosh = Math.max(sloshNow, s.slosh * Math.exp(-dt / 0.6));

      // Refill pour: ramps in on tap and pours until the glass is full, the
      // stream easing out as the level tops up — so a refill works from ANY
      // level, a near-full glass just gets a short dribble.
      let pour = 0;
      if (s.pouring) {
        s.pourT += dt;
        let fade = 1;
        if (s.pourEndT >= 0) {
          // Cut short by an overflow: ease the stream out instead of popping.
          s.pourEndT += dt;
          fade = 1 - smoothstep(0, 0.25, s.pourEndT);
        }
        pour =
          smoothstep(0, 0.35, s.pourT) *
          (1 - smoothstep(FULL_LEVEL * 0.92, FULL_LEVEL, s.level)) *
          fade;
        s.level = Math.min(FULL_LEVEL, s.level + REFILL_RATE * dt * fade);
        if (s.level >= FULL_LEVEL || s.pourEndT > 0.25) {
          s.pouring = false;
          s.pourEndT = -1;
        }
        // The falling stream keeps the surface churning.
        s.v2 += (Math.random() - 0.5) * 0.02 * pour;
      }

      // Volume conservation: solve the surface for the DISPLAYED angle and
      // the remaining volume. down = (sin a, -cos a) in screen units.
      const dx = Math.sin(s.angle);
      const dy = -Math.cos(s.angle);
      const w = s.aspect;
      let k = solveSurface(w, dx, dy, s.level * w, s.chord);

      // Spill: the mouth of the glass is the top edge. Head = how far the
      // lower top corner sits below the surface (in screen space). Nothing
      // leaves until the surface is over that corner; once it is, the beer
      // runs out fast enough to keep the surface pinned there as you tilt.
      const topL = (-w / 2) * dx + dy - k;
      const topR = (w / 2) * dx + dy - k;
      const head = Math.max(topL, topR);
      if (head > 0 && s.level > 0) {
        const rate = Math.min(MAX_SPILL_RATE, SPILL_GAIN * head);
        s.level = Math.max(0, s.level - rate * dt);
        k = solveSurface(w, dx, dy, s.level * w, s.chord);
        // Nobody keeps pouring into a glass that is running over.
        if (s.pouring && s.pourEndT < 0) {
          s.pourEndT = 0;
        }
      }

      // Integrated phase — never time × varying speed, or bubbles teleport.
      s.bubblePhase += dt * (1 + pour * 2 + s.slosh * 0.5);

      // The head follows the last of the beer out at its own unhurried pace
      // (a linear ramp; the shader eases it) and rises back up through the
      // beer once a pour has put some under it — never a head sitting on the
      // bare bottom of an empty glass.
      let foamTarget = s.foamOut;
      if (s.level < FOAM_OUT_LEVEL) {
        foamTarget = 1;
      } else if (s.level > FOAM_IN_LEVEL) {
        foamTarget = 0;
      }
      s.foamOut = clamp(
        s.foamOut + Math.sign(foamTarget - s.foamOut) * (dt / FOAM_OUT_TIME),
        0,
        1
      );

      // Mode amplitudes shrink with the wetted width and with the last of
      // the beer, so a puddle in the corner does not heave like a full glass.
      const modeScale =
        smoothstep(0.05, 0.25, chordHalf) * smoothstep(0, 0.08, s.level);
      // Mode 1 is a rigid rotation of the line; this coefficient bends the
      // deviation from hydrostatic into the real sin(pi x / L) shape.
      const dev1 = clamp(s.angle - s.targetAngle, -0.35, 0.35);
      const c1 = -dev1 * chordHalf * modeScale;

      setParamsSynchronizable(
        s.angle,
        k,
        s.slosh,
        pour,
        s.bubblePhase,
        s.a2 * modeScale,
        s.a3 * modeScale,
        (s.chord.sMin + s.chord.sMax) / 2,
        chordHalf,
        s.level / FULL_LEVEL,
        c1,
        s.foamOut
      );
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setParamsSynchronizable]);

  const refill = useCallback(() => {
    const s = simRef.current as BeerSim;
    if (!s.pouring && s.level < FULL_LEVEL) {
      s.pouring = true;
      s.pourT = 0;
      s.pourEndT = -1;
    }
  }, []);

  return { paramsSynchronizable, refill, onLayout };
}
