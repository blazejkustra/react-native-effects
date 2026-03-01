import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** The color tint for the calico swirl effect. */
  color?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Intensity of the effect. Default: 1.0 */
  intensity?: number;
};

export default function CalicoSwirl({
  color = '#ffffff',
  speed = 1.0,
  intensity = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(() => [intensity], [intensity]);

  return (
    <ShaderView
      fragmentShader={CALICO_SWIRL_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const CALICO_SWIRL_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const m = mat2x2<f32>(0.80, 0.60, -0.60, 0.80);

fn noise(p: vec2<f32>) -> f32 {
  return sin(p.x) * sin(p.y);
}

fn fbm4(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  var f = 0.0;
  f += 0.5000 * noise(p);
  p = m * p * 2.02;
  f += 0.2500 * noise(p);
  p = m * p * 2.03;
  f += 0.1250 * noise(p);
  p = m * p * 2.01;
  f += 0.0625 * noise(p);
  return f / 0.9375;
}

fn fbm6(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  var f = 0.0;
  f += 0.500000 * (0.5 + 0.5 * noise(p));
  p = m * p * 2.02;
  f += 0.250000 * (0.5 + 0.5 * noise(p));
  p = m * p * 2.03;
  f += 0.125000 * (0.5 + 0.5 * noise(p));
  p = m * p * 2.01;
  f += 0.062500 * (0.5 + 0.5 * noise(p));
  p = m * p * 2.04;
  f += 0.031250 * (0.5 + 0.5 * noise(p));
  p = m * p * 2.01;
  f += 0.015625 * (0.5 + 0.5 * noise(p));
  return f / 0.96875;
}

fn fbm4_2(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(fbm4(p), fbm4(p + vec2<f32>(7.8)));
}

fn fbm6_2(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(fbm6(p + vec2<f32>(16.8)), fbm6(p + vec2<f32>(11.5)));
}

fn func(q: vec2<f32>, time: f32) -> vec4<f32> {
  var q_mod = q;
  q_mod += 0.03 * sin(vec2<f32>(0.27, 0.23) * time + length(q) * vec2<f32>(4.1, 4.3));

  let o = fbm4_2(0.9 * q_mod);

  var o_mod = o;
  o_mod += 0.04 * sin(vec2<f32>(0.12, 0.14) * time + length(o));

  let n = fbm6_2(3.0 * o_mod);

  let f = 0.5 + 0.5 * fbm4(1.8 * q_mod + 6.0 * n);

  let result = mix(f, f * f * f * 3.5, f * abs(n.x));

  return vec4<f32>(o, n.x, n.y);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let intensity = u.params0.x;

  let resolution = u.resolution.xy;
  let aspect = u.resolution.z;

  var p = ndc;
  p.y *= aspect;

  let e = 2.0 / resolution.y;

  let on = func(p, time);

  let o = on.xy;
  let n = on.zw;

  var q = p;
  q += 0.03 * sin(vec2<f32>(0.27, 0.23) * time + length(q) * vec2<f32>(4.1, 4.3));
  let fbm_val = 0.5 + 0.5 * fbm4(1.8 * q + 6.0 * n);
  let f = mix(fbm_val, fbm_val * fbm_val * fbm_val * 3.5, fbm_val * abs(n.x));

  var col = vec3<f32>(0.0);
  col = mix(vec3<f32>(0.2, 0.1, 0.4), vec3<f32>(0.3, 0.05, 0.05), f);
  col = mix(col, vec3<f32>(0.9, 0.9, 0.9), dot(n, n));
  col = mix(col, vec3<f32>(0.4, 0.3, 0.3), 0.2 + 0.5 * o.y * o.y);
  col = mix(col, vec3<f32>(0.0, 0.2, 0.4), 0.5 * smoothstep(1.2, 1.3, abs(n.x) + abs(n.y)));
  col = clamp(col * f * 2.0, vec3<f32>(0.0), vec3<f32>(1.0));

  let kk1 = func(p + vec2<f32>(e, 0.0), time);
  let kk2 = func(p + vec2<f32>(0.0, e), time);

  var q1 = p + vec2<f32>(e, 0.0);
  q1 += 0.03 * sin(vec2<f32>(0.27, 0.23) * time + length(q1) * vec2<f32>(4.1, 4.3));
  let f1 = 0.5 + 0.5 * fbm4(1.8 * q1 + 6.0 * kk1.zw);
  let fx = mix(f1, f1 * f1 * f1 * 3.5, f1 * abs(kk1.z));

  var q2 = p + vec2<f32>(0.0, e);
  q2 += 0.03 * sin(vec2<f32>(0.27, 0.23) * time + length(q2) * vec2<f32>(4.1, 4.3));
  let f2 = 0.5 + 0.5 * fbm4(1.8 * q2 + 6.0 * kk2.zw);
  let fy = mix(f2, f2 * f2 * f2 * 3.5, f2 * abs(kk2.z));

  let nor = normalize(vec3<f32>(fx - f, 2.0 * e, fy - f));

  let lig = normalize(vec3<f32>(0.9, 0.2, -0.4));
  let dif = clamp(0.3 + 0.7 * dot(nor, lig), 0.0, 1.0);
  let lin = vec3<f32>(0.70, 0.90, 0.95) * (nor.y * 0.5 + 0.5) + vec3<f32>(0.15, 0.10, 0.05) * dif;
  col *= 1.2 * lin;

  col = 1.0 - col;
  col = 1.1 * col * col;

  col = col * intensity;
  col = col * u.color0.rgb;

  return vec4<f32>(col, u.color0.a);
}
`;
