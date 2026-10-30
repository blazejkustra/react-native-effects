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
 * The home screen as NameDrop bends it: a milky glow swells out of the
 * Dynamic Island while the content beneath it bulges and blurs like a liquid
 * lens, the blur snaps away into a bright ripple that runs down the screen,
 * and the home screen sinks into a dark blur behind the incoming poster.
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

fn ease(x: f32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  return 1.0 - (1.0 - c) * (1.0 - c) * (1.0 - c);
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
  let d = length(v);
  let dir = v / max(d, 0.001);

  let grow = ease(t / 1.1);
  let front = mix(70.0, res.y * 0.62, grow);
  let collapse = 1.0 - smoothstep(1.08, 1.22, t);
  let veil = (1.0 - smoothstep(front * 0.3, front, d)) * smoothstep(0.0, 0.3, t) * collapse;

  let lensR = 90.0 + 130.0 * grow;
  let lens = exp(-d * d / (lensR * lensR)) * veil;
  var sp = pt - v * lens * 0.35;

  let rk = (t - 1.18) / 0.42;
  let rippleOn = step(0.0, rk) * (1.0 - smoothstep(0.8, 1.0, rk));
  let rippleR = mix(-60.0, res.y * 1.25, pow(clamp(rk, 0.0, 1.0), 1.25));
  let rw = 110.0 + 80.0 * clamp(rk, 0.0, 1.0);
  let x = (d - rippleR) / rw;
  let band = exp(-x * x) * rippleOn;
  sp -= dir * x * exp(-x * x) * 70.0 * rippleOn;
  sp.y -= band * 34.0;

  let back = smoothstep(1.45, 1.7, t);
  let deep = 1.0 - smoothstep(0.0, front, d);
  let level = veil * (0.6 + 1.2 * deep) + band * 1.3 + back * 2.0;

  var col = soft(sp / res, level, px);

  let glowR = 80.0 + 170.0 * grow;
  let glow = exp(-d / glowR) * veil;
  let milk = vec3<f32>(0.84, 0.9, 1.0);
  col = mix(col, milk, clamp(glow * 0.9 + veil * 0.06, 0.0, 0.9));
  col = mix(col, vec3<f32>(0.88, 0.93, 1.0), band * 0.45) + band * 0.12;
  col *= 1.0 - back * 0.45;

  let isl = smoothstep(0.0, 1.2, pill(pt - island, islandSize));
  return vec4<f32>(clamp(col * isl, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
