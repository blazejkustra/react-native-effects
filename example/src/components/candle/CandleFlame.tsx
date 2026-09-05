import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * `[wickX, wickY, flameHeight, flameHalfWidth, wickLength, wickRadius, 0, 0]`.
   * The wick tip is in screen uv (y-up); every size is a fraction of the
   * screen HEIGHT, so the flame keeps its proportions on any display.
   */
  params: number[];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The flame on top of a photographed birthday candle.
 *
 * A transparent full-screen pass laid over the cake photo (the photo's own
 * flame and wick have been painted out). It draws the wick, the flame, the
 * warm glow the flame throws on the wall and the frosting, the red-hot wick
 * tip and the wisp of smoke once it has been blown out, and a light veil that
 * dims the picture a touch while the candle is dark.
 *
 * The flame is the lighter's teardrop field in wick space, with the breath
 * (`gust`) folded in: it shortens the flame, fattens it, and cranks up the
 * coarse turbulence so the whole column snakes instead of merely leaning.
 * Output is premultiplied; layers are composited front-to-back with `over`.
 */
export default function CandleFlame({
  params,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={CANDLE_SHADER}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      transparent
      {...viewProps}
    />
  );
}

const CANDLE_SHADER = /* wgsl */ `
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
  for (var i = 0; i < 3; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

fn sdSeg(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Premultiplied source-over: src on top of dst.
fn over(dst: vec4<f32>, src: vec4<f32>) -> vec4<f32> {
  return src + dst * (1.0 - src.a);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let px = 1.0 / u.resolution.y;
  let aa = px * 1.5;

  let wick = u.params0.xy;
  let flameH = max(u.params0.z, 0.001);
  let flameW = max(u.params0.w, 0.0005);
  let wl = max(u.params1.x, 0.001);
  let wr = max(u.params1.y, 0.0005);

  let fl = clamp(u.live.x, 0.0, 1.4);
  let lean = clamp(u.live.y, -1.2, 1.2);
  let flare = clamp(u.live.z, 0.0, 1.0);
  let smoke = clamp(u.live.w, 0.0, 1.0);
  let phase = u.liveData[0].x;
  let smokeAge = clamp(u.liveData[0].y, 0.0, 1.0);
  let gust = clamp(u.liveData[0].z, 0.0, 1.0);
  let emberAge = clamp(u.liveData[0].w, 0.0, 1.0);
  let ember = (1.0 - emberAge) * (1.0 - emberAge);

  // Wick space: origin at the wick tip, y-up, ONE unit = the screen's height.
  let p = vec2<f32>((uv.x - wick.x) * aspect, uv.y - wick.y);

  // Flame space: wick space rotated so its y-axis runs along the flame. The
  // angle grows with distance from the wick, so the gas leaves the wick
  // straight up and only turns as it climbs — and the swing is an isometry,
  // so leaning never stretches the flame.
  let thFull = asin(clamp(lean, -0.92, 0.92));
  let r = length(p);
  let th = thFull * smoothstep(0.06 * flameH, 0.60 * flameH, r);
  let cs = cos(th);
  let sn = sin(th);
  let up = vec2<f32>(sin(thFull), cos(thFull));
  // The flame is born a third of the way DOWN the wick and wraps its tip —
  // a candle flame is not balanced on the very end of the thread.
  let pF = vec2<f32>(p.x, p.y + wl * 0.34);
  let fp = vec2<f32>(pF.x * cs - pF.y * sn, pF.x * sn + pF.y * cs);

  // Two flicker rates: a slow breath and a fast guttering; the breath adds a
  // third, ragged one.
  let fn1 = vnoise(vec2<f32>(phase * 2.7, 11.0));
  let fn2 = vnoise(vec2<f32>(phase * 8.3, 3.0));
  let flick = 0.86 + 0.18 * fn1 + 0.10 * fn2 - 0.30 * gust * fn2;
  let lit = fl * flick;

  var out = vec4<f32>(0.0);

  // ---- Veil: a photographic vignette top and bottom, and the picture dims a
  // touch while the candle is out — the flame was lighting the frosting. ----
  let vig = smoothstep(0.80, 1.00, uv.y) * 0.42 + smoothstep(0.20, 0.0, uv.y) * 0.55;
  let dim = (1.0 - min(fl, 1.0)) * 0.12;
  out = over(out, vec4<f32>(0.0, 0.0, 0.0, clamp(vig + dim, 0.0, 1.0)));

  // ---- Warm light on the wall and the frosting: additive (alpha 0). ----
  let lightPos = up * flameH * 0.40;
  let lp = p - lightPos;
  let ld2 = dot(lp, lp);
  var glow = vec3<f32>(1.00, 0.62, 0.22) * lit * 0.045 / (1.0 + ld2 * 260.0);
  glow = glow + vec3<f32>(1.00, 0.50, 0.16) * lit * 0.012 / (1.0 + ld2 * 40.0);
  out = over(out, vec4<f32>(glow, 0.0));

  // ---- The wick: a short dark thread from the candle to the tip, glowing
  // orange inside the flame and red-hot for a while after the snuff. ----
  let wickD = sdSeg(p, vec2<f32>(0.0, -wl), vec2<f32>(0.0004, 0.0)) - wr;
  let wickM = 1.0 - smoothstep(-aa, aa, wickD);
  let along = clamp((p.y + wl) / wl, 0.0, 1.0);
  var wickCol = mix(vec3<f32>(0.34, 0.28, 0.22), vec3<f32>(0.10, 0.08, 0.07), smoothstep(0.30, 0.85, along));
  wickCol = mix(wickCol, vec3<f32>(1.00, 0.62, 0.20), min(lit, 1.0) * smoothstep(0.30, 0.90, along));
  wickCol = mix(wickCol, vec3<f32>(0.95, 0.28, 0.05), ember * (0.7 + 0.3 * fn2) * smoothstep(0.55, 1.0, along));
  out = over(out, vec4<f32>(wickCol * wickM, wickM));

  // Ember glow: additive, tiny.
  let ed = dot(p, p);
  let emberGlow = ember * (0.75 + 0.25 * fn2);
  let eg = vec3<f32>(1.00, 0.36, 0.06) * emberGlow * exp(-ed * 26000.0) * 0.9
         + vec3<f32>(1.00, 0.30, 0.05) * emberGlow * exp(-ed * 2600.0) * 0.12;
  out = over(out, vec4<f32>(eg, 0.0));

  // ---- The flame. Uniform branch: costs nothing while it is out. ----
  if (fl > 0.002) {
    let hgt = flameH * fl * (0.90 + 0.18 * fn1) * (1.0 - 0.42 * gust);
    let s = fp.y / max(hgt, 0.0001);
    let sc = clamp(s, 0.0, 1.0);
    let xa = fp.x;

    // Spindle: narrow where it leaves the wick, widest a little under half
    // way, drawn to a point — the lighter's flame. 2.66 renormalises the
    // profile peak to wMax; a breath squashes it fatter as it shortens.
    let wMax = flameW * (0.58 + 0.42 * min(fl, 1.0)) * (1.0 + 0.35 * gust);
    let width = wMax * 2.66 * pow(sc + 0.01, 0.62) * pow(1.0 - sc, 0.85);

    // Turbulence in two parts: the coarse layer has NO x term, so it slides
    // the whole column sideways as one snaking body, and it is what the
    // breath turns up. The fine layer is scaled by the local width so the
    // point stays a point.
    let nA = fbm(vec2<f32>(s * 1.5 - phase * 1.30, 4.0));
    let nB = vnoise(vec2<f32>(xa / flameW * 2.2 + 7.0, s * 4.6 - phase * 2.4));
    let x = xa
          - (nA - 0.5) * flameW * (0.90 + 2.6 * gust) * smoothstep(0.05, 1.0, sc)
          - (nB - 0.5) * width * (0.42 + 0.5 * gust);

    let q = x / max(width, 0.00002);
    let core = clamp(1.0 - q * q, 0.0, 1.0);

    // Hard cut past the tip: the width floor above keeps a sub-pixel column
    // where q stays under 1, and without this it draws a hairline straight up.
    var dens = pow(core, 0.62) * smoothstep(-0.05, 0.10, s)
             * smoothstep(1.005, 0.965, s);
    dens = dens * (1.0 - 0.50 * smoothstep(0.40, 1.0, sc));
    // The base burns cooler and dimmer than the body above it.
    let blueZ = smoothstep(0.26, 0.01, sc);
    dens = dens * (1.0 - blueZ * 0.55);

    // Temperature ramp off the density: deep orange rim, amber, gold, and a
    // near-white heart that sits in the MIDDLE of the flame.
    var fcol = mix(vec3<f32>(1.00, 0.22, 0.02), vec3<f32>(1.00, 0.50, 0.07),
                   smoothstep(0.04, 0.40, dens));
    fcol = mix(fcol, vec3<f32>(1.00, 0.76, 0.28), smoothstep(0.32, 0.74, dens));
    let qi = x / max(width * 0.55, 0.00002);
    let inner = clamp(1.0 - qi * qi, 0.0, 1.0)
              * smoothstep(0.04, 0.26, sc)
              * (1.0 - smoothstep(0.34, 0.90, sc));
    fcol = mix(fcol, vec3<f32>(1.00, 0.93, 0.72), smoothstep(0.12, 0.72, inner));
    dens = dens + inner * 0.30;

    // The blue cone at the base, applied last so it wins over the yellow.
    let blue = blueZ * smoothstep(0.03, 0.35, core) * 0.95 * min(fl, 1.0);
    fcol = mix(fcol, vec3<f32>(0.20, 0.44, 1.00), blue);

    // Over a bright photo the flame has to COVER what is behind it: alpha
    // follows the density; the colour runs only a touch hotter than the alpha
    // so the rim glows without the whole body blowing out to white.
    let fa = clamp(dens * 1.25, 0.0, 1.0);
    let frgb = fcol * min(dens * (1.25 + 0.7 * flare) * (0.92 + 0.12 * fn2), 1.0);
    out = over(out, vec4<f32>(frgb, fa));

    // Halo, scaled by the flame's own height so it never detaches.
    let gp = vec2<f32>(fp.x, fp.y - hgt * 0.40) / max(hgt, 0.0001);
    let g2 = dot(gp * vec2<f32>(1.35, 0.95), gp * vec2<f32>(1.35, 0.95));
    let halo = exp(-g2 * 2.6) * 0.14 + exp(-g2 * 0.85) * 0.03;
    out = over(out, vec4<f32>(vec3<f32>(1.00, 0.52, 0.16) * halo * lit, 0.0));
  }

  // ---- Smoke: one thin wisp straight up from the wick, widening as it goes.
  // Drawn in wick space, not flame space — smoke does not care which way the
  // phone is tilted. ----
  if (smoke > 0.003) {
    let sy2 = p.y / (flameH * 1.9);
    let wsp = flameW * (0.55 + 3.0 * max(sy2, 0.0));
    let sx = p.x / max(wsp, 0.0001);
    let wispA = fbm(vec2<f32>(sx * 0.9 + 21.0, sy2 * 2.4 - phase * 0.75));
    let wispB = vnoise(vec2<f32>(sx * 2.1 + 5.0, sy2 * 5.5 - phase * 1.35));
    let wisp = clamp(wispA * 1.45 + (wispB - 0.5) * 0.45, 0.0, 1.2);
    let bot = smokeAge * 0.50;
    let colM = exp(-sx * sx * 1.1)
             * smoothstep(bot - 0.16, bot + 0.04, sy2)
             * (1.0 - smoothstep(0.24 + smokeAge * 1.1, 0.85 + smokeAge * 1.5, sy2));
    let sa = clamp(colM * (0.20 + 0.80 * wisp) * smoke * 0.80, 0.0, 1.0);
    out = over(out, vec4<f32>(vec3<f32>(0.42, 0.40, 0.38) * sa, sa));
  }

  // Dither the alpha too, or the veil bands on the wall.
  let dth = (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);
  return clamp(out + vec4<f32>(dth, dth, dth, dth), vec4<f32>(0.0), vec4<f32>(1.0));
}
`;
