import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import type { Rect } from './types';
import { useEffectProgress } from './useEffectProgress';

export const ECHO_MS = 2400;

type Props = {
  /** The sent bubble, window logical px. */
  rect: Rect;
  onDone: () => void;
};

/**
 * Encore: rings in the outline of the bubble ripple out of it across the
 * screen, thinning and fading as they travel, while the bubble stays put.
 */
export default function EchoEffect({ rect, onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(ECHO_MS, onDone);
  return (
    <ShaderView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[rect.x, rect.y, rect.w, rect.h]}
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

const RINGS: i32 = 5;
const STAGGER: f32 = 0.14;     // share of the play between two rings
const WIDTH: f32 = 2.2;        // ring half-width, px
const WAKE: f32 = 46.0;        // e-fold length of the glow behind a ring, px
const CORNER: f32 = 12.0;      // bubble corner radius, px
const MINT = vec3<f32>(0.62, 0.95, 0.83);
const TEAL = vec3<f32>(0.18, 0.49, 0.42);

fn sdRoundBox(p: vec2<f32>, halfSize: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - halfSize + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  if (p <= 0.0 || p >= 1.0) {
    return vec4<f32>(0.0);
  }
  // Window logical px, y-down: the space the bubble rect was measured in.
  let uv = ndc * 0.5 + 0.5;
  let res = u.resolution.xy / u.resolution.w;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * res;

  let size = u.params0.zw;
  let centre = u.params0.xy + size * 0.5;
  let d = sdRoundBox(q - centre, size * 0.5, CORNER);
  let reach = res.y * 0.9;
  let flight = 1.0 - STAGGER * f32(RINGS - 1);

  var rgb = vec3<f32>(0.0);
  var a = 0.0;
  for (var i = 0; i < RINGS; i = i + 1) {
    let ti = clamp((p - STAGGER * f32(i)) / flight, 0.0, 1.0);
    if (ti <= 0.0 || ti >= 1.0) {
      continue;
    }
    let x = d - reach * (1.0 - pow(1.0 - ti, 1.8));
    let ring = exp(-x * x / (2.0 * WIDTH * WIDTH));
    let wake = select(0.0, exp(x / WAKE) * 0.16, x < 0.0);
    let fade = smoothstep(0.0, 0.06, ti) * pow(1.0 - ti, 1.4);
    let inten = (ring + wake) * fade;
    rgb = rgb + mix(MINT, TEAL, ti) * inten;
    a = a + inten;
  }

  let outside = smoothstep(0.0, 2.0, d);
  let alpha = clamp(a * outside, 0.0, 1.0);
  return vec4<f32>(min(rgb * outside, vec3<f32>(alpha)), alpha);
}
`;
