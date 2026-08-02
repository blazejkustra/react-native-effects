import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { ShaderView, useParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /** True when the banner has been expanded to full screen. */
  expanded?: boolean;
};

/** Max wipe stamps — must match the shader's liveData loop bound. */
const MAX_TRAIL = 96;
/** Past this the oldest wipe fades out to free slots (see SandMaterial). */
const SOFT_CAP = MAX_TRAIL - 8;
/** Min finger travel (pt) between stamps — the segments chain into a swipe. */
const TRAIL_SPACING = 14;
/** Refreeze time constant (s): a wipe is clearly there for ~30 s, then gone. */
const REFREEZE_TAU = 11;
/** Fingertip press ramp / release time constants (s). */
const TAU_PRESS = 0.05;
const TAU_RELEASE = 0.5;
/** EMA factor for finger smoothing — the wipe follows a steadied path. */
const SMOOTHING = 0.45;

/** Live channel: header (x, y, press, 0) + MAX_TRAIL × (x, y, strength, brk). */
const LIVE_SIZE = 4 + MAX_TRAIL * 4;
const INITIAL_LIVE = [0.5, 0.5, 0, ...new Array(LIVE_SIZE - 3).fill(0)];

/** `brk` is 1 on the first stamp of a swipe — no segment bridges two swipes. */
type TrailPoint = { x: number; y: number; s: number; brk: number };

/**
 * A frosted window pane at night, and a finger to clear it with.
 *
 * Layers:
 *  1. Base field — cold blue-black glass with three warm out-of-focus glows
 *     far beyond it (street lights), breathing very slowly.
 *  2. Mid structure — dendritic frost creeping in from the edges and from a
 *     few nucleation points. Each patch of crystal grows its needles along a
 *     locally varying direction (a smooth angle field rotates the stretched
 *     noise before it is ridged), which is what makes the growth read as
 *     ferns rather than as combed fur.
 *  3. Micro detail — a thin rime film hazing the middle with a couple of
 *     clearer patches, and individual crystal facets twinkling slowly.
 *
 * Interaction (expanded only): drag to wipe the glass. The swipe clears a
 * finger-wide window down to the wet, glossy pane — the street lights come
 * through it sharply — leaves squeegee streaks inside it and a berm of frost
 * pushed onto its edges, and then refreezes from the rim inward over about
 * half a minute. u.live = (x, y, press, 0), y-up; each liveData vec4 is one
 * stamp as (x, y, strength, strokeBreak). Touch handlers are attached ONLY
 * when `expanded` so the banner card never steals the parent Pressable's tap
 * or the list scroll.
 */
export default function FrostMaterial({
  expanded = false,
  style,
  onLayout,
  ...rest
}: Props) {
  // params0.x — feature scale: 0 in the banner card, 1 full screen, so the
  // crystals stay finely feathered at both sizes.
  const params = useMemo(() => [expanded ? 1 : 0], [expanded]);

  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(INITIAL_LIVE);

  // All interaction state lives in per-instance refs — two mounted copies of
  // this component (list card + fullscreen overlay) never share anything.
  const sizeRef = useRef({ width: 1, height: 1 });
  const posRef = useRef({ x: 0.5, y: 0.5 });
  const pressRef = useRef(0);
  const targetRef = useRef(0);
  const trailRef = useRef<TrailPoint[]>([]);
  const lastStampRef = useRef<{ x: number; y: number } | null>(null);
  const smoothRef = useRef({ x: 0, y: 0 });
  const liveArrRef = useRef<number[]>(new Array(LIVE_SIZE).fill(0));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  const pushLive = useCallback(() => {
    const arr = liveArrRef.current;
    arr[0] = posRef.current.x;
    arr[1] = posRef.current.y;
    arr[2] = pressRef.current;
    arr[3] = 0;
    const trail = trailRef.current;
    for (let i = 0; i < MAX_TRAIL; i++) {
      const base = 4 + i * 4;
      const pnt = trail[i];
      arr[base] = pnt ? pnt.x : 0;
      arr[base + 1] = pnt ? pnt.y : 0;
      arr[base + 2] = pnt ? pnt.s : 0;
      arr[base + 3] = pnt ? pnt.brk : 0;
    }
    setParamsSynchronizable(...arr);
  }, [setParamsSynchronizable]);

  const step = useCallback(
    function tick(now: number) {
      const dt = Math.min(Math.max(now - lastTsRef.current, 0) / 1000, 0.1);
      lastTsRef.current = now;

      const target = targetRef.current;
      const tau = target > pressRef.current ? TAU_PRESS : TAU_RELEASE;
      let s =
        pressRef.current +
        (target - pressRef.current) * (1 - Math.exp(-dt / tau));
      if (Math.abs(s - target) < 0.004) {
        s = target;
      }
      pressRef.current = s;

      // The frost creeps back into every wipe at the same rate, so the
      // weakest stamps are always the oldest ones at the front.
      const trail = trailRef.current;
      const refreeze = Math.exp(-dt / REFREEZE_TAU);
      for (const pnt of trail) {
        pnt.s *= refreeze;
      }
      const over = trail.length - SOFT_CAP;
      if (over > 0) {
        const fast = Math.exp(-dt * 4);
        for (let i = 0; i < over + 6 && i < trail.length; i++) {
          trail[i]!.s *= fast;
        }
      }
      while (trail.length > 0 && trail[0]!.s < 0.02) {
        trail.shift();
      }

      pushLive();

      if (s !== target || trail.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    },
    [pushLive]
  );

  const kick = useCallback(() => {
    if (rafRef.current === null) {
      lastTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      sizeRef.current = {
        width: Math.max(width, 1),
        height: Math.max(height, 1),
      };
      onLayout?.(e);
    },
    [onLayout]
  );

  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = sizeRef.current;
      posRef.current = {
        x: Math.min(1, Math.max(0, locationX / width)),
        // nativeEvent is y-down in points; shader uv is y-up — flip.
        y: Math.min(1, Math.max(0, 1 - locationY / height)),
      };

      // Smooth the finger path so the wipe traces a steadied curve instead of
      // the raw jittery touch samples.
      const last = lastStampRef.current;
      const sm = smoothRef.current;
      if (!last) {
        sm.x = locationX;
        sm.y = locationY;
      } else {
        sm.x += (locationX - sm.x) * SMOOTHING;
        sm.y += (locationY - sm.y) * SMOOTHING;
      }
      const dx = last ? sm.x - last.x : 0;
      const dy = last ? sm.y - last.y : 0;
      if (!last || dx * dx + dy * dy >= TRAIL_SPACING * TRAIL_SPACING) {
        lastStampRef.current = { x: sm.x, y: sm.y };
        const trail = trailRef.current;
        trail.push({
          x: Math.min(1, Math.max(0, sm.x / width)),
          y: Math.min(1, Math.max(0, 1 - sm.y / height)),
          s: 1,
          brk: last ? 0 : 1,
        });
        if (trail.length > MAX_TRAIL) {
          trail.shift();
        }
      }
      targetRef.current = 1;
      // Write immediately so a drag tracks the finger even while the press
      // loop is idle at full strength.
      pushLive();
      kick();
    },
    [kick, pushLive]
  );

  const handleRelease = useCallback(() => {
    targetRef.current = 0;
    lastStampRef.current = null;
    kick();
  }, [kick]);

  // Collapsing refrosts the pane instantly so the banner is always pristine.
  // If the overlay closes mid-swipe we may never get a touch-end either.
  useEffect(() => {
    if (!expanded) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      trailRef.current = [];
      lastStampRef.current = null;
      targetRef.current = 0;
      pressRef.current = 0;
      pushLive();
    }
  }, [expanded, pushLive]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  // CRITICAL: in banner mode the parent Pressable owns the tap and the list
  // must scroll — attach touch handlers only when expanded.
  const touchProps = expanded
    ? {
        onTouchStart: handleTouch,
        onTouchMove: handleTouch,
        onTouchEnd: handleRelease,
        onTouchCancel: handleRelease,
      }
    : null;

  return (
    <View style={style} onLayout={handleLayout} {...rest} {...touchProps}>
      <ShaderView
        fragmentShader={FROST_SHADER}
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const FROST_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// One generation of crystal growth: noise stretched along a local growth
// direction, then ridged into filaments. The direction comes from a smooth
// angle field, so the needles of neighbouring crystals sweep and interleave
// the way a frosted pane's do instead of all combing one way.
fn fern(p: vec2<f32>, sc: f32, seed: f32) -> f32 {
  let a = (vnoise(p * 0.6 + vec2<f32>(seed, seed * 1.7)) - 0.5) * 6.5;
  let ca = cos(a);
  let sa = sin(a);
  let r = vec2<f32>(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
  let n = vnoise(vec2<f32>(r.x * sc, r.y * sc * 0.17)
                 + vec2<f32>(seed * 3.1, seed * 0.7));
  let rid = 1.0 - abs(n * 2.0 - 1.0);
  return rid * rid;
}

// A distant light, thrown far out of focus: a flat disc with a soft edge and
// a brighter rim, plus a wide atmospheric halo.
fn bokeh(d: f32, r: f32) -> f32 {
  let x = d / r;
  return smoothstep(1.05, 0.72, x) * (0.72 + 0.42 * smoothstep(0.30, 0.98, x))
       + exp(-x * x * 1.6) * 0.30;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  // Physical coordinates: height = 1 unit, width = aspect units.
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let md = min(aspect, 1.0);
  let xp = clamp(u.params0.x, 0.0, 1.0);
  let fMul = mix(1.0, 2.2, xp);

  // ---- The wipe: nearest distance to the swipe polyline -------------------
  var dMin = 1e9;
  var sNear = 0.0;
  for (var i = 0; i < 96; i = i + 1) {
    let a4 = u.liveData[i];
    if (a4.z < 0.004) { continue; }
    var b4 = a4;
    if (i < 95) {
      let nx = u.liveData[i + 1];
      if (nx.z >= 0.004 && nx.w < 0.5) { b4 = nx; }
    }
    let segA = vec2<f32>(a4.x * aspect, a4.y);
    let segB = vec2<f32>(b4.x * aspect, b4.y);
    let pa = p - segA;
    let ba = segB - segA;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    let off = pa - ba * h;
    let d2 = dot(off, off);
    if (d2 < dMin) {
      dMin = d2;
      sNear = mix(a4.z, b4.z, h);
    }
  }
  // The fingertip itself clears a little beyond the last stamp.
  let press = clamp(u.live.z, 0.0, 1.0);
  let tipD = length(p - vec2<f32>(u.live.x * aspect, u.live.y));
  var dWipe = sqrt(dMin);
  if (press > 0.01) {
    dWipe = min(dWipe, tipD + (1.0 - press) * 0.20);
    sNear = max(sNear, press);
  }
  // Ragged edge: a wiped window never has a clean border.
  dWipe = dWipe + (vnoise(p * 22.0) - 0.5) * 0.010
                + (vnoise(p * 60.0) - 0.5) * 0.005;

  let wRad = 0.052 * (0.30 + 0.70 * sNear);
  let wipe = (1.0 - smoothstep(wRad * 0.70, wRad * 1.05, dWipe))
           * smoothstep(0.02, 0.28, sNear);
  // Frost shoved onto the edge of the swipe, and left behind as it refreezes.
  let berm = smoothstep(wRad * 0.92, wRad * 1.18, dWipe)
           * (1.0 - smoothstep(wRad * 1.18, wRad * 1.9, dWipe))
           * smoothstep(0.02, 0.30, sNear);

  // ---- shared fields ------------------------------------------------------
  let warpRaw = vnoise(p * 2.6 * fMul + vec2<f32>(7.7, 3.9));
  let warp2 = warpRaw - 0.5;
  let midN = vnoise(p * 6.5 * fMul + vec2<f32>(3.1, 11.4));

  // ---- frost coverage -----------------------------------------------------
  // Grows in from the pane edges and out from a few nucleation points, with
  // an irregular front biased toward the lower left — a pane never frosts
  // evenly.
  let ex = min(p.x, aspect - p.x) / md;
  let ey = min(p.y, 1.0 - p.y) / md;
  var edgeD = min(ex, ey);
  // Nucleation points: two specks of dirt the frost also grew out from. The
  // pane ends up frosted over more or less edge to edge — it is a frozen
  // window, and the clear glass is what the finger is for.
  let n1 = length((p - vec2<f32>(aspect * 0.30, 0.78)) / vec2<f32>(1.3, 1.0));
  let n2 = length((p - vec2<f32>(aspect * 0.86, 0.28)) / vec2<f32>(1.0, 1.4));
  edgeD = min(edgeD, n1 * 0.70);
  edgeD = min(edgeD, n2 * 0.85);
  let asym = 0.055 * (1.0 - uv.x) + 0.045 * (1.0 - uv.y);
  let edgeN = edgeD + warp2 * 0.20 + (midN - 0.5) * 0.10 - asym;
  let depth = mix(0.32, 0.28, xp);
  let cover = smoothstep(depth, depth * 0.10, edgeN);
  let reach = smoothstep(depth * 2.1, depth * 0.25, edgeN);

  // ---- crystals -----------------------------------------------------------
  // Two generations of crystal: long needles with finer feathering over them.
  let fq = p * fMul + vec2<f32>(warp2 * 0.10, warp2 * -0.08);
  let c1 = fern(fq, 26.0, 1.0);
  let c2 = fern(fq * 2.1 + vec2<f32>(9.0, 4.0), 44.0, 5.0);
  let crys = c1 * (0.45 + 0.75 * c2);
  // Dense body against the edges, lone ferns fingering toward the middle.
  let body = cover * (0.34 + 0.66 * crys);
  let ferns = crys * reach * (1.0 - cover * 0.55) * 0.85;
  // Thin rime film over the open glass, with clearer wiped patches.
  let clearPatch = smoothstep(0.58, 0.80, warpRaw);
  let film = (0.05 + 0.10 * c1) * (1.0 - clearPatch * 0.65) * (1.0 - cover);

  // What the frost would be if nobody had touched the pane…
  let frostBase = clamp(body + ferns + film * 1.4, 0.0, 1.0);
  // …and what is left after the wipe. A refreezing wipe grows its crystals
  // back from the rim, so the clearing shrinks and re-hazes as sNear decays.
  let keep = 1.0 - wipe;
  let regrow = wipe * (1.0 - sNear) * crys * 0.55;
  let frostAll = clamp(frostBase * keep + regrow + berm * 0.35, 0.0, 1.0);

  // ---- night glass + the street beyond ------------------------------------
  var col = mix(vec3<f32>(0.022, 0.034, 0.066),
                vec3<f32>(0.052, 0.072, 0.118), uv.y);
  col = col + warp2 * vec3<f32>(0.010, 0.013, 0.020);
  // Sodium wash off the street below, so a wipe always reveals *something*
  // even where it opens onto no particular light.
  let glowY = uv.y - 0.02;
  col = col + vec3<f32>(0.90, 0.52, 0.26) * exp(-glowY * glowY * 5.0) * 0.10;

  let d1 = length(p - vec2<f32>(aspect * 0.74, 0.66)) / md;
  let d2 = length(p - vec2<f32>(aspect * 0.26, 0.34)) / md;
  let d3 = length(p - vec2<f32>(aspect * 0.52, 0.12)) / md;
  let br1 = 0.86 + 0.14 * sin(t * 0.10 + 1.3);
  let br2 = 0.86 + 0.14 * sin(t * 0.083 + 4.1);
  let lights = vec3<f32>(1.00, 0.72, 0.42) * bokeh(d1, 0.22) * br1 * 0.46
             + vec3<f32>(1.00, 0.56, 0.30) * bokeh(d2, 0.15) * br2 * 0.34
             + vec3<f32>(0.66, 0.78, 1.00) * bokeh(d3, 0.11) * 0.22;

  // Frost hides the direct view; a wiped, wet pane shows it sharpest of all.
  let seen = mix(1.0, 0.16, clamp(frostAll * 1.35, 0.0, 1.0));
  col = col + lights * (seen + wipe * 0.35);

  // ---- frost over the glass ----------------------------------------------
  let filmCol = vec3<f32>(0.42, 0.51, 0.66);
  col = mix(col, filmCol, clamp(film, 0.0, 1.0));
  let iceCol = vec3<f32>(0.62, 0.73, 0.86);
  col = mix(col, iceCol * (0.62 + 0.55 * crys), clamp(body, 0.0, 1.0) * keep);
  col = col + vec3<f32>(0.74, 0.83, 0.95) * ferns * keep * 0.85;
  col = col + vec3<f32>(0.70, 0.80, 0.94) * berm * 0.55;
  col = col + vec3<f32>(0.66, 0.76, 0.92) * regrow * 0.7;

  // The crystals scatter a warm halo around each light.
  let scatter = exp(-d1 * d1 * 2.2) * 0.5 + exp(-d2 * d2 * 2.8) * 0.3;
  col = col + vec3<f32>(1.0, 0.72, 0.45) * scatter * frostAll * 0.18;

  // ---- the wiped window ---------------------------------------------------
  // Squeegee streaks: thin films of meltwater dragged parallel to the swipe.
  let streak = (0.5 + 0.5 * sin(dWipe * 520.0 + vnoise(p * 30.0) * 4.0))
             * wipe * (1.0 - smoothstep(0.4, 1.0, sNear)) * 0.16
             + (0.5 + 0.5 * sin(dWipe * 240.0)) * wipe * 0.05;
  col = col + vec3<f32>(0.30, 0.40, 0.52) * streak;
  // Wet gloss on the cleared pane, brightest right at the rim.
  let wet = wipe * smoothstep(wRad * 0.35, wRad * 0.95, dWipe);
  col = col + vec3<f32>(0.36, 0.46, 0.60) * wet * 0.16;

  // ---- crystal facets, twinkling slowly -----------------------------------
  let sg = p * fMul * 34.0;
  let rnd = hash21(floor(sg));
  let frc = fract(sg) - 0.5;
  let pointGlint = exp(-dot(frc, frc) * 20.0);
  let tw0 = 0.5 + 0.5 * sin(t * (0.5 + rnd * 1.7) + rnd * 80.0);
  let tw = tw0 * tw0 * tw0 * tw0;
  col = col + vec3<f32>(0.90, 0.95, 1.0)
      * step(0.984, rnd) * pointGlint * tw * 1.3
      * clamp(frostAll * 1.6, 0.0, 1.0);

  // ---- frame, tone, grain -------------------------------------------------
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.32);
  col = col / (1.0 + col * 0.28);
  col = col + (hash21(uv * u.resolution.xy + fract(t) * 311.0) - 0.5) * 0.008;

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
