import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** Base tint color for the aurora effect. */
  color?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Brightness of the aurora bands. Default: 1.0 */
  intensity?: number;
  /** Number of aurora curtain layers (1-5). Default: 3 */
  layers?: number;
  /** How wavy/turbulent the curtains are. Default: 1.0 */
  waviness?: number;
};

export default function Aurora({
  color = '#4ade80',
  speed = 1.0,
  intensity = 1.0,
  layers = 3.0,
  waviness = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(
    () => [intensity, layers, waviness],
    [intensity, layers, waviness]
  );

  return (
    <ShaderView
      fragmentShader={AURORA_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const AURORA_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

// Hash function for pseudo-random values
fn hash(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.13);
  p3 += dot(p3, vec3<f32>(p3.y + 3.333, p3.z + 3.333, p3.x + 3.333));
  return fract((p3.x + p3.y) * p3.z);
}

// 2D noise
fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u_s = f * f * (3.0 - 2.0 * f);

  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));

  return mix(mix(a, b, u_s.x), mix(c, d, u_s.x), u_s.y);
}

// Fractional Brownian Motion
fn fbm(p_in: vec2<f32>, octaves: i32) -> f32 {
  var p = p_in;
  var value = 0.0;
  var amplitude = 0.5;
  var frequency = 1.0;

  for (var i = 0; i < octaves; i++) {
    value += amplitude * noise(p * frequency);
    p = p * 2.01 + vec2<f32>(1.7, 9.2);
    amplitude *= 0.5;
    frequency *= 1.0;
  }
  return value;
}

// Single aurora curtain layer
fn auroraLayer(uv: vec2<f32>, time: f32, offset: f32, waviness: f32) -> f32 {
  // Horizontal position with time-based drift
  let drift = time * 0.15 + offset * 2.5;

  // Create the curtain shape using sine waves
  let wave1 = sin(uv.x * 2.0 * waviness + drift + offset * 6.0) * 0.3;
  let wave2 = sin(uv.x * 3.5 * waviness + drift * 1.3 + offset * 4.0) * 0.15;
  let wave3 = sin(uv.x * 7.0 * waviness + drift * 0.7 + offset * 8.0) * 0.08;

  // FBM noise for organic turbulence
  let noiseVal = fbm(vec2<f32>(uv.x * 1.5 * waviness + drift * 0.5, uv.y * 0.8 + offset * 3.0), 4);

  // Curtain center position (wavy vertical line)
  let curtainCenter = 0.5 + wave1 + wave2 + wave3 + (noiseVal - 0.5) * 0.25 * waviness;

  // Distance from curtain center for glow
  let dist = abs(uv.y - curtainCenter);

  // Soft glow falloff
  let glow = exp(-dist * dist * 15.0) * 0.8;

  // Add shimmer using noise
  let shimmer = fbm(vec2<f32>(uv.x * 4.0 + time * 0.3, uv.y * 8.0 + offset * 5.0), 3);
  let shimmerEffect = glow * (0.7 + 0.3 * shimmer);

  // Fade toward bottom of screen (aurora appears in upper portion)
  let heightFade = smoothstep(0.0, 0.6, uv.y);

  return shimmerEffect * heightFade;
}

// Stars in the background
fn stars(uv: vec2<f32>, time: f32) -> f32 {
  let grid = floor(uv * 50.0);
  let h = hash(grid);

  // Only show some cells as stars
  let star = step(0.92, h);

  // Twinkle effect
  let twinkle = 0.5 + 0.5 * sin(time * (1.0 + h * 3.0) + h * 6.28);

  let cellUv = fract(uv * 50.0) - 0.5;
  let d = length(cellUv);
  let point = exp(-d * d * 80.0);

  return point * star * twinkle * 0.6;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let intensity = u.params0.x;
  let layerCount = u.params0.y;
  let waviness = u.params0.z;

  // Map NDC (-1..1) to UV (0..1)
  let uv = ndc * 0.5 + 0.5;

  // Dark sky background
  let skyTop = vec3<f32>(0.0, 0.0, 0.02);
  let skyBottom = vec3<f32>(0.01, 0.01, 0.04);
  var col = mix(skyBottom, skyTop, uv.y);

  // Add stars
  let starVal = stars(uv, time);
  // Dim stars where aurora is bright (computed later)
  var auroraTotal = 0.0;

  // Aurora color palette
  let green = vec3<f32>(0.2, 0.9, 0.4);
  let cyan = vec3<f32>(0.1, 0.7, 0.8);
  let purple = vec3<f32>(0.5, 0.2, 0.8);
  let pink = vec3<f32>(0.7, 0.2, 0.5);

  // Accumulate aurora layers
  let numLayers = i32(clamp(layerCount, 1.0, 5.0));

  for (var i = 0; i < 5; i++) {
    if (i >= numLayers) { break; }

    let fi = f32(i);
    let layerOffset = fi * 0.7;

    let layer = auroraLayer(uv, time, layerOffset, waviness);

    // Color varies per layer and position
    let colorPhase = fi / f32(numLayers) + uv.x * 0.3 + time * 0.02;
    let c1 = mix(green, cyan, sin(colorPhase * 3.14) * 0.5 + 0.5);
    let c2 = mix(purple, pink, cos(colorPhase * 2.5) * 0.5 + 0.5);
    let layerColor = mix(c1, c2, sin(colorPhase * 2.0 + fi) * 0.5 + 0.5);

    col += layerColor * layer * intensity * (1.0 / f32(numLayers)) * 2.5;
    auroraTotal += layer;
  }

  // Add stars (dimmed where aurora is bright)
  let starDim = max(0.0, 1.0 - auroraTotal * 2.0);
  col += vec3<f32>(starVal * starDim);

  // Apply tint color
  col *= u.color0.rgb;

  // Tone mapping - prevent over-saturation
  col = col / (col + vec3<f32>(1.0));
  col = pow(col, vec3<f32>(0.9));

  return vec4<f32>(col, u.color0.a);
}
`;
