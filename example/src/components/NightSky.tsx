import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Animation speed multiplier for moon drift and star twinkle. Default: 1.0 */
  speed?: number;
  /** Radius of the moon (0-1). Default: 0.03 */
  moonSize?: number;
  /** Star density — higher means more stars. Default: 0.90 */
  starDensity?: number;
  /** Sky gradient start color (bottom). Default: '#172040' */
  startColor?: string;
  /** Sky gradient end color (top). Default: '#080813' */
  endColor?: string;
};

export default function NightSky({
  speed = 1.0,
  moonSize = 0.03,
  starDensity = 0.9,
  startColor = '#172040',
  endColor = '#080813',
  ...viewProps
}: Props) {
  const params = useMemo(
    () => [moonSize, starDensity],
    [moonSize, starDensity]
  );

  const colors = useMemo(() => [startColor, endColor], [startColor, endColor]);

  return (
    <ShaderView
      fragmentShader={NIGHT_SKY_SHADER}
      params={params}
      colors={colors}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const NIGHT_SKY_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

// --- Pseudo-random hash ---
fn hash(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn hash2(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(hash(p), hash(p + vec2<f32>(127.1, 311.7)));
}

// --- Simple 2D noise for moon surface ---
fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);

  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));

  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

// --- Stars ---
fn stars(uv: vec2<f32>, time: f32, density: f32) -> f32 {
  let gridScale = 50.0;
  let grid = floor(uv * gridScale);
  let cellUv = fract(uv * gridScale) - 0.5;
  let h = hash(grid);

  // Only show cells above density threshold as stars
  let star = step(density, h);

  // Randomize position within cell
  let offset = hash2(grid) * 0.5 - 0.25;
  let d = length(cellUv - offset);

  // Sharp bright point — use exp falloff for crisp dots
  let brightness = exp(-d * d * 200.0);

  // Vary brightness per star
  let mag = 0.5 + 0.5 * hash(grid + vec2<f32>(71.0, 37.0));

  // Twinkle: each star has its own phase and frequency
  let twinkle = 0.65 + 0.35 * sin(time * (0.6 + h * 2.0) + h * 6.28);

  return brightness * star * twinkle * mag;
}

// --- Moon ---
fn moon(uv: vec2<f32>, time: f32, radius: f32) -> vec3<f32> {
  // Moon position: upper-right, slowly drifting horizontally
  // Slow orbital arc
  let orbitAngle = time * 0.03;
  let cx = 0.78 + 0.06 * cos(orbitAngle);
  let cy = 0.85 + 0.03 * sin(orbitAngle);
  let center = vec2<f32>(cx, cy);

  let aspect = u.resolution.z;
  let diff = vec2<f32>((uv.x - center.x) * aspect, uv.y - center.y);
  let d = length(diff);

  if (d > radius * 3.0) {
    return vec3<f32>(0.0);
  }

  // Moon disc — slightly soft edge
  let disc = smoothstep(radius, radius - 0.002, d);

  // Surface detail — soft maria and subtle craters
  let surfaceUv = diff / radius * 3.0;
  let n1 = noise(surfaceUv * 1.2 + vec2<f32>(5.3, 8.1));
  let n2 = noise(surfaceUv * 2.5 + vec2<f32>(12.7, 3.4));
  let n3 = noise(surfaceUv * 4.0 + vec2<f32>(27.0, 19.0));

  // Maria: broad soft dark regions
  let maria = smoothstep(0.3, 0.65, n1) * 0.18;
  // Subtle craters
  let craters = smoothstep(0.35, 0.6, n2) * 0.07;
  // Very subtle fine variation
  let detail = (n3 - 0.5) * 0.02;

  let surface = 0.95 - maria - craters + detail;

  // Limb darkening
  let limb = 1.0 - 0.4 * pow(d / radius, 3.0);

  // Warm moon color
  let moonColor = vec3<f32>(0.95, 0.92, 0.82) * surface * limb;

  // Subtle glow fading to transparent
  let glowT = smoothstep(radius * 2.0, radius, d) * (1.0 - disc);
  let glowColor = vec3<f32>(0.7, 0.7, 0.6) * glowT * 0.15;

  return moonColor * disc + glowColor;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let moonRadius = u.params0.x;
  let starDensity = u.params0.y;

  // NDC → UV (0..1)
  let uv = ndc * 0.5 + 0.5;

  // Sky gradient: startColor (bottom) → endColor (top)
  let skyBottom = u.color0.rgb;
  let skyTop = u.color1.rgb;
  var col = mix(skyBottom, skyTop, uv.y);

  // Add a subtle deep-blue vignette toward edges
  let center = vec2<f32>(0.5, 0.5);
  let vignette = 1.0 - 0.15 * length(uv - center);
  col *= vignette;

  // Stars — three layers for depth
  let s1 = stars(uv, time, starDensity);
  let s2 = stars(uv * 1.4 + vec2<f32>(37.0, 53.0), time * 0.8, starDensity + 0.015);
  let s3 = stars(uv * 0.7 + vec2<f32>(91.0, 17.0), time * 1.2, starDensity - 0.01);
  let starLight = s1 + s2 * 0.6 + s3 * 0.3;

  // Moon
  let moonCol = moon(uv, time, moonRadius);
  let moonMask = max(moonCol.x, max(moonCol.y, moonCol.z));

  // Dim stars near the moon
  let starDim = 1.0 - smoothstep(0.0, 0.5, moonMask);
  col += vec3<f32>(0.8, 0.85, 1.0) * starLight * starDim * 1.5;

  // Add moon on top
  col += moonCol;

  return vec4<f32>(col, 1.0);
}
`;
