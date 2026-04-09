import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Activity level 0.0 (idle) to 1.0 (listening). Default: 0.0 */
  activity?: number;
};

export default function SiriEdgeGlow({
  speed = 1.0,
  activity = 0.0,
  ...viewProps
}: Props) {
  const params = useMemo(() => [activity], [activity]);

  return (
    <ShaderView
      fragmentShader={SIRI_EDGE_GLOW_SHADER}
      params={params}
      speed={speed}
      isStatic={false}
      transparent
      {...viewProps}
    />
  );
}

const SIRI_EDGE_GLOW_SHADER = /* wgsl */ `
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

fn siriPalette(t: f32) -> vec3<f32> {
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

// Rounded rectangle signed distance field
// p = point, b = half-size, r = corner radius
fn sdRoundedRect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let activity = clamp(u.params0.x, 0.0, 1.0);
  let aspect = u.resolution.z;

  let uv = ndc * 0.5 + 0.5;

  // Work in pixel-like coords centered at screen middle
  // p goes from (-0.5, -0.5) to (0.5, 0.5)
  let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

  // Rounded rect matching iPhone shape
  // Half-size of the screen rect, corner radius ~0.06 normalized
  let halfSize = vec2<f32>(aspect * 0.5, 0.5);
  let cornerR = 0.07;

  // SDF: negative inside, positive outside, 0 on border
  let d = sdRoundedRect(p, halfSize, cornerR);

  // We want glow only near the border (d ~ 0), fading inward
  // d is negative inside the rect; border is at d=0
  // Glow peaks near the edge and fades toward center
  let borderDist = abs(d);

  // ---- Noise for wispy organic inner edge ----
  let n1 = fbm3(uv * 8.0 + vec2<f32>(time * 0.1, time * 0.07)) - 0.5;
  let n2 = fbm3(uv * 5.0 + vec2<f32>(-time * 0.08, time * 0.12) + 3.0) - 0.5;
  let warp = (n1 * 0.6 + n2 * 0.4) * 0.012 * (1.0 + activity * 0.5);

  // ---- Main glow: tight gaussian around the rounded border ----
  let warpedDist = borderDist + warp;
  let glowWidth = 0.025;
  let glow = exp(-warpedDist * warpedDist / (glowWidth * glowWidth));

  // ---- Color: rotating around the perimeter ----
  // Use atan2 of centered position for perimeter angle
  let sa = sin(atan2(p.y, p.x));
  let ca = cos(atan2(p.y, p.x));
  let perimT = (sa * 0.5 + ca * 0.3) * 0.5 + 0.5;
  let rot = time * 0.18;
  let edgeColor = siriPalette(perimT + rot);

  // ---- Breathing pulse (synced with SiriOrb) ----
  let pulseSpeed = 2.2 + activity * 1.8;
  let pulse = 0.85 + 0.15 * sin(time * pulseSpeed);

  // ---- Secondary inner glow (dimmer, offset inward) ----
  let innerDist = max(0.0, -d - 0.015) + warp * 0.5;
  let innerGlow = exp(-innerDist * innerDist / (0.018 * 0.018)) * 0.25;
  let innerColor = siriPalette(perimT + rot + 0.12);

  // ---- Compose ----
  let intensity = 0.6 + activity * 0.3;
  var col = edgeColor * glow * pulse * intensity;
  col += innerColor * innerGlow * pulse * intensity;

  // Only show inside the screen (d < 0)
  let insideMask = smoothstep(0.002, -0.002, d);
  col *= insideMask;

  let alpha = clamp((glow + innerGlow) * pulse * intensity * insideMask, 0.0, 1.0);

  return vec4<f32>(col, alpha);
}
`;
