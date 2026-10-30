import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

/**
 * The home screen photo next to two pre-blurred copies of itself, so the
 * shader can blend any blur strength from three samples.
 */
export const HOME_ATLAS = require('../../../assets/namedrop/home-atlas.jpg');
/** The Dynamic Island painted into the home screen photo, in uv (y-down). */
export const ISLAND_UV = { x: 0.5, y: 0.0376, w: 0.312, h: 0.0408 };

type NameDropWaveProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'params'
> & {
  /** `u.live.x` = seconds since the phones touched. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The home screen as NameDrop bends it: a coloured band of light climbs from
 * the bottom edge and pools under the Dynamic Island, blurring what it
 * crosses, then a bright liquid wave bursts out of the island and the home
 * screen sinks into a dark blur behind the incoming poster.
 */
export default function NameDropWave({
  paramsSynchronizable,
  ...rest
}: NameDropWaveProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[ISLAND_UV.x, ISLAND_UV.y, ISLAND_UV.w, ISLAND_UV.h]}
      texture={HOME_ATLAS}
      {...rest}
    />
  );
}

const SHADER = /* wgsl */ `
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

fn cell(k: f32, uv: vec2<f32>) -> vec3<f32> {
  let g = 0.002;
  let c = clamp(uv, vec2<f32>(g), vec2<f32>(1.0 - g));
  return textureSampleLevel(tex, samp, vec2<f32>((k + c.x) / 3.0, c.y), 0.0).rgb;
}

// level 0 is sharp, 1 a light blur, 2 a heavy one.
fn blurred(uv: vec2<f32>, level: f32) -> vec3<f32> {
  let l = clamp(level, 0.0, 2.0);
  let lo = min(floor(l), 1.0);
  return mix(cell(lo, uv), cell(lo + 1.0, uv), l - lo);
}

fn soft(uv: vec2<f32>, level: f32, px: vec2<f32>) -> vec3<f32> {
  let r = px * 7.0 * clamp(level, 0.0, 1.0);
  var c = blurred(uv, level) * 2.0;
  c += blurred(uv + vec2<f32>(r.x, 0.0), level);
  c += blurred(uv - vec2<f32>(r.x, 0.0), level);
  c += blurred(uv + vec2<f32>(0.0, r.y), level);
  c += blurred(uv - vec2<f32>(0.0, r.y), level);
  return c / 6.0;
}

fn band(x: f32, a: f32, b: f32) -> f32 {
  return smoothstep(a, b, x);
}

// Colours sampled from the reference glow, ordered from its leading edge (s < 0)
// to its tail (s > 0).
fn glowColor(s: f32) -> vec3<f32> {
  var c = mix(vec3<f32>(0.0), vec3<f32>(0.0, 0.30, 0.52), band(s, -0.75, -0.48));
  c = mix(c, vec3<f32>(0.25, 0.54, 0.62), band(s, -0.48, -0.26));
  c = mix(c, vec3<f32>(0.49, 0.64, 0.56), band(s, -0.26, -0.02));
  c = mix(c, vec3<f32>(0.56, 0.50, 0.44), band(s, -0.02, 0.22));
  c = mix(c, vec3<f32>(0.46, 0.29, 0.34), band(s, 0.22, 0.52));
  c = mix(c, vec3<f32>(0.15, 0.10, 0.24), band(s, 0.48, 0.76));
  return mix(c, vec3<f32>(0.0), band(s, 0.76, 1.05));
}

fn screen(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(1.0) - (vec3<f32>(1.0) - a) * (vec3<f32>(1.0) - b);
}

fn pill(p: vec2<f32>, size: vec2<f32>) -> f32 {
  let r = size.y * 0.5;
  let q = abs(p) - size * 0.5 + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let res = u.resolution.xy / u.resolution.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let pt = uv * res;
  let px = 1.0 / res;
  let t = u.live.x;

  let island = u.params0.xy * res;
  let islandSize = u.params0.zw * res;
  let v = pt - island;
  let d = length(v * vec2<f32>(0.78, 1.0));
  let dir = v / max(length(v), 0.001);

  let rise = res.y * exp(-3.2 * t);
  let dx = pt.x - island.x;
  let wobble = 12.0 * sin(pt.x * 0.011 + t * 1.3);
  let width = 230.0 + 0.5 * rise;
  let s = (pt.y - rise - dx * dx * 0.0006 - wobble) / width;
  let settle = smoothstep(360.0, 60.0, rise);
  let hold = 1.0 - smoothstep(1.2, 1.32, t);
  let begin = smoothstep(0.0, 0.1, t);
  let centred = mix(0.5, 1.0, exp(-dx * dx / 42000.0));
  let glow = glowColor(s) * mix(1.0, 1.3, settle) * centred * hold * begin;

  let topHaze = smoothstep(0.0, 0.34, t) * (1.0 - smoothstep(0.36, 0.62, t)) * exp(-pt.y / 95.0);

  let passed = smoothstep(-0.3, 0.1, s) * (1.0 - smoothstep(0.35, 0.8, s));
  let veil = passed * mix(0.4, 1.0, settle) * hold * begin;
  let lens = exp(-dot(v, v) / 26000.0) * veil;
  var sp = pt - v * lens * 0.18;

  let k = (t - 1.33) / 0.46;
  let wave = step(0.0, k) * (1.0 - smoothstep(0.9, 1.25, k));
  let radius = mix(30.0, res.y * 1.3, pow(clamp(k, 0.0, 1.0), 1.2));
  let depth = (radius - d) / 210.0;
  let inside = smoothstep(-0.28, 0.16, depth) * wave;
  let wash = inside * exp(-max(depth, 0.0) / 2.0);
  let rimX = (d - radius) / 95.0;
  let rim = exp(-rimX * rimX) * wave;
  sp -= dir * rimX * rim * 48.0;
  sp -= dir * wash * 26.0;

  let back = smoothstep(1.5, 1.72, t);
  let level = veil * 1.7 + rim * 0.5 + wash * 1.5 + back * 2.0;

  var col = soft(sp / res, level, px);
  col *= 1.0 - 0.32 * hold * begin * (1.0 - smoothstep(240.0, 520.0, pt.y));
  col = screen(col, min(glow, vec3<f32>(0.95)));
  col = screen(col, vec3<f32>(0.59, 0.71, 0.94) * topHaze * 0.85);

  let shade = exp(-pow((d - radius - 56.0) / 62.0, 2.0)) * wave * (1.0 - clamp(k * 2.0, 0.0, 1.0));
  col *= 1.0 - shade * 0.55;

  let waveTint = mix(vec3<f32>(0.70, 0.93, 1.0), mix(vec3<f32>(0.93, 0.95, 1.0), vec3<f32>(0.27, 0.50, 0.86), smoothstep(0.5, 2.0, depth)), smoothstep(0.0, 0.2, depth));
  col = mix(col, waveTint, inside * exp(-max(depth, 0.0) / 3.0) * 0.94);
  col = mix(col, vec3<f32>(0.08, 0.16, 0.30), back * 0.5);

  let isl = smoothstep(0.0, 1.2, pill(pt - island, islandSize));
  return vec4<f32>(clamp(col * isl, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
