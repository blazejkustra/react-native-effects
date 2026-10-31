import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';
import type { ColorInput } from 'react-native-effects';

type Props = ViewProps & {
  /** Primary orb color. */
  color?: ColorInput;
  /** Second orb color, swirled through the first. */
  accentColor?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Activity level 0.0 (idle) to 1.0 (listening). Default: 0.0 */
  activity?: number;
  /** Outer bloom/glow intensity. Default: 0.6 */
  bloom?: number;
};

export default function SiriOrb({
  color = '#d9a441',
  accentColor = '#0f6b5a',
  speed = 1.0,
  activity = 0.0,
  bloom = 0.6,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color, accentColor], [color, accentColor]);
  const params = useMemo(() => [activity, bloom], [activity, bloom]);

  return (
    <ShaderView
      fragmentShader={ORB_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      transparent
      {...viewProps}
    />
  );
}

const ORB_SHADER = /* wgsl */ `
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

fn orbPalette(t: f32) -> vec3<f32> {
  return mix(u.color0.rgb, u.color1.rgb, 0.5 + 0.5 * sin(t * 6.2831853));
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
  let warpAmt = 1.5 + activity * 1.5;

  // Two layers of warped noise for rich color variation
  let warp1 = fbm3(centered * 3.5 + vec2<f32>(time * 0.2, time * 0.15)) - 0.5;
  let warp2 = fbm3(centered * 6.0 + vec2<f32>(-time * 0.18, time * 0.22) + 5.0) - 0.5;

  let colorIdx = warp1 * warpAmt + warp2 * warpAmt * 0.6 + time * 0.05;

  var orbCol = orbPalette(colorIdx);

  // Add radial brightness variation (brighter center)
  let normDist = dist / radius;
  let coreBright = 1.0 + (1.0 - smoothstep(0.0, 0.8, normDist)) * 0.3;
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
  let rimColor = orbPalette(colorIdx + 0.3) * 1.5;

  // ---- Specular highlights ----
  let sp1 = vec2<f32>(cos(time * 0.6) * 0.1, sin(time * 0.8) * 0.08);
  let spec1 = exp(-length(centered - sp1) * length(centered - sp1) * 350.0) * 0.35;

  let sp2 = vec2<f32>(cos(time * -0.4 + 2.0) * 0.06, sin(time * 0.55 + 1.0) * 0.07);
  let spec2 = exp(-length(centered - sp2) * length(centered - sp2) * 600.0) * 0.2;

  // ---- Compose orb ----
  var col = orbCol * mask;
  col += rimColor * rim * 0.3;
  col += vec3<f32>(1.0, 0.95, 1.0) * (spec1 + spec2) * mask;

  // ---- Outer glow / bloom ----
  let glowFalloff = 80.0;
  let gd = max(0.0, dist - radius + 0.01);
  let glowMask = exp(-gd * gd * glowFalloff) * bloomIntensity;

  col += u.color0.rgb * glowMask * (1.0 - mask) * 0.7;

  // Wide subtle ambient glow
  let ambientGlow = exp(-dist * dist * 12.0) * 0.08 * bloomIntensity;
  col += u.color0.rgb * ambientGlow;

  // Tone mapping
  col = pow(col, vec3<f32>(0.92));
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

  // Alpha: visible where orb, glow, or bloom is present
  let totalGlow = max(mask, glowMask);
  let alpha = clamp(totalGlow + ambientGlow * 2.0, 0.0, 1.0);

  return vec4<f32>(col, alpha);
}
`;
