import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Sun glow size multiplier (0.1-2.0). Default: 1.0 */
  sunSize?: number;
  /** Sky gradient start color (bottom). Default: '#87CEEB' */
  startColor?: string;
  /** Sky gradient end color (top). Default: '#1E90FF' */
  endColor?: string;
};

export default function SunnySky({
  speed = 1.0,
  sunSize = 1.0,
  startColor = '#87CEEB',
  endColor = '#1E90FF',
  ...viewProps
}: Props) {
  const params = useMemo(() => [Math.random() * 1000, sunSize], [sunSize]);
  const colors = useMemo(() => [startColor, endColor], [startColor, endColor]);

  return (
    <ShaderView
      fragmentShader={SUNNY_SKY_SHADER}
      params={params}
      colors={colors}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const SUNNY_SKY_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── Noise helpers ──────────────────────────────────────────────────

fn hash(p_in: vec2<f32>) -> f32 {
  var p = fract(p_in * vec2<f32>(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn fbm(p_in: vec2<f32>) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p_in;
  for (var i = 0; i < 5; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

// Stretched FBM for wispy cirrus clouds (horizontally elongated)
fn fbmCirrus(p_in: vec2<f32>) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p_in;
  for (var i = 0; i < 5; i++) {
    s += a * noise(p);
    // Stretch horizontally more at each octave
    p = vec2<f32>(p.x * 1.8, p.y * 2.4);
    a *= 0.48;
  }
  return s;
}

// ── Main fragment ──────────────────────────────────────────────────

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  let seed = u.params0.x;
  let sunSize = u.params0.y;
  let time = (u.time.x + seed) * 3.0;

  // Aspect-corrected coordinates
  let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

  // ── Sky gradient ─────────────────────────────────────────────────
  let skyBottom = u.color0.rgb;
  let skyTop = u.color1.rgb;
  var col = mix(skyBottom, skyTop, uv.y);

  // ── Sun position (top of screen) ─────────────────────────────────
  let sunCenter = vec2<f32>(0.5, 0.95);
  let diff = vec2<f32>((uv.x - sunCenter.x) * aspect, uv.y - sunCenter.y);
  let d = length(diff);

  // ── Soft sun glow (gaussian, no hard disc) ───────────────────────
  // Scale glow radii by sunSize
  let ss = sunSize * sunSize;

  // Inner bright core — very soft falloff
  let innerGlow = exp(-d * d / (0.002 * ss)) * 1.2;
  let sunColor = vec3<f32>(1.0, 0.95, 0.7);
  col = mix(col, sunColor, clamp(innerGlow, 0.0, 1.0));

  // Mid glow — warm corona
  let midGlow = exp(-d * d / (0.01 * ss)) * 0.45;
  let warmColor = vec3<f32>(1.0, 0.88, 0.55);
  col += warmColor * midGlow;

  // Wide atmospheric glow
  let wideGlow = exp(-d * d / (0.06 * ss)) * 0.15;
  col += vec3<f32>(1.0, 0.85, 0.5) * wideGlow;

  // ── Natural sun rays (god rays) ───────────────────────────────────
  let angle = atan2(diff.y, diff.x);
  // Multiple overlapping ray frequencies for organic look
  let rayNoise = fbm(vec2<f32>(angle * 3.0, time * 0.02));
  let ray1 = pow(max(sin(angle * 6.0 + rayNoise * 2.0), 0.0), 3.0);
  let ray2 = pow(max(sin(angle * 10.0 - time * 0.015 + rayNoise), 0.0), 4.0);
  let ray3 = pow(max(sin(angle * 14.0 + time * 0.01), 0.0), 5.0);
  let rays = ray1 * 0.5 + ray2 * 0.3 + ray3 * 0.2;
  // Rays fade with distance from sun, and scale with sun size
  let rayFalloff = exp(-d * d / (0.04 * ss)) * smoothstep(0.0, 0.02 * sunSize, d);
  let rayColor = vec3<f32>(1.0, 0.97, 0.88);
  col += rayColor * rays * rayFalloff * 0.18;

  // ── Wispy cirrus clouds ──────────────────────────────────────────
  // Only in upper portion of screen
  let cloudMask = smoothstep(0.55, 0.85, uv.y);

  // Wind drift
  let wind = vec2<f32>(0.015, 0.003);

  // Far wispy layer — large, thin
  let cp1 = p * vec2<f32>(2.0, 4.0) + wind * time * 0.8 + vec2<f32>(seed * 0.1, 0.0);
  let cirrus1 = fbmCirrus(cp1);
  let wisp1 = smoothstep(0.42, 0.62, cirrus1) * 0.22;

  // Near wispy layer — smaller, slightly denser
  let cp2 = p * vec2<f32>(3.0, 5.5) + wind * time * 1.2 + vec2<f32>(0.0, seed * 0.1);
  let cirrus2 = fbmCirrus(cp2);
  let wisp2 = smoothstep(0.44, 0.64, cirrus2) * 0.18;

  // Cloud color — bright white, lit by sun
  let cloudBright = vec3<f32>(1.0, 1.0, 1.0);
  let cloudDim = vec3<f32>(0.85, 0.88, 0.93);

  // Sun-lit clouds: brighter closer to sun
  let sunLit = exp(-d * d / 0.08);
  let cloudCol1 = mix(cloudDim, cloudBright, sunLit * 0.7);
  let cloudCol2 = mix(cloudDim, cloudBright, sunLit * 0.5);

  col = mix(col, cloudCol1, wisp1 * cloudMask);
  col = mix(col, cloudCol2, wisp2 * cloudMask);

  // ── Sun halo (delicate rainbow arc) ─────────────────────────────
  let haloRadius = 0.45 * sunSize;
  let haloDist = d - haloRadius;

  // Thin, delicate ring
  let haloRing = exp(-haloDist * haloDist / 0.0004);

  // Full rainbow spectrum across the ring — red outside, violet inside
  let haloNorm = clamp((haloDist + 0.025) / 0.05, 0.0, 1.0);
  // Spectral colors: violet → blue → cyan → green → yellow → red
  let haloR = smoothstep(0.0, 0.35, haloNorm) + smoothstep(0.85, 1.0, haloNorm) * 0.3;
  let haloG = smoothstep(0.15, 0.45, haloNorm) * (1.0 - smoothstep(0.7, 1.0, haloNorm));
  let haloB = (1.0 - smoothstep(0.3, 0.65, haloNorm));
  let haloColor = vec3<f32>(haloR, haloG, haloB);

  // Strongest at bottom of sun, fades toward top
  let haloAngleMask = 0.3 + 0.7 * clamp(-diff.y / (haloRadius + 0.01), 0.0, 1.0);
  col += haloColor * haloRing * haloAngleMask * 0.07;

  // ── Horizon haze ─────────────────────────────────────────────────
  let haze = smoothstep(0.4, 0.0, uv.y);
  col = mix(col, vec3<f32>(0.78, 0.85, 0.92), haze * 0.15);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
