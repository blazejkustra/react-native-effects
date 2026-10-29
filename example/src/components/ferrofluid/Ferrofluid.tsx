import type { ImageSourcePropType, ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /** The surface the fluid sits on, shot from straight above. */
  surface: ImageSourcePropType;
  /**
   * `[scaleX, scaleY]` mapping screen uv onto the photo so it covers the
   * view without stretching (the excess is cropped evenly).
   */
  coverScale: [number, number];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A puddle of ferrofluid on a photographed surface, seen from above.
 *
 * The fluid is a height field: a thin lens with a rounded meniscus, plus the
 * Rosensweig spike field (a hex lattice of cones) where the magnet's field is
 * strong. The spikes rise with the field, crowd closer as it grows and lean
 * toward the magnet. It is shaded as a black mirror: almost no diffuse, a
 * strong Fresnel term, a softbox overhead and the surrounding surface
 * reflected in the flanks of every spike.
 */
export default function Ferrofluid({
  surface,
  coverScale,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={FERRO_SHADER}
      texture={surface}
      params={[coverScale[0], coverScale[1]]}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const FERRO_SHADER = /* wgsl */ `
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

const PUDDLE_R = 0.15;
const LENS_H = 0.016;
const SPIKE_H = 0.085;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn photo(c: vec2<f32>) -> vec3<f32> {
  let suv = vec2<f32>(c.x / u.resolution.z + 0.5, 0.5 - c.y);
  let iuv = (suv - 0.5) * u.params0.xy + 0.5;
  return textureSampleLevel(tex, samp, iuv, 0.0).rgb;
}

fn modv(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return a - b * floor(a / b);
}

// Offset from p to the nearest hex lattice point, lattice spacing 1.
fn hexOffset(p: vec2<f32>) -> vec2<f32> {
  let r = vec2<f32>(1.0, 1.7320508);
  let h = r * 0.5;
  let a = modv(p, r) - h;
  let b = modv(p - h, r) - h;
  return select(b, a, dot(a, a) < dot(b, b));
}

struct Fluid {
  h: f32,
  sd: f32,
};

fn puddleSd(p: vec2<f32>, center: vec2<f32>, dir: vec2<f32>, s: f32, phase: f32) -> f32 {
  let d = p - center;
  let along = dot(d, dir);
  let across = dot(d, vec2<f32>(-dir.y, dir.x));
  let stretch = 1.0 + select(0.12, 0.55, along > 0.0) * s;
  let squeeze = 1.0 - 0.12 * s;
  let ang = atan2(d.y, d.x);
  let wob = 1.0 + 0.025 * sin(ang * 3.0 + phase * 1.7) + 0.018 * sin(ang * 5.0 - phase * 2.3);
  let q = vec2<f32>(along / stretch, across / squeeze);
  return length(q) - PUDDLE_R * (1.0 - 0.1 * s) * wob;
}

fn spikeFocus(center: vec2<f32>, magnet: vec2<f32>) -> vec2<f32> {
  let toMag = magnet - center;
  let len = length(toMag);
  return center + toMag * min(1.0, 0.08 / max(len, 1e-4));
}

fn spikeField(p: vec2<f32>, focus: vec2<f32>, s: f32, sd: f32, phase: f32) -> f32 {
  let spacing = 0.046 - 0.01 * s;
  let cell = hexOffset(p / spacing);
  let id = round((p / spacing - cell) * 2.0);
  // Each spike stands a little off the lattice point, and is a concave cone
  // that meets the surface with zero slope, so neighbours never leave a seam.
  let jit = vec2<f32>(hash21(id), hash21(id + 7.13)) - 0.5;
  let local = cell - jit * 0.16;
  let tip = p - local * spacing;
  // Tallest right over the magnet, dying away across the puddle so the far
  // side stays a smooth pool; nothing grows in the thin fluid at the rim.
  let spread = 0.0025 + 0.004 * s;
  let fall = exp(-dot(tip - focus, tip - focus) / spread);
  let rim = smoothstep(0.0, 0.05, -sd);
  let wobble = 1.0 + 0.07 * sin(phase * 5.0 + hash21(id + 3.7) * 6.2832);
  let size = 0.85 + 0.3 * hash21(id + 1.9);
  let env = s * rim * fall * wobble * size;
  let r = sqrt(dot(local, local) + 0.005) / 0.42;
  let t = clamp(1.0 - r, 0.0, 1.0);
  return SPIKE_H * env * t * t;
}

fn fluidAt(p: vec2<f32>) -> Fluid {
  let center = u.live.xy;
  let s = u.live.z;
  let phase = u.live.w;
  let magnet = u.liveData[0].xy;
  let toMag = magnet - center;
  let dist = length(toMag);
  let dir = select(vec2<f32>(0.0, 1.0), toMag / max(dist, 1e-4), dist > 1e-3);
  let lean = dir * min(dist, 0.25) * s;
  let sd = puddleSd(p, center, dir, min(dist * 4.0, 1.0) * s, phase);
  // A rounded rim plus a broad, shallow crown, so reflections curve.
  let fromCenter = p - center;
  let crown = clamp(1.0 - dot(fromCenter, fromCenter) / (PUDDLE_R * PUDDLE_R), 0.0, 1.0);
  let lens = LENS_H * (0.6 * sqrt(clamp(-sd / 0.03, 0.0, 1.0)) + 0.4 * crown);
  // Shear the lattice toward the magnet by the spike's own height, so each
  // cone leans over instead of the whole grid sliding.
  let focus = spikeFocus(center, magnet);
  let h0 = spikeField(p, focus, s, sd, phase);
  let q = p - lean * (h0 / SPIKE_H) * 0.3;
  let h1 = spikeField(q, focus, s, sd, phase);
  // The fluid heaps up over the magnet, so the spikes stand on a mound.
  let mound = 0.02 * s * exp(-dot(p - focus, p - focus) / (0.01 + 0.012 * s)) * smoothstep(0.0, 0.05, -sd);
  var f: Fluid;
  f.h = lens + mound + h1;
  f.sd = sd;
  return f;
}

fn env(r: vec3<f32>, c: vec2<f32>) -> vec3<f32> {
  // A dim room: a softbox overhead, darker ceiling, and the counter itself
  // for rays that bounce downward off steep flanks.
  // The ceiling is close: where a ray starts shifts what it sees.
  let sky = r.xy / max(r.z, 0.05) + c * 3.0;
  let boxUv = (sky - vec2<f32>(-0.22, 0.95)) / vec2<f32>(0.3, 0.2);
  let box = smoothstep(1.0, 0.82, abs(boxUv.x)) * smoothstep(1.0, 0.8, abs(boxUv.y)) * (0.35 + 0.65 * smoothstep(-1.0, 0.9, boxUv.y))
    * (1.0 - 0.85 * smoothstep(0.035, 0.0, abs(boxUv.x)) - 0.85 * smoothstep(0.05, 0.0, abs(boxUv.y)));
  let up = smoothstep(-0.05, 0.25, r.z);
  let behind = smoothstep(0.9, 0.6, abs(sky.x)) * smoothstep(0.5, 0.3, abs(sky.y + 1.1));
  let ceiling = vec3<f32>(0.06, 0.06, 0.065) + vec3<f32>(1.0, 0.98, 0.95) * (box * 8.0 + behind * 1.1);
  let counter = photo(c + r.xy * 0.05) * 0.38;
  // Tall windows to either side: every cone flank facing one catches a
  // long vertical streak.
  let sill = smoothstep(-0.1, 0.05, r.z) * smoothstep(0.75, 0.45, r.z);
  let windows = smoothstep(0.55, 0.72, -r.x) * 2.6 + smoothstep(0.62, 0.8, r.x) * 1.1;
  return mix(counter, ceiling, up) + vec3<f32>(0.97, 0.98, 1.0) * windows * sill;
}

fn glints(n: vec3<f32>, v: vec3<f32>) -> f32 {
  // Two low windows, the softbox and a lamp behind the viewer; each lands a
  // streak on the flank of every spike that faces it.
  let l0 = normalize(vec3<f32>(-0.66, 0.66, 0.34));
  let l1 = normalize(vec3<f32>(0.85, 0.3, 0.4));
  let l2 = normalize(vec3<f32>(-0.12, -0.3, 1.0));
  let s0 = pow(clamp(dot(n, normalize(l0 + v)), 0.0, 1.0), 320.0);
  let s1 = pow(clamp(dot(n, normalize(l1 + v)), 0.0, 1.0), 60.0);
  let s2 = pow(clamp(dot(n, normalize(l2 + v)), 0.0, 1.0), 160.0);
  let l3 = normalize(vec3<f32>(0.12, -0.85, 0.5));
  let s3 = pow(clamp(dot(n, normalize(l3 + v)), 0.0, 1.0), 380.0);
  return min(s0 * 4.0 + s1 * 0.8 + s2 * 1.6 + s3 * 3.5, 4.0);
}

// The camera looks down at the counter from the bottom of the screen at an
// angle, so a point raised by z shows up OBLIQUE * z higher on screen. March
// the view ray down through the height field to the first surface it meets.
const OBLIQUE = 0.9;
// Steps scale with the spikes: a flat puddle needs only a few.
const MARCH_STEPS_MIN = 8;
const MARCH_STEPS_MAX = 40;

fn march(c: vec2<f32>, hMax: f32, s: f32) -> vec3<f32> {
  let steps = MARCH_STEPS_MIN + i32(f32(MARCH_STEPS_MAX - MARCH_STEPS_MIN) * clamp(s * 1.5, 0.0, 1.0));
  var zPrev = hMax;
  for (var i = 1; i <= steps; i = i + 1) {
    let z = hMax * (1.0 - f32(i) / f32(steps));
    let g = c - vec2<f32>(0.0, OBLIQUE * z);
    if (fluidAt(g).h >= z) {
      var lo = z;
      var hi = zPrev;
      for (var j = 0; j < 6; j = j + 1) {
        let mid = 0.5 * (lo + hi);
        let gm = c - vec2<f32>(0.0, OBLIQUE * mid);
        if (fluidAt(gm).h >= mid) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return vec3<f32>(c - vec2<f32>(0.0, OBLIQUE * lo), 1.0);
    }
    zPrev = z;
  }
  return vec3<f32>(c, 0.0);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let c = (uv - 0.5) * vec2<f32>(u.resolution.z, 1.0);
  let e = 1.0 / u.resolution.y;
  let s = max(u.live.z, 0.0);

  let hMax = LENS_H + (SPIKE_H * 1.35 + 0.025) * s + 0.002;
  let near = fluidAt(c).sd < 0.01 || fluidAt(c - vec2<f32>(0.0, OBLIQUE * hMax)).sd < 0.01;
  var hit = vec3<f32>(c, 0.0);
  if (near) {
    hit = march(c, hMax, s);
  }

  // Surface: the photo, with a soft contact shadow hugging the puddle and
  // the spikes casting a little toward the lower right.
  var base = photo(c);
  let f0 = fluidAt(c);
  let shadowSd = fluidAt(c + vec2<f32>(-0.012, 0.016)).sd;
  let contact = exp(-max(f0.sd, 0.0) / 0.01);
  let dropShadow = exp(-max(shadowSd, 0.0) / 0.03) * 0.25 * clamp(s, 0.0, 1.0);
  base = base * (1.0 - 0.45 * contact - dropShadow);

  var col = base;
  if (hit.z > 0.5) {
    let g = hit.xy;
    let h0 = fluidAt(g).h;
    let hx = fluidAt(g + vec2<f32>(e, 0.0)).h;
    let hy = fluidAt(g + vec2<f32>(0.0, e)).h;
    let n = normalize(vec3<f32>(-(hx - h0) / e, -(hy - h0) / e, 1.0));
    let v = normalize(vec3<f32>(g.x * 0.25, -0.67, 0.74));
    let r = reflect(-v, n);
    let ndv = clamp(dot(n, v), 0.0, 1.0);
    let k = 1.0 - ndv;
    let fres = 0.09 + 0.91 * k * k * k;
    let refl = env(r, g);
    let glint = glints(n, v);
    col = vec3<f32>(0.010, 0.010, 0.013) + refl * fres + vec3<f32>(0.95, 0.96, 1.0) * glint * (0.25 + fres);
    // Soften the silhouette against the counter where the lens is thin.
    let edge = smoothstep(0.0, 0.0025, -fluidAt(g).sd);
    col = mix(base, col, edge);
  }
  col = col / (1.0 + col * 0.15);

  let vig = 1.0 - 0.25 * dot(uv - 0.5, uv - 0.5);
  col = col * vig + (hash21(uv * u.resolution.xy) - 0.5) / 255.0;
  return vec4<f32>(col, 1.0);
}`;
