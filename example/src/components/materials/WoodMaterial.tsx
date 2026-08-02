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

/** Max burn stamps — must match the shader's liveData loop bound. */
const MAX_TRAIL = 96;
/** Past this the oldest char fades out to free slots (see SandMaterial). */
const SOFT_CAP = MAX_TRAIL - 10;
/** Min finger travel (pt) between stamps — the segments chain into a stroke. */
const TRAIL_SPACING = 10;
/** Ember cooling time constant (s): glow gone ~2 s after the iron passes. */
const COOL_TAU = 0.7;
/** Iron-tip glow decay after release (s). */
const TIP_TAU = 0.35;
/** EMA factor for finger smoothing — the burn follows a steadied path. */
const SMOOTHING = 0.5;

/** Live channel: header (tipX, tipY, tipHeat, 0) + MAX_TRAIL × (x, y, char, heat|brk). */
const LIVE_SIZE = 4 + MAX_TRAIL * 4;
const INITIAL_LIVE = [0.5, 0.5, 0, ...new Array(LIVE_SIZE - 3).fill(0)];

type BurnPoint = {
  x: number;
  y: number;
  /** Char amount, 1 until the ring buffer forces it out. */
  c: number;
  /** Ember heat, decaying to 0 as the burn cools. */
  h: number;
  /** 1 on the first stamp of a stroke — no segment bridges the gap. */
  brk: number;
};

/**
 * Oiled walnut board, and a pyrography iron.
 *
 * Layers:
 *  1. Base field — growth rings treated as nested cylinders in the log, so the
 *     cathedral arcs come from a true 3D slice, with an asymmetric latewood
 *     profile (slow darkening into a dense band, fast return to pale
 *     earlywood) and per-ring density jitter. Knots are branch stubs.
 *  2. Mid structure — open walnut pores drawn as dashed lines running *along*
 *     the ring contours (that parallelism is what makes wood read as wood),
 *     plus sparse medullary ray flecks across the grain.
 *  3. Micro detail — an anisotropic satin varnish sheen that rides the
 *     earlywood (chatoyance), fine end-grain fuzz, and dither.
 *
 * Interaction (expanded only): drag to brand the board. The stroke chars a
 * ragged black trench whose alligator-cracked plates still glow orange while
 * hot, throwing warm light onto the wood around it, with an ember-bright tip
 * under the finger and a wisp of smoke rising off it. The char cools over ~2 s
 * and then stays burnt in. u.live = (tipX, tipY, tipHeat, 0), y-up; each
 * liveData vec4 is (x, y, char, heat + 2 × strokeBreak). Touch handlers are
 * attached ONLY when `expanded` so the banner card never steals the parent
 * Pressable's tap or the list scroll.
 */
export default function WoodMaterial({
  expanded = false,
  style,
  onLayout,
  ...rest
}: Props) {
  const params = useMemo(() => [expanded ? 1 : 0], [expanded]);

  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(INITIAL_LIVE);

  // All per-instance mutable state lives in refs — two instances (banner +
  // fullscreen overlay) can be mounted at once without cross-talk.
  const sizeRef = useRef({ width: 1, height: 1 });
  const tipRef = useRef({ x: 0.5, y: 0.5 });
  const tipHeatRef = useRef(0);
  const touchingRef = useRef(false);
  const trailRef = useRef<BurnPoint[]>([]);
  const lastStampRef = useRef<{ x: number; y: number } | null>(null);
  const smoothRef = useRef({ x: 0, y: 0 });
  const liveArrRef = useRef<number[]>(new Array(LIVE_SIZE).fill(0));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  const pushLive = useCallback(() => {
    const arr = liveArrRef.current;
    arr[0] = tipRef.current.x;
    arr[1] = tipRef.current.y;
    arr[2] = tipHeatRef.current;
    arr[3] = 0;
    const trail = trailRef.current;
    for (let i = 0; i < MAX_TRAIL; i++) {
      const base = 4 + i * 4;
      const pnt = trail[i];
      arr[base] = pnt ? pnt.x : 0;
      arr[base + 1] = pnt ? pnt.y : 0;
      arr[base + 2] = pnt ? pnt.c : 0;
      // Heat rides in 0..1 with the stroke-break flag packed on top of it.
      arr[base + 3] = pnt ? pnt.h + pnt.brk * 2 : 0;
    }
    setParamsSynchronizable(...arr);
  }, [setParamsSynchronizable]);

  const step = useCallback(
    function tick(now: number) {
      const dt = Math.min(Math.max(now - lastTsRef.current, 0) / 1000, 0.1);
      lastTsRef.current = now;

      const cool = Math.exp(-dt / COOL_TAU);
      const trail = trailRef.current;
      let hottest = 0;
      for (const pnt of trail) {
        pnt.h *= cool;
        if (pnt.h > hottest) {
          hottest = pnt.h;
        }
      }

      // Near capacity the oldest char dusts off so a very long burn melts away
      // at the tail instead of popping when the ring buffer overflows.
      const over = trail.length - SOFT_CAP;
      let fading = false;
      if (over > 0) {
        const fast = Math.exp(-dt * 1.6);
        for (let i = 0; i < over + 6 && i < trail.length; i++) {
          trail[i]!.c *= fast;
        }
        fading = true;
      }
      while (trail.length > 0 && trail[0]!.c < 0.02) {
        trail.shift();
      }

      if (!touchingRef.current) {
        tipHeatRef.current *= Math.exp(-dt / TIP_TAU);
        if (tipHeatRef.current < 0.01) {
          tipHeatRef.current = 0;
        }
      }

      pushLive();

      const busy =
        touchingRef.current || tipHeatRef.current > 0 || hottest > 0.01;
      if (busy || fading) {
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
      touchingRef.current = true;
      tipHeatRef.current = 1;

      // Smooth the finger path so the burn traces a steadied curve instead of
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
      tipRef.current = {
        x: Math.min(1, Math.max(0, sm.x / width)),
        // nativeEvent is y-down in points; shader uv is y-up — flip.
        y: Math.min(1, Math.max(0, 1 - sm.y / height)),
      };

      const dx = last ? sm.x - last.x : 0;
      const dy = last ? sm.y - last.y : 0;
      if (!last || dx * dx + dy * dy >= TRAIL_SPACING * TRAIL_SPACING) {
        lastStampRef.current = { x: sm.x, y: sm.y };
        const trail = trailRef.current;
        trail.push({
          x: tipRef.current.x,
          y: tipRef.current.y,
          c: 1,
          h: 1,
          brk: last ? 0 : 1,
        });
        if (trail.length > MAX_TRAIL) {
          trail.shift();
        }
      }
      // Write immediately so the iron tracks the finger even between frames.
      pushLive();
      kick();
    },
    [kick, pushLive]
  );

  const handleRelease = useCallback(() => {
    touchingRef.current = false;
    lastStampRef.current = null;
    kick();
  }, [kick]);

  // Collapsing (or unmounting) planes the board clean for next time. If the
  // overlay closes mid-stroke we may never get a touch-end, so reset here too.
  useEffect(() => {
    if (!expanded) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      trailRef.current = [];
      lastStampRef.current = null;
      touchingRef.current = false;
      tipHeatRef.current = 0;
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
        fragmentShader={WOOD_SHADER}
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        isStatic={!expanded}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const WOOD_SHADER = /* wgsl */ `
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

// 3-octave variant for the low-frequency warp field — its 4th octave is
// invisible at warp scale.
fn fbm3(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 3; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// Incandescent wood: dull cherry red through orange to a pale yellow-white.
fn emberCol(h: f32) -> vec3<f32> {
  let a = vec3<f32>(0.62, 0.055, 0.010);
  let b = vec3<f32>(1.00, 0.380, 0.055);
  let c = vec3<f32>(1.00, 0.850, 0.480);
  var e = mix(a, b, smoothstep(0.0, 0.55, h));
  e = mix(e, c, smoothstep(0.60, 1.0, h));
  return e;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  // Physical coords (height = 1 unit) for the burn, and a scaled domain for
  // the board so features keep a sensible size in the banner and full screen.
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let ex = clamp(u.params0.x, 0.0, 1.0);
  let q = p * mix(1.0, 2.4, ex);

  // ---- Burn trail: nearest distance to the stroke polyline ----------------
  // Capsule segments; a stamp with the break flag starts a new stroke and is
  // never bridged from its predecessor.
  var dMin = 1e9;
  var charN = 0.0;
  var heatN = 0.0;
  for (var i = 0; i < 96; i = i + 1) {
    let a4 = u.liveData[i];
    if (a4.z < 0.004) { continue; }
    var b4 = a4;
    if (i < 95) {
      let nx = u.liveData[i + 1];
      if (nx.z >= 0.004 && nx.w < 1.5) { b4 = nx; }
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
      charN = mix(a4.z, b4.z, h);
      let ha = a4.w - 2.0 * step(1.5, a4.w);
      let hb = b4.w - 2.0 * step(1.5, b4.w);
      heatN = mix(ha, hb, h);
    }
  }
  let dSeg = sqrt(dMin);

  // ---- Layer 1: the board -------------------------------------------------
  let warp = fbm3(vec2<f32>(q.x * 0.9 + 0.5, q.y * 2.2 + 0.9));
  // Elongated grain streaks, ~11x stretched along x.
  let grain = fbm(vec2<f32>(q.x * 1.4, q.y * 16.0 + (warp - 0.5) * 3.0));

  // Growth rings as a slice through nested cylinders: the cut plane's 3D
  // distance to the pith axis is what bends flat-sawn cathedral arcs.
  let pith = vec2<f32>(0.62, -1.10);
  let rv = q - pith;
  let rd = length(vec3<f32>(rv.x * 0.26, rv.y, 0.82));
  var rc = rd * mix(10.0, 13.0, ex) + (warp - 0.5) * 2.4 + (grain - 0.5) * 0.9;

  // Knots: branch stubs that swell the rings around them and darken the core.
  let ka = q - vec2<f32>(2.15, 0.72);
  let kad = dot(vec2<f32>(ka.x, ka.y * 2.2), vec2<f32>(ka.x, ka.y * 2.2));
  let kb = q - vec2<f32>(0.42, 1.85);
  let kbd = dot(vec2<f32>(kb.x, kb.y * 2.0), vec2<f32>(kb.x, kb.y * 2.0));
  rc = rc + 3.0 * exp(-kad * 34.0) + 2.4 * exp(-kbd * 40.0);
  let knotDark = exp(-kad * 90.0) * 0.55 + exp(-kbd * 110.0) * 0.48;

  // Asymmetric ring profile: a slow darkening into dense latewood, then a
  // fast (but band-limited, so it never aliases) return to pale earlywood.
  let rw = fract(rc);
  let ringJit = hash21(vec2<f32>(floor(rc), 4.7));
  let late = smoothstep(0.34, 0.90, rw) * (1.0 - smoothstep(0.90, 0.985, rw))
           * (0.62 + 0.38 * ringJit);

  var tone = 0.52 + (grain - 0.5) * 0.85 - late * 0.62 + (warp - 0.5) * 0.22;
  tone = clamp(tone, 0.0, 1.0);
  let honey = vec3<f32>(0.540, 0.345, 0.158);
  let choco = vec3<f32>(0.098, 0.055, 0.042);
  var col = mix(choco, honey, tone * tone);
  // Latewood leans red, like walnut.
  col = col + vec3<f32>(0.040, 0.010, 0.002) * late;
  col = mix(col, vec3<f32>(0.070, 0.040, 0.026), clamp(knotDark, 0.0, 1.0));

  // ---- Layer 2: open pores, dashed and running along the rings ------------
  let poreC = rc * 5.0 + (vnoise(vec2<f32>(q.x * 3.0, q.y * 26.0)) - 0.5) * 0.9;
  let poreLine = 1.0 - abs(fract(poreC) * 2.0 - 1.0);
  let pore = poreLine * poreLine * poreLine * poreLine * poreLine * poreLine;
  let poreDash = smoothstep(0.40, 0.82,
                            vnoise(vec2<f32>(q.x * 26.0, rc * 2.6)));
  col = col * (1.0 - pore * poreDash * 0.28);

  // Sparse medullary ray flecks: short pale slivers across the grain.
  let rayN = vnoise(vec2<f32>(q.x * 78.0, q.y * 2.4 + 13.0));
  let fleck = smoothstep(0.84, 0.99, rayN) * (1.0 - late) * 0.6;
  col = col + vec3<f32>(0.060, 0.042, 0.024) * fleck;

  // ---- Layer 3: satin varnish sheen, riding the earlywood (chatoyance) ----
  let sheenAxis = uv.y - 0.66 + (warp - 0.5) * 0.30 + sin(t * 0.05) * 0.04;
  var sheen = exp(-sheenAxis * sheenAxis * 17.0);
  sheen = sheen * (0.30 + 0.70 * (1.0 - late)) * (0.45 + 0.55 * grain);
  col = col + vec3<f32>(1.0, 0.80, 0.52) * sheen * 0.17;
  col = mix(col, vec3<f32>(1.0, 0.94, 0.84), sheen * 0.045);
  let sheen2 = uv.y - 0.17 - (warp - 0.5) * 0.24;
  col = col + vec3<f32>(1.0, 0.86, 0.62) * exp(-sheen2 * sheen2 * 38.0) * 0.04;

  // ---- Pyrography: scorch halo, char, embers ------------------------------
  // Ragged edge: fine, high-frequency wobble so the burn is never a clean pipe.
  let rag = (vnoise(p * 26.0) - 0.5) * 0.011
          + (vnoise(p * 78.0) - 0.5) * 0.005;
  let dB = dSeg + rag;
  let w0 = 0.0125;
  let ch = clamp(charN, 0.0, 1.0);
  let core = (1.0 - smoothstep(w0 * 0.62, w0 * 1.05, dB)) * ch;
  let scorch = (1.0 - smoothstep(w0 * 0.90, w0 * 3.4, dB)) * ch;

  // Toasted wood around the cut: darker, browner, and losing its sheen —
  // the halo is most of what tells the eye the surface was burnt, not drawn.
  let scorchN = 0.65 + 0.35 * vnoise(p * 18.0);
  let toast = clamp(scorch * scorchN, 0.0, 1.0);
  col = mix(col, col * vec3<f32>(0.40, 0.27, 0.19), toast * 0.95);

  // Char plates: burnt wood curls into alligator-skin islands, each one a
  // slightly different shade, with pale ash settled in the low spots.
  let plateN = vnoise(p * 165.0);
  let plateRid = 1.0 - abs(plateN * 2.0 - 1.0);
  let crackLine = smoothstep(0.62, 0.97, plateRid);
  let plateId = hash21(floor(p * 78.0) + vec2<f32>(3.0, 11.0));
  let ash = smoothstep(0.55, 0.95, vnoise(p * 30.0 + vec2<f32>(9.0, 4.0)));
  var charCol = vec3<f32>(0.030, 0.024, 0.022) * (0.5 + 1.1 * plateId);
  charCol = mix(charCol, vec3<f32>(0.135, 0.126, 0.118), ash * 0.55);
  charCol = charCol * (1.0 - crackLine * 0.45);
  col = mix(col, charCol, core);

  // Embers: the cracks between the plates glow, brightest at the rim where
  // fresh wood is still catching.
  let hot = clamp(heatN, 0.0, 1.0);
  let rim = (1.0 - smoothstep(w0 * 0.55, w0 * 1.30, dB))
          * smoothstep(w0 * 0.10, w0 * 0.80, dB);
  let glow = hot * (core * (0.18 + crackLine * 1.05) + rim * 0.75);
  col = col + emberCol(hot) * glow * 1.6;
  // Warm light thrown onto the wood beside the burn.
  let warmCast = exp(-max(dB - w0, 0.0) * 20.0) * hot;
  col = col + vec3<f32>(1.0, 0.42, 0.11) * warmCast * 0.30;

  // ---- The iron tip: white-hot point + a wisp of smoke rising off it ------
  let tipH = clamp(u.live.z, 0.0, 1.0);
  if (tipH > 0.01) {
    let tip = vec2<f32>(u.live.x * aspect, u.live.y);
    let rel = p - tip;
    let td = dot(rel, rel);
    col = col + vec3<f32>(1.0, 0.72, 0.34) * exp(-td * 1400.0) * tipH * 0.9;
    let hgt = rel.y;
    if (hgt > 0.0) {
      // A thin plume that widens and thins as it rises, torn up by noise
      // scrolling upward through it. Kept faint: heavy smoke over dark wood
      // reads as fog, not as a wisp.
      let wid = 0.012 + hgt * 0.30;
      let sway = sin(hgt * 9.0 - t * 1.3) * 0.06 * hgt;
      let lat = (rel.x - sway) / wid;
      let plume = exp(-lat * lat * 1.6) * exp(-hgt * 7.0)
                * smoothstep(0.0, 0.03, hgt);
      let sn = fbm(vec2<f32>(rel.x * 13.0, hgt * 8.0 - t * 1.3));
      let smoke = plume * smoothstep(0.30, 0.80, sn) * tipH * 0.30;
      col = mix(col, vec3<f32>(0.46, 0.44, 0.42), clamp(smoke, 0.0, 1.0));
    }
  }

  // ---- Finish -------------------------------------------------------------
  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(luma), col, 0.94);
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.30);

  // Static fine dither so the dark gradients never band.
  col = col + (hash21(uv * u.resolution.xy) - 0.5) * (1.5 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
