import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';
import type { ColorInput } from 'react-native-effects';

type Props = ViewProps & {
  /** Primary orb color (magenta/purple). */
  color?: ColorInput;
  /** Accent color for chromatic edges (cyan). */
  accentColor?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Activity level 0.0 (idle) to 1.0 (listening). Default: 0.0 */
  activity?: number;
  /** Outer bloom/glow intensity. Default: 0.6 */
  bloom?: number;
};

export default function SiriOrb({
  color = '#a855f6',
  accentColor = '#06b6d4',
  speed = 1.0,
  activity = 0.0,
  bloom = 0.6,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color, accentColor], [color, accentColor]);
  const params = useMemo(() => [activity, bloom], [activity, bloom]);

  return (
    <ShaderView
      fragmentShader={SIRI_ORB_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      transparent
      {...viewProps}
    />
  );
}

const SIRI_ORB_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), s.x),
    mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), s.x),
    s.y
  );
}

fn fbm3(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.01 + vec2<f32>(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Palette: vivid neon Siri colors
fn siriPalette(t: f32) -> vec3<f32> {
  // Deep magenta -> electric purple -> hot cyan -> warm pink -> back
  let magenta = vec3<f32>(0.95, 0.05, 0.55);
  let purple  = vec3<f32>(0.50, 0.05, 0.95);
  let cyan    = vec3<f32>(0.0, 0.85, 0.95);
  let pink    = vec3<f32>(1.0, 0.25, 0.55);
  let blue    = vec3<f32>(0.15, 0.25, 0.95);

  let tt = fract(t);
  if (tt < 0.2) {
    return mix(magenta, purple, tt / 0.2);
  } else if (tt < 0.4) {
    return mix(purple, blue, (tt - 0.2) / 0.2);
  } else if (tt < 0.6) {
    return mix(blue, cyan, (tt - 0.4) / 0.2);
  } else if (tt < 0.8) {
    return mix(cyan, pink, (tt - 0.6) / 0.2);
  }
  return mix(pink, magenta, (tt - 0.8) / 0.2);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let activity = clamp(u.params0.x, 0.0, 1.0);
  let bloomIntensity = u.params0.y;
  let aspect = u.resolution.z;

  // Center UV with aspect correction
  let uv = ndc * 0.5 + 0.5;
  let centered = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);
  let dist = length(centered);

  // Breathing pulse
  let pulseSpeed = 2.2 + activity * 1.8;
  let pulseAmt = 0.008 + activity * 0.012;
  let breathe = sin(time * pulseSpeed) * pulseAmt;
  let radius = 0.22 + breathe;

  // ---- Internal swirling colors ----
  // Use sin/cos of angle to avoid atan2 discontinuity
  let warpAmt = 1.5 + activity * 1.5;
  let angle = atan2(centered.y, centered.x);
  let sa = sin(angle);
  let ca = cos(angle);

  // Seamless polar-like coords using sin/cos (no wrapping seam)
  let polar1 = vec2<f32>(ca + dist * 2.0, sa + dist * 2.0);
  let polar2 = vec2<f32>(sa * 1.5 + dist * 3.0, ca * 1.5 - dist * 3.0);

  // Two layers of warped noise for rich color variation
  let warp1 = fbm3(polar1 + vec2<f32>(time * 0.2, time * 0.15)) - 0.5;
  let warp2 = fbm3(polar2 + vec2<f32>(-time * 0.18, time * 0.22) + 5.0) - 0.5;

  // Color index: use sin/cos blend instead of raw angle to stay seamless
  let colorIdx = (sa * 0.5 + ca * 0.3) * 0.5 + 0.5 + warp1 * warpAmt * 0.3 + warp2 * warpAmt * 0.2 + time * 0.05;

  // Get vivid palette color
  var orbCol = siriPalette(colorIdx);

  // Boost saturation and vibrancy
  let lum = dot(orbCol, vec3<f32>(0.299, 0.587, 0.114));
  orbCol = mix(vec3<f32>(lum), orbCol, 1.6);

  // Add radial brightness variation (brighter center)
  let normDist = dist / radius;
  let coreBright = 1.0 + (1.0 - smoothstep(0.0, 0.7, normDist)) * 0.8;
  orbCol *= coreBright;

  // Add subtle noise shimmer
  let shimmer = noise(centered * 15.0 + vec2<f32>(time * 0.5, time * 0.3));
  orbCol += orbCol * (shimmer - 0.5) * 0.15;

  // ---- Orb mask: crisp sphere with slight softness ----
  let edgeWidth = 0.025;
  let mask = 1.0 - smoothstep(radius - edgeWidth, radius + edgeWidth * 0.5, dist);

  // Bright rim at the edge (Fresnel-like)
  let rimStart = radius - edgeWidth * 3.0;
  let rim = smoothstep(rimStart, radius, dist) * (1.0 - smoothstep(radius, radius + edgeWidth, dist));
  let rimColor = siriPalette(colorIdx + 0.3) * 1.5;

  // ---- Specular highlights ----
  let sp1 = vec2<f32>(cos(time * 0.6) * 0.1, sin(time * 0.8) * 0.08);
  let spec1 = exp(-length(centered - sp1) * length(centered - sp1) * 350.0) * 1.2;

  let sp2 = vec2<f32>(cos(time * -0.4 + 2.0) * 0.06, sin(time * 0.55 + 1.0) * 0.07);
  let spec2 = exp(-length(centered - sp2) * length(centered - sp2) * 600.0) * 0.7;

  // ---- Compose orb ----
  var col = orbCol * mask;
  col += rimColor * rim * 0.6;
  col += vec3<f32>(1.0, 0.95, 1.0) * (spec1 + spec2) * mask;

  // ---- Outer glow / bloom ----
  // Multi-colored glow that bleeds past the edge
  let glowFalloff = 80.0;
  let gd = max(0.0, dist - radius + 0.01);
  let glowMask = exp(-gd * gd * glowFalloff) * bloomIntensity;

  // Chromatic glow: different colors in different directions (seamless)
  let glowCol = siriPalette((sa * 0.5 + ca * 0.3) * 0.5 + 0.5 + time * 0.03);
  col += glowCol * glowMask * 0.7;

  // Wide subtle ambient glow
  let ambientGlow = exp(-dist * dist * 12.0) * 0.08 * bloomIntensity;
  let ambientCol = siriPalette(time * 0.02 + 0.5);
  col += ambientCol * ambientGlow;

  // ---- Chromatic aberration at edges ----
  let caStr = smoothstep(radius * 0.5, radius * 1.2, dist) * 0.02;
  let caOff = normalize(centered + vec2<f32>(0.0001)) * caStr;

  let distR = length(centered + caOff);
  let distB = length(centered - caOff);
  let maskR = 1.0 - smoothstep(radius - edgeWidth, radius + edgeWidth * 0.5, distR);
  let maskB = 1.0 - smoothstep(radius - edgeWidth, radius + edgeWidth * 0.5, distB);

  // Shift red outward, blue inward for energy feel
  col.r = col.r * 0.5 + orbCol.r * coreBright * maskR * 0.5;
  col.b = col.b * 0.5 + orbCol.b * coreBright * maskB * 0.5;

  // Tone mapping — preserve vibrancy
  col = pow(col, vec3<f32>(0.92));
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

  // Alpha: visible where orb, glow, or bloom is present
  let totalGlow = max(mask, glowMask);
  let alpha = clamp(totalGlow + ambientGlow * 2.0, 0.0, 1.0);

  return vec4<f32>(col, alpha);
}
`;
