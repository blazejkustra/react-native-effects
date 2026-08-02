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

/** Dye cycle: cognac tan → chocolate → oxblood → racing green → black. */
const DYE_COUNT = 5;
/** How long the new dye takes to soak across the whole surface. */
const SPREAD_MS = 1050;

/**
 * Full-grain leather.
 *
 * The grain is a connected crevice network (Worley cell borders) rather than
 * isolated bumps: rounded pads separated by thin seams, a finer secondary
 * network etched into each pad, and micro noise — bump-lit from the
 * upper-left with a satin specular on the pad crowns. Dye pools darker in
 * the crevices, large-scale fbm mottle keeps the tone uneven, and a few
 * meandering wrinkle lines cross the hide. The material itself is still.
 *
 * Interaction (expanded only): tapping re-dyes the leather. The next dye in
 * the cycle soaks outward from the tap point behind an irregular "wet"
 * front — a darker, slightly glossier soaking ring — until it covers the
 * hide. u.live = (x, y, progress, fromIdx * 8 + toIdx), y-up. Touch handlers
 * are attached ONLY when `expanded` so the banner card never steals the
 * parent Pressable's tap or list scroll.
 */
export default function LeatherMaterial({
  expanded = false,
  style,
  ...rest
}: Props) {
  const params = useMemo(() => [expanded ? 1 : 0], [expanded]);

  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0.5, 0.5, 0, 0]);

  // All per-instance mutable state lives in refs — two instances (banner +
  // fullscreen overlay) can be mounted at once without cross-talk.
  const sizeRef = useRef({ width: 1, height: 1 });
  const posRef = useRef({ x: 0.5, y: 0.5 });
  const fromRef = useRef(0);
  const toRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const step = useCallback(
    (ts: number) => {
      const t = Math.min((ts - startRef.current) / SPREAD_MS, 1);
      // Ease-out: dye rushes out of the tap point, then slows as it soaks.
      const eased = 1 - (1 - t) * (1 - t);
      const { x, y } = posRef.current;
      if (t >= 1) {
        fromRef.current = toRef.current;
        setParamsSynchronizable(x, y, 0, fromRef.current * 8 + fromRef.current);
        rafRef.current = null;
      } else {
        setParamsSynchronizable(
          x,
          y,
          eased,
          fromRef.current * 8 + toRef.current
        );
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [setParamsSynchronizable]
  );

  const onShaderLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }, []);

  const onTap = useCallback(
    (e: GestureResponderEvent) => {
      // A tap mid-spread commits the in-flight dye and starts the next one.
      if (rafRef.current !== null) {
        stopLoop();
        fromRef.current = toRef.current;
      }
      toRef.current = (fromRef.current + 1) % DYE_COUNT;
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = sizeRef.current;
      posRef.current = {
        x: Math.min(Math.max(locationX / width, 0), 1),
        // nativeEvent points are y-down; shader uv is y-up.
        y: Math.min(Math.max(1 - locationY / height, 0), 1),
      };
      startRef.current = performance.now();
      setParamsSynchronizable(
        posRef.current.x,
        posRef.current.y,
        0,
        fromRef.current * 8 + toRef.current
      );
      rafRef.current = requestAnimationFrame(step);
    },
    [setParamsSynchronizable, step, stopLoop]
  );

  // Collapsing (or unmounting) commits whatever dye was spreading.
  useEffect(() => {
    if (!expanded) {
      stopLoop();
      fromRef.current = toRef.current;
      setParamsSynchronizable(
        0.5,
        0.5,
        0,
        fromRef.current * 8 + fromRef.current
      );
    }
    return stopLoop;
  }, [expanded, stopLoop, setParamsSynchronizable]);

  // CRITICAL: in banner mode the parent Pressable owns the tap and the list
  // must scroll — attach touch handlers only when expanded.
  const touchProps = expanded ? { onTouchStart: onTap } : null;

  return (
    <View style={style} {...rest}>
      <ShaderView
        fragmentShader={LEATHER_SHADER}
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        onLayout={onShaderLayout}
        style={StyleSheet.absoluteFill}
        {...touchProps}
      />
    </View>
  );
}

const LEATHER_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
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

// (F1, F2): distance to nearest and second-nearest jittered cell point.
// F2 - F1 goes to 0 exactly on cell borders — the leather crevice network.
fn worley2(p: vec2<f32>) -> vec2<f32> {
  let ip = floor(p);
  let fp = fract(p);
  var d1 = 8.0;
  var d2 = 8.0;
  for (var yi = -1; yi <= 1; yi = yi + 1) {
    for (var xi = -1; xi <= 1; xi = xi + 1) {
      let o = vec2<f32>(f32(xi), f32(yi));
      let q = o + hash22(ip + o) - fp;
      let dd = dot(q, q);
      if (dd < d1) {
        d2 = d1;
        d1 = dd;
      } else {
        d2 = min(d2, dd);
      }
    }
  }
  return vec2<f32>(sqrt(d1), sqrt(d2));
}

// Leather grain height: rounded pads separated by a thin connected crevice
// network, a finer secondary network etched into the pads, and micro noise.
// 1 = pad crown, 0 = crevice floor.
fn grainH(p: vec2<f32>) -> f32 {
  let w1 = worley2(p);
  // Narrow shoulders: most of each pad is a flat top so the network reads
  // as grooves engraved into a continuous hide, not separate beans.
  let pad = smoothstep(0.02, 0.34, w1.y - w1.x);
  var h = pad * (0.94 + 0.06 * (1.0 - smoothstep(0.0, 0.60, w1.x)));
  let w2 = worley2(p * 2.6 + vec2<f32>(11.7, 7.3));
  h = h * (0.92 + 0.08 * smoothstep(0.0, 0.40, w2.y - w2.x));
  return h + (vnoise(p * 7.0) - 0.5) * 0.03;
}

// Classic leather dyes, light (pad tops) and dark (mottle lows) tones:
// 0 cognac tan, 1 chocolate, 2 oxblood, 3 racing green, 4 black.
fn dyeHi(i: f32) -> vec3<f32> {
  if (i < 0.5) { return vec3<f32>(0.640, 0.400, 0.205); }
  if (i < 1.5) { return vec3<f32>(0.340, 0.205, 0.115); }
  if (i < 2.5) { return vec3<f32>(0.480, 0.150, 0.130); }
  if (i < 3.5) { return vec3<f32>(0.215, 0.320, 0.205); }
  return vec3<f32>(0.200, 0.195, 0.200);
}

fn dyeLo(i: f32) -> vec3<f32> {
  if (i < 0.5) { return vec3<f32>(0.340, 0.185, 0.090); }
  if (i < 1.5) { return vec3<f32>(0.150, 0.085, 0.048); }
  if (i < 2.5) { return vec3<f32>(0.225, 0.058, 0.055); }
  if (i < 3.5) { return vec3<f32>(0.088, 0.140, 0.088); }
  return vec3<f32>(0.058, 0.057, 0.062);
}

// One meandering wrinkle: a shadowed groove whose lower wall (facing the
// upper-left light) catches a faint lip highlight; depth fades in and out
// along its length. Returns signed brightness (negative = groove shadow).
fn crease(uvy: f32, xw: f32, baseY: f32, slope: f32, amp: f32, wf: f32,
          seed: f32, pxPerUv: f32, wPx: f32) -> f32 {
  let cy = baseY + slope * xw
         + (vnoise(vec2<f32>(xw * wf, seed)) - 0.5) * amp;
  let dpx = (uvy - cy) * pxPerUv;
  let iw = 1.0 / (wPx * wPx);
  let core = exp(-dpx * dpx * iw);
  let lip = exp(-(dpx + 2.0 * wPx) * (dpx + 2.0 * wPx) * iw * 0.55);
  let dep = smoothstep(0.30, 0.60,
                       vnoise(vec2<f32>(xw * 0.9 + seed * 5.3, seed * 2.1)));
  return dep * (lip * 0.45 - core);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let p = vec2<f32>(uv.x * aspect, uv.y);

  // 0 = banner card, 1 = full screen: scale grain so pebbles stay a
  // believable physical size in both.
  let ex = clamp(u.params0.x, 0.0, 1.0);
  let gMul = mix(1.0, 6.0, ex);

  // Gentle domain warp so the cell network never reads as an even lattice.
  let warp = vec2<f32>(fbm(p * 1.6 + vec2<f32>(5.2, 1.3)) - 0.5,
                       fbm(p * 1.6 + vec2<f32>(9.1, 6.7)) - 0.5);
  var pg = (p + warp * 0.10) * 13.0 * gMul;
  // Cell-scale wobble bends the straight Voronoi borders into organic
  // pebble outlines — without this the pads read as sharp facets.
  pg = pg + vec2<f32>(vnoise(pg * 0.33 + vec2<f32>(7.0, 2.0)) - 0.5,
                      vnoise(pg * 0.33 + vec2<f32>(3.0, 8.0)) - 0.5) * 1.5;

  // Bump normal from finite differences of the grain height field.
  let eps = 0.14;
  let h0 = grainH(pg);
  let hx = grainH(pg + vec2<f32>(eps, 0.0));
  let hy = grainH(pg + vec2<f32>(0.0, eps));
  let nrm = normalize(vec3<f32>((h0 - hx) * 0.55 / eps,
                                (h0 - hy) * 0.55 / eps, 1.0));
  let ldir = normalize(vec3<f32>(-0.45, 0.55, 0.70));
  let dif = clamp(dot(nrm, ldir), 0.0, 1.0);
  let hv = normalize(ldir + vec3<f32>(0.0, 0.0, 1.0));
  let spec = pow(clamp(dot(nrm, hv), 0.0, 1.0), 14.0);

  // ---- Dye wipe (u.live = x, y, progress, fromIdx*8 + toIdx; y-up). ----
  // The next dye soaks outward from the tap point behind an irregular wet
  // front. At rest progress = 0 and from == to, so this is a no-op.
  let pair = u.live.w;
  let fromI = floor(pair / 8.0);
  let toI = pair - fromI * 8.0;
  let prog = clamp(u.live.z, 0.0, 1.0);
  let tp = vec2<f32>(u.live.x * aspect, u.live.y);
  let dc = length(p - tp);
  let edgeN = (fbm(p * 6.0 + vec2<f32>(31.0, 17.0)) - 0.5) * 0.14;
  let radius = prog * 1.5;
  let dyeM = smoothstep(radius, radius - 0.14, dc + edgeN);
  let running = step(0.0005, prog) * (1.0 - step(0.9995, prog));
  let front = exp(-abs(dc + edgeN - radius) * 26.0) * running;

  let lo = mix(dyeLo(fromI), dyeLo(toI), dyeM);
  let hi = mix(dyeHi(fromI), dyeHi(toI), dyeM);

  // ---- Albedo: dye + large-scale mottle, pooling darker in crevices. ----
  let mot = fbm(p * 2.1 * mix(1.0, 1.8, ex) + vec2<f32>(3.1, 7.7));
  let mv = smoothstep(0.25, 0.75, mot);
  var alb = mix(lo, hi, 0.20 + 0.62 * mv);
  alb = alb * mix(0.82, 1.0, smoothstep(0.0, 0.50, h0));
  // Wet soaking ring where the new dye is advancing.
  alb = alb * (1.0 - front * 0.30);

  // ---- Lighting: soft diffuse + satin specular on the pad crowns. ----
  var col = alb * (0.68 + 0.50 * dif);
  let crown = smoothstep(0.35, 0.95, h0);
  col = col + vec3<f32>(1.0, 0.93, 0.82) * spec * crown * 0.10;
  // Fresh dye glistens just behind the wet front.
  col = col + vec3<f32>(1.0, 0.95, 0.88) * front * spec * 0.25;

  // ---- A few meandering wrinkles (not a grid, unevenly spaced). ----
  let xw = p.x * mix(1.0, 2.6, ex);
  let pxPerUv = u.resolution.y;
  let wPx = 1.5 * max(u.resolution.w, 1.0);
  var cr = 0.0;
  cr = cr + crease(uv.y, xw, 0.72, 0.030, 0.10, 1.1, 2.7, pxPerUv, wPx);
  cr = cr + crease(uv.y, xw, 0.40, -0.050, 0.16, 0.7, 9.4, pxPerUv, wPx);
  cr = cr + crease(uv.y, xw, 0.18, 0.015, 0.07, 1.6, 5.1, pxPerUv, wPx);
  col = col * (1.0 + cr * 0.30);

  // ---- Sparse pores on the pads. ----
  let pp = pg * 2.4;
  let pc = floor(pp);
  let jit = (hash22(pc + vec2<f32>(17.0, 9.0)) - 0.5) * 0.5;
  let pd = fract(pp) - 0.5 - jit;
  let pore = smoothstep(0.045, 0.010, dot(pd, pd)) * step(0.80, hash21(pc));
  col = col * (1.0 - pore * 0.12);

  // ---- Finish: upper-left light, vignette, worn edge burnish. ----
  let gl = (1.0 - uv.x) * 0.35 + uv.y * 0.65;
  col = col * (0.92 + 0.14 * gl);
  let vd = (uv - 0.5) * vec2<f32>(1.15, 1.35);
  let burn = dot(vd, vd);
  col = col * (1.0 - burn * 0.20);
  let edge = smoothstep(0.16, 0.52, burn);
  col = col * mix(vec3<f32>(1.0), vec3<f32>(0.80, 0.74, 0.68), edge);

  // Pull saturation toward luma — tasteful, not arcade.
  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(luma), col, 0.90);

  // Static grain dither kills banding on the smooth dye gradients.
  let dn = hash21(uv * u.resolution.xy) - 0.5;
  col = col + dn * (1.5 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
