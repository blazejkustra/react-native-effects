import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

/** The photo's proportions: length over width. */
export const CIG_ASPECT = 3074 / 512;
/** Where the filter ends and the tobacco begins, as a fraction of the length. */
export const FILTER_FRAC = 0.356;
/**
 * The view is taller than the cigarette so the ash has somewhere to grow
 * above the tip: the photo occupies the bottom `1 / HEADROOM` of it.
 */
export const HEADROOM = 1.25;
/**
 * ...and wider, so a piece of ash can tumble off to the side while still
 * being drawn IN FRONT of the paper: the cigarette sits in the middle third.
 */
export const PANE_SCALE = 3;

const CIGARETTE_PHOTO = require('../../../assets/cigarette.png');

type Props = ViewProps & {
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The cigarette itself: a photo of one, burnt down by the shader.
 *
 * Every pixel is decided in cigarette space (v = 0 at the filter's end, v = 1
 * at the tobacco tip). Below the burn line the photo shows through, charred
 * for the last few millimetres; on the line sits the coal — a crust of ash
 * cells with fire in the cracks between them; above it stands the ash column,
 * the same crust gone cold and grey; above the ash there is nothing. The
 * burn line moves down the tobacco as the sim's `burn` advances, so the whole
 * thing shortens for free. A knocked-off piece of ash is drawn on top as it
 * falls, along whatever direction the phone says is down.
 *
 * Transparent, so the smoke pass behind shows around it — which means the
 * output has to be premultiplied.
 */
export default function Cigarette({
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={CIGARETTE_SHADER}
      paramsSynchronizable={paramsSynchronizable}
      texture={CIGARETTE_PHOTO}
      transparent
      {...viewProps}
    />
  );
}

const CIGARETTE_SHADER = /* wgsl */ `
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const FILTER_FRAC = ${FILTER_FRAC};
const HEADROOM = ${HEADROOM};
const PANE_SCALE = ${PANE_SCALE};
const CIG_ASPECT = ${CIG_ASPECT};
const TOBACCO = 1.0 - FILTER_FRAC;
// Half the cigarette's width, in lengths.
const HW = 0.5 / CIG_ASPECT;
// How long a dropped piece of ash is in the air (s) — keep in step with the hook.
const CHUNK_DURATION = 1.6;

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

// The ash crust, shared by the column on the cigarette and the piece that
// falls off it. cp is the crust-space coordinate (~14 units across the
// paper), h the height above the coal (lengths), heat how hard the coal is
// burning, shade the cylinder's shading across it.
//
// Not tiles: a real coal is open glowing tobacco with soft-edged flakes of
// grey ash lying over it, and the flakes take over as it cools further up.
fn crust(cp: vec2<f32>, h: f32, heat: f32, shade: f32, emberCol: vec3<f32>) -> vec3<f32> {
  let n1 = vnoise(cp * 0.55);
  let n2 = vnoise(cp * 1.3 + 7.0);
  let n3 = vnoise(cp * 2.6 + 3.0);
  let g = clamp(exp(-max(h, 0.0) * 24.0) * heat * 1.5, 0.0, 1.0);

  // Pale ash, lighter than you think — it is nearly white in daylight.
  let lit = 0.62 + 0.38 * shade;
  var col = vec3<f32>(0.87, 0.86, 0.83) * (0.86 + 0.14 * n2) * (0.94 + 0.06 * n3) * lit;
  // Charcoal cracks between the flakes: dark grey, never brown.
  let crack = smoothstep(0.42, 0.30, n2 * 0.7 + n3 * 0.3);
  col = mix(col, vec3<f32>(0.26, 0.25, 0.24) * lit, crack * 0.75);

  // The fire: it shows first in the cracks, then the whole face goes orange
  // near the paper, with a few flakes left dark on top of it.
  let coal = emberCol * (0.85 + 0.30 * n3);
  // Either dark or orange — a half-lit crack is brown, and brown is wrong.
  let crackFire = smoothstep(0.25, 0.60, crack * g * 1.8);
  let faceFire = smoothstep(0.30, 0.80, g);
  let darkFlake = smoothstep(0.62, 0.78, n1) * 0.7;
  let fire = clamp(crackFire + faceFire * (1.0 - darkFlake), 0.0, 1.0);
  col = mix(col, coal, fire);
  return col;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;

  let ember = clamp(u.live.x, 0.0, 1.0);
  let draw = clamp(u.live.y, 0.0, 1.0);
  let tilt = u.live.w;
  let phase = u.liveData[0].x;
  let burn = clamp(u.liveData[0].y, 0.0, 1.0);
  let ash = clamp(u.liveData[0].z, 0.0, 1.0);
  let chunkAge = clamp(u.liveData[1].y, 0.0, 1.0);
  let flare = clamp(u.liveData[1].z, 0.0, 1.0);
  let vis = clamp(u.liveData[1].w, 0.0, 1.0);
  let chunkLen = clamp(u.liveData[2].x, 0.0, 1.0);
  let chunkKick = clamp(u.liveData[2].y, -1.0, 1.0);

  // Cigarette space: v runs 0 at the filter's end to 1 at the tobacco tip,
  // x runs -1..1 across the paper. P is the same thing isotropic, in lengths.
  let uu = (uv.x - 0.5) * PANE_SCALE;
  let x = uu * 2.0;
  let v = uv.y * HEADROOM;
  let P = vec2<f32>(uu / CIG_ASPECT, v);

  // The photo, where there is one.
  var tc = vec4<f32>(0.0);
  if (v <= 1.0 && abs(uu) < 0.5) {
    tc = textureSampleLevel(tex, samp, vec2<f32>(uu + 0.5, 1.0 - v), 0.0);
  }

  // Cylinder shading across the paper; the photo already has its own, the
  // ash needs it painted on.
  let shade = 0.50 + 0.50 * sqrt(max(1.0 - x * x * 0.92, 0.0));

  // The burn line: a ragged edge, keyed to the burn so it changes shape as
  // the coal creeps rather than every frame, and the coal is a shallow dome.
  let burnLine = 1.0 - burn * TOBACCO;
  let rag = (vnoise(vec2<f32>(x * 2.6 + 4.0, burn * 60.0)) - 0.5) * 0.012;
  let vB = burnLine + rag + 0.008 * (1.0 - x * x);
  // A crust of coal stays even right after the ash is knocked off.
  let ashLen = max(ash * TOBACCO, 0.014);
  let topRag = (vnoise(vec2<f32>(x * 3.1 + 9.0, burn * 45.0 + 3.0)) - 0.5) * 0.02;
  let vTop = vB + ashLen + topRag;

  // Coal brightness: a slow breath, a fast shimmer under a drag, and the
  // flare of lighting up or of a freshly bared coal.
  let breath = 0.70 + 0.30 * vnoise(vec2<f32>(phase * 1.8, 2.0));
  let shimmer = vnoise(vec2<f32>(phase * 11.0 + x * 3.0, 7.0));
  let heat = ember * (breath * (0.62 + 0.38 * draw) + draw * 0.40 * shimmer)
           + flare * 0.9;
  // Saturated orange even at rest — a coal seen through grey flakes must
  // not average out to brown.
  let emberCol = mix(vec3<f32>(0.96, 0.30, 0.03), vec3<f32>(1.0, 0.74, 0.26),
                     clamp(heat - 0.35, 0.0, 1.0));

  // Cell space for the crust: ~14 cells across the paper, square.
  let cp = vec2<f32>(x * 7.0, v * 84.0);

  var col = vec3<f32>(0.0);
  var alpha = 0.0;

  if (abs(uu) < 0.5) {
    if (v < vB) {
      // ---- Paper (and filter): the photo, charred toward the coal. ----
      col = tc.rgb;
      alpha = tc.a;
      let d = vB - v;
      let charN = vnoise(vec2<f32>(x * 4.0 + 1.0, v * 90.0));
      // A thin black ring where the paper is burning, a faint tan just
      // below it — not a wide brown smear.
      let char = smoothstep(0.016, 0.0, d + (charN - 0.5) * 0.010);
      let scorch = smoothstep(0.045, 0.0, d + (charN - 0.5) * 0.03);
      col = mix(col, vec3<f32>(0.62, 0.48, 0.30), scorch * 0.35);
      col = mix(col, vec3<f32>(0.06, 0.05, 0.04), char * 0.95);
      // The paper's edge is itself on fire: a thin bright rim, then the
      // coal's light falling on the char below it.
      col = col + emberCol * heat * (0.9 * exp(-d * 260.0) + 0.22 * exp(-d * 50.0));
      // Sparks along the rim under a drag.
      let sp = hash21(floor(vec2<f32>(x * 30.0, d * 900.0)) + floor(phase * 24.0));
      col = col + vec3<f32>(1.0, 0.85, 0.5) * step(0.985, sp) * draw * exp(-d * 200.0);
    } else if (v < vTop) {
      // ---- The coal and the ash standing on it. ----
      let h = v - vB;
      let edgeN = vnoise(vec2<f32>(3.0, v * 140.0)) - 0.5;
      let edgeR = 0.93 + edgeN * 0.09;
      let inside = smoothstep(edgeR, edgeR - 0.05, abs(x));
      col = crust(cp, h, heat, shade, emberCol);
      // Sparks in the seams under a drag.
      let sp = hash21(floor(cp * 4.0) + floor(phase * 24.0));
      col = col + vec3<f32>(1.0, 0.85, 0.5) * step(0.988, sp) * draw * exp(-h * 40.0);
      alpha = inside * smoothstep(vTop, vTop - 0.010, v);
    }
  }

  // Premultiply, and the whole butt fades during a swap.
  var outC = col * alpha * vis;
  var outA = alpha * vis;

  // ---- A piece of ash in the air, falling toward the real floor. ----
  if (chunkAge < 1.0 && chunkLen > 0.0) {
    let t = chunkAge * CHUNK_DURATION;
    let up = vec2<f32>(-sin(tilt), cos(tilt));
    let right = vec2<f32>(cos(tilt), sin(tilt));
    let len = chunkLen * TOBACCO;
    let start = vec2<f32>(0.0, burnLine + 0.008 + len * 0.5);
    let pos = start - up * (0.5 * 5.0 * t * t) + right * (chunkKick * 0.6 * t)
            + up * (0.35 * abs(chunkKick) * t);
    let rot = chunkKick * 4.0 * t + 0.8 * t;
    let d = P - pos;
    let cs = cos(rot);
    let sn = sin(rot);
    let c = vec2<f32>(d.x * cs + d.y * sn, -d.x * sn + d.y * cs);
    let cx = c.x / HW;
    let edgeN = vnoise(vec2<f32>(5.0, c.y * 140.0 + 40.0)) - 0.5;
    let edgeR = 0.93 + edgeN * 0.09;
    let insideX = smoothstep(edgeR, edgeR - 0.06, abs(cx));
    let endRag = (vnoise(vec2<f32>(cx * 3.0 + 17.0, 1.0)) - 0.5) * 0.012;
    let insideY = smoothstep(len * 0.5 + 0.004, len * 0.5 - 0.004, abs(c.y) + endRag);
    let cshade = 0.50 + 0.50 * sqrt(max(1.0 - cx * cx * 0.92, 0.0));
    // The end that sat on the coal keeps a fading glow.
    let hc = c.y + len * 0.5;
    let chunkHeat = ember * 0.8 * exp(-t * 3.5);
    var ccol = crust(vec2<f32>(cx * 7.0, c.y * 84.0 + 300.0), hc, chunkHeat, cshade, emberCol);
    let ca = insideX * insideY * (1.0 - smoothstep(0.70, 1.0, chunkAge));
    outC = ccol * ca + outC * (1.0 - ca);
    outA = ca + outA * (1.0 - ca);
  }

  return vec4<f32>(outC, outA);
}
`;
