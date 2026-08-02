import { useMemo } from 'react';
import {
  ShaderViewWithPanGesture,
  type ColorInput,
  type ShaderViewWithPanGestureProps,
} from 'react-native-effects';

type Props = Omit<
  ShaderViewWithPanGestureProps,
  'fragmentShader' | 'colors'
> & {
  /** Base tone of the flowing field. */
  colorA?: ColorInput;
  /** Accent tone the field warps toward and the core glows with. */
  colorB?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
};

/**
 * A draggable "liquid light" field. A molten, glowing core follows your finger
 * (fed in through `u.live` by {@link ShaderViewWithPanGesture}); it warps the
 * flowing noise field around it and pushes concentric ripples outward. When you
 * are not touching, the core auto-orbits so the effect still feels alive.
 *
 * Lives in the example app — a demo of `ShaderViewWithPanGesture`, not a
 * general-purpose library primitive.
 */
export default function TouchField({
  colorA = '#312e81',
  colorB = '#f472b6',
  speed = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [colorA, colorB], [colorA, colorB]);

  return (
    <ShaderViewWithPanGesture
      fragmentShader={TOUCH_FIELD_SHADER}
      colors={colors}
      speed={speed}
      // Rest the core at screen center until the first touch.
      initialParamsSynchronizable={[0.5, 0.5, 0, 0]}
      {...viewProps}
    />
  );
}

const TOUCH_FIELD_SHADER = /* wgsl */ `
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

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 5; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// Rotate an RGB color around the (1,1,1) luminance axis — a clean hue shift.
fn hueRotate(c: vec3<f32>, a: f32) -> vec3<f32> {
  let k = vec3<f32>(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  var p = (uv - 0.5) * vec2<f32>(aspect, 1.0);

  // ShaderViewWithPanGesture remembers the pointer: u.live.xy is the current
  // finger, or wherever the gesture last ended (center before the first touch).
  let home = (u.live.xy - 0.5) * vec2<f32>(aspect, 1.0);
  // A small idle drift so it always feels alive.
  let wobble = vec2<f32>(sin(t * 0.7), cos(t * 0.9)) * 0.03;
  let center = home + wobble;

  let toCenter = p - center;
  let dist = length(toCenter);

  // Domain-warp the field, pulling it inward toward the core like a gravity well.
  let pull = 0.13 / (dist + 0.16);
  let warped = p - normalize(toCenter + vec2<f32>(1e-4)) * pull;
  var n = fbm(warped * 2.3 + vec2<f32>(t * 0.08, -t * 0.05));
  n = fbm(warped * 2.3 + vec2<f32>(n, n) + vec2<f32>(0.0, t * 0.06));

  // Flowing base color.
  var col = mix(u.color0.rgb, u.color1.rgb, smoothstep(0.15, 0.85, n));

  // Concentric ripples expanding from the core, fading with distance.
  let ripple = sin(dist * 24.0 - t * 4.5) * exp(-dist * 2.6);
  col = col + u.color1.rgb * ripple * 0.10;

  // Drag shifts the tone across red variants only — deep crimson ↔ bright ember.
  let warmth = clamp(0.5 + (u.live.x - 0.5) * 1.0 + (u.live.y - 0.5) * 0.5, 0.0, 1.0);

  // Licking flames — turbulent noise that rises over time, densest near the core.
  let flameField = fbm(warped * 4.5 + vec2<f32>(sin(t * 0.6), -t * 1.4));
  let flameMask = exp(-dist * 3.0);
  let flame = pow(clamp(flameField, 0.0, 1.0), 1.7) * flameMask;
  let fireHot = mix(vec3<f32>(0.9, 0.10, 0.02), vec3<f32>(1.0, 0.40, 0.05), warmth);
  col = col + flame * fireHot * 1.7;

  // Molten glowing core plus a soft halo around it, with a live fire flicker.
  // Tighter falloff keeps the Eye contained in darkness instead of flooding the screen.
  let flicker = 1.0 + 0.14 * sin(t * 11.0) + 0.09 * sin(t * 23.0 + 1.7);
  let core = exp(-dist * dist * 30.0);
  let halo = (0.05 / (dist * dist + 0.012)) * exp(-dist * 2.8);
  let glow = (core * 1.6 + halo * 0.5) * flicker;
  // Keep the core a hot blood-red instead of blowing out to white.
  let hot = mix(u.color1.rgb, mix(vec3<f32>(1.0, 0.10, 0.05), vec3<f32>(1.0, 0.30, 0.08), warmth), 0.5);
  col = col + glow * hot * 0.55;

  // The cat-slit pupil — a dark vertical lens carved through the hot core,
  // the unmistakable mark of the Eye.
  let pupil = 1.0 - smoothstep(0.05, 0.12, length(vec2<f32>(toCenter.x * 8.0, toCenter.y * 1.5)));
  col = mix(col, col * 0.05, pupil);

  // The Eye stays blood-red wherever you drag it — no hue sweep.

  // Settle the edges into the dark.
  let vd = uv - vec2<f32>(0.5, 0.5);
  col = col * clamp(1.0 - dot(vd, vd) * 0.7, 0.32, 1.0);

  // A whisper of grain so the darks never band.
  let grain = hash21(uv * u.resolution.xy + fract(t) * 311.0) - 0.5;
  col = col + grain * 0.012;

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
