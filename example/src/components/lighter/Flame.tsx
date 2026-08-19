import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * `[wickX, wickY, flameHeight, flameHalfWidth]`. The wick is in screen uv
   * (y-up); the two sizes are fractions of the screen HEIGHT, so the flame
   * keeps its proportions on any display.
   */
  params: number[];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The flame, and the room it lights.
 *
 * One opaque full-screen pass rather than a bounded overlay: a flame is mostly
 * the light it throws, and a glow that stops at a view's edge stops looking
 * like light. So this draws the dark room, the warm pool the flame casts into
 * it, the flame itself and the smoke that follows it out — with the lighter's
 * hardware composited on top by its own view, which is what hides the wick and
 * the bottom of the flame.
 *
 * The flame is a teardrop field in wick-space: a width profile that bulges at
 * a third of the height and tapers to a point, an axis bent by `lean` (more
 * the higher you go, so the base stays welded to the wick), and two scrolling
 * noise layers whose amplitude grows toward the tip. Colour comes off the
 * density: deep orange rim, amber, gold, a near-white core that fades out
 * before the tip, and the blue cone at the base where the gas burns cleanest.
 */
export default function Flame({
  params,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={FLAME_SHADER}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const FLAME_SHADER = /* wgsl */ `
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

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;

  let wick = u.params0.xy;
  let flameH = max(u.params0.z, 0.001);
  let flameW = max(u.params0.w, 0.0005);

  let fl = clamp(u.live.x, 0.0, 1.4);
  let lean = clamp(u.live.y, -1.2, 1.2);
  let flare = clamp(u.live.z, 0.0, 1.0);
  let smoke = clamp(u.live.w, 0.0, 1.0);
  let phase = u.liveData[0].x;
  let smokeAge = clamp(u.liveData[0].y, 0.0, 1.0);

  // Wick space: origin at the wick, y-up, ONE unit = the screen's height, so
  // x has to be stretched by the aspect to stay isotropic.
  let p = vec2<f32>((uv.x - wick.x) * aspect, uv.y - wick.y);

  // Flame space: wick space rotated so its y-axis runs along the flame.
  //
  // The rotation angle GROWS with distance from the wick. That matters twice
  // over: rotating by an angle that depends only on the radius is an isometry
  // in that radius, so the flame swings without the stretching a plain x-shear
  // gives it; and because the angle is ~0 at the wick, the gas still leaves
  // the chimney mouth straight up and only turns to vertical as it climbs —
  // rotating the whole thing rigidly instead swings the root out from behind
  // the windscreen and the flame appears to start in mid-air.
  let thFull = asin(clamp(lean, -0.92, 0.92));
  let r = length(p);
  let th = thFull * smoothstep(0.06 * flameH, 0.60 * flameH, r);
  let cs = cos(th);
  let sn = sin(th);
  let up = vec2<f32>(sin(thFull), cos(thFull));
  let fp = vec2<f32>(p.x * cs - p.y * sn, p.x * sn + p.y * cs);

  // Two flicker rates: a slow breath and a fast guttering.
  let fn1 = vnoise(vec2<f32>(phase * 2.7, 11.0));
  let fn2 = vnoise(vec2<f32>(phase * 8.3, 3.0));
  let flick = 0.84 + 0.20 * fn1 + 0.12 * fn2;
  let lit = fl * flick;

  // ---- The room: near-black, barely warmer toward the floor. ----
  var col = vec3<f32>(0.012, 0.010, 0.010);
  col = col + vec3<f32>(0.020, 0.013, 0.009) * (1.0 - smoothstep(0.0, 0.85, uv.y));

  // ---- Ambient pool the flame throws, from just above the wick. Kept tight:
  // a lighter lights its own hand, not the whole room. ----
  let lp = p - up * flameH * 0.42;
  let ld2 = dot(lp, lp);
  col = col + vec3<f32>(0.95, 0.42, 0.12) * lit * 0.26 / (1.0 + ld2 * 170.0);
  col = col + vec3<f32>(0.60, 0.25, 0.07) * lit * 0.075 / (1.0 + ld2 * 26.0);
  col = col + vec3<f32>(0.28, 0.12, 0.04) * lit * 0.022 / (1.0 + ld2 * 5.5);

  // ---- The flame. Uniform branch: costs nothing while it is out. ----
  if (fl > 0.002) {
    let hgt = flameH * fl * (0.90 + 0.18 * fn1);
    let s = fp.y / max(hgt, 0.0001);
    let sc = clamp(s, 0.0, 1.0);

    // No extra bend here — the radius-dependent rotation above already curls
    // the foot back toward the lighter's own axis.
    let xa = fp.x;

    // Spindle: narrow where it leaves the wick, widest a little under half
    // way, drawn to a point. 2.66 renormalises the profile peak to wMax.
    let wMax = flameW * (0.58 + 0.42 * min(fl, 1.0));
    let width = wMax * 2.66 * pow(sc + 0.01, 0.62) * pow(1.0 - sc, 0.85);

    // Turbulence in two parts, and the split matters: the coarse layer has NO
    // x term, so it slides the whole column sideways as one snaking body
    // (sampling it per-x instead shreds the tip into separate tongues). Only
    // the fine layer varies across the flame, and it is scaled by the LOCAL
    // width so the point stays a point.
    let nA = fbm(vec2<f32>(s * 1.5 - phase * 1.30, 4.0));
    let nB = vnoise(vec2<f32>(xa / flameW * 2.2 + 7.0, s * 4.6 - phase * 2.4));
    let x = xa
          - (nA - 0.5) * flameW * 0.90 * smoothstep(0.05, 1.0, sc)
          - (nB - 0.5) * width * 0.42;

    let q = x / max(width, 0.00002);
    let core = clamp(1.0 - q * q, 0.0, 1.0);

    // Hard cut past the tip: the width floor above keeps a sub-pixel column
    // where q stays under 1, and without this it draws a hairline straight up
    // the screen.
    var dens = pow(core, 0.62) * smoothstep(-0.05, 0.10, s)
             * smoothstep(1.005, 0.965, s);
    dens = dens * (1.0 - 0.50 * smoothstep(0.40, 1.0, sc));
    // The base burns cooler and dimmer than the body above it — without this
    // the blue cone is multiplied straight through white and disappears.
    let blueZ = smoothstep(0.30, 0.01, sc);
    dens = dens * (1.0 - blueZ * 0.55);

    // Temperature ramp off the density. The white heart sits in the MIDDLE of
    // the flame — at the base the gas is still burning blue, at the tip it is
    // cooling to orange.
    var fcol = mix(vec3<f32>(1.00, 0.22, 0.02), vec3<f32>(1.00, 0.50, 0.07),
                   smoothstep(0.04, 0.40, dens));
    fcol = mix(fcol, vec3<f32>(1.00, 0.76, 0.28), smoothstep(0.32, 0.74, dens));
    // The white heart is its own narrower cone rather than a threshold on the
    // density — a flame has a lit inner body with an edge, not a soft peak.
    let qi = x / max(width * 0.55, 0.00002);
    let inner = clamp(1.0 - qi * qi, 0.0, 1.0)
              * smoothstep(0.04, 0.26, sc)
              * (1.0 - smoothstep(0.34, 0.90, sc));
    fcol = mix(fcol, vec3<f32>(1.00, 0.93, 0.72), smoothstep(0.12, 0.72, inner));
    dens = dens + inner * 0.30;

    // The blue cone at the base, where the gas burns cleanest — applied last
    // so it wins over the yellow rather than being averaged into it.
    let blue = blueZ * smoothstep(0.03, 0.35, core) * 0.95 * min(fl, 1.0);
    fcol = mix(fcol, vec3<f32>(0.20, 0.44, 1.00), blue);

    // Emissive: adding rather than blending means the core saturates to white
    // on its own and the edge never draws a dark fringe against the room.
    col = col + fcol * dens * (1.45 + 1.20 * flare) * (0.90 + 0.16 * fn2);

    // Halo, scaled by the flame's own height so it never detaches. Kept tight
    // — a broad one just paints the whole screen brown.
    let gp = vec2<f32>(fp.x, fp.y - hgt * 0.40) / max(hgt, 0.0001);
    let g2 = dot(gp * vec2<f32>(1.35, 0.95), gp * vec2<f32>(1.35, 0.95));
    let halo = exp(-g2 * 2.6) * 0.26 + exp(-g2 * 0.85) * 0.055;
    col = col + vec3<f32>(1.00, 0.52, 0.16) * halo * lit;
  }

  // ---- Smoke: one thin wisp, leaning with the flame, widening as it goes. ----
  if (smoke > 0.003) {
    let sy = fp.y / (flameH * 1.9);
    let wsp = flameW * (0.45 + 2.6 * max(sy, 0.0));
    let sx = fp.x / max(wsp, 0.0001);
    let wisp = fbm(vec2<f32>(sx * 0.9 + 21.0, sy * 2.4 - phase * 0.75));
    let colM = exp(-sx * sx * 1.2)
             * smoothstep(-0.02, 0.14, sy)
             * (1.0 - smoothstep(0.20 + smokeAge * 1.0, 0.80 + smokeAge * 1.4, sy));
    let sa = clamp(colM * (0.22 + 0.78 * wisp) * smoke * 0.42, 0.0, 1.0);
    col = mix(col, vec3<f32>(0.40, 0.385, 0.375), sa);
  }

  // ---- Frame: vignette and dither. ----
  let vd = (uv - vec2<f32>(0.5, 0.42)) * vec2<f32>(1.15, 1.05);
  col = col * (1.0 - clamp(dot(vd, vd), 0.0, 1.0) * 0.80);
  col = col + (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
