import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import { useEffectProgress } from './useEffectProgress';

export const LASERS_MS = 3200;

type Props = {
  onDone: () => void;
};

/**
 * Beams: broad shafts of warm daylight fall from the top corner across the
 * chat, the way sun comes through a window, drifting slowly as they fade in
 * and out.
 */
export default function LasersEffect({ onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(LASERS_MS, onDone);
  return (
    <ShaderView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      transparent
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

const SUN = vec3<f32>(1.0, 0.83, 0.52);
const SHAFT_SHARPNESS: f32 = 2.4;

fn shafts(angle: f32, t: f32) -> f32 {
  let wide = 0.5 + 0.5 * sin(angle * 9.0 + t * 0.25);
  let mid = 0.5 + 0.5 * sin(angle * 17.0 - t * 0.18 + 1.3);
  let fine = 0.5 + 0.5 * sin(angle * 31.0 + t * 0.11 + 4.1);
  return pow(wide * 0.55 + mid * 0.3 + fine * 0.15, SHAFT_SHARPNESS);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  if (p <= 0.0 || p >= 1.0) {
    return vec4<f32>(0.0);
  }
  let t = u.time.x;
  let uv = ndc * 0.5 + 0.5;
  let res = u.resolution.xy / u.resolution.w;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * res;

  let env = smoothstep(0.0, 0.25, p) * (1.0 - smoothstep(0.7, 1.0, p));
  let v = q - vec2<f32>(res.x * 1.1, -res.y * 0.12);
  let falloff = exp(-length(v) / (res.y * 0.75));
  let inten = shafts(atan2(v.y, v.x), t + p * 6.0) * falloff * env * 1.5;

  let a = clamp(inten, 0.0, 1.0);
  return vec4<f32>(min(SUN * inten, vec3<f32>(a)), a);
}
`;
