import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type NameDropWaveProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'params'
> & {
  /** `u.live = (seconds since contact, strength 0..1, 0, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
  /** Where the light is born (the Dynamic Island centre), pt, y-down. */
  origin: { x: number; y: number };
};

/**
 * The NameDrop handshake light, drawn over the dimmed UI: a bloom swells out
 * of the Dynamic Island, then a soft liquid front ripples down and outward
 * across the screen with an iridescent rim and a fainter echo ring, leaving a
 * gentle glow at the top edge while the phones stay together.
 */
export default function NameDropWave({
  paramsSynchronizable,
  origin,
  ...rest
}: NameDropWaveProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[origin.x, origin.y]}
      transparent
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

const TRAVEL: f32 = 1.5;    // seconds for the front to cross the screen
const REACH: f32 = 1180.0;  // pt the front covers in that time

fn spectrum(x: f32) -> vec3<f32> {
  return 0.8 + 0.2 * cos(6.2831 * (vec3<f32>(x) + vec3<f32>(0.0, 0.33, 0.67)));
}

fn travel(x: f32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  return 1.0 - pow(1.0 - c, 2.2);
}

// A wall of light with a crisp leading edge at radius and a long glowing
// tail behind it.
fn wave(d: f32, radius: f32, tail: f32, edge: f32) -> f32 {
  let ahead = (d - radius) / edge;
  return select(exp(-(radius - d) / tail), exp(-ahead * ahead), d > radius);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let pt = vec2<f32>(uv.x, 1.0 - uv.y) * u.resolution.xy / u.resolution.w;
  let t = u.live.x;
  let strength = clamp(u.live.y, 0.0, 1.0);

  let v = pt - u.params0.xy;
  let ang = atan2(v.x, v.y);
  let wob = sin(ang * 5.0 + t * 2.6) * 7.0 + sin(ang * 9.0 - t * 3.4) * 3.5;
  let d = length(v * vec2<f32>(1.0, 0.82)) + wob * smoothstep(0.0, 120.0, length(v));

  let k = travel((t - 0.12) / TRAVEL);
  let front = k * REACH;
  let fade = (1.0 - smoothstep(0.6, 1.0, k)) * smoothstep(0.0, 0.05, k);

  let rim = wave(d, front, 34.0 + 50.0 * k, 7.0 + 8.0 * k) * fade * 0.95;
  let echoR = front * 0.6;
  let echo = wave(d, echoR, 22.0, 6.0) * fade * 0.35 * step(40.0, echoR);
  let wake = smoothstep(front, front * 0.4, d) * fade * 0.1;

  let swell = smoothstep(0.0, 0.18, t) * (1.0 - smoothstep(0.35, 0.9, t));
  let bloom = exp(-d * d / 4200.0) * swell * 1.2;
  let settle = smoothstep(0.6, 1.3, t);
  let crown = exp(-d / 95.0) * 0.42 * settle * (0.9 + 0.1 * sin(t * 2.2));

  let shimmer = spectrum(ang * 0.32 + d / 420.0 - t * 0.55);
  let edgeTint = smoothstep(front - 40.0, front + 4.0, d);
  let iris = vec3<f32>(0.9, 0.95, 1.0) * mix(vec3<f32>(1.0), shimmer, 0.1 + 0.25 * edgeTint);
  let light = rim + echo + wake + bloom + crown;
  let rgb = iris * (rim + echo + wake) + vec3<f32>(1.0, 0.98, 0.96) * (bloom + crown);
  let a = clamp(light, 0.0, 1.0) * strength;
  return vec4<f32>(min(rgb * strength, vec3<f32>(1.0)), a);
}
`;
