import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import type { Rect } from './types';
import { useEffectProgress } from './useEffectProgress';

export const SPOTLIGHT_MS = 2600;

type Props = {
  /** The bubble to light, window logical px. */
  rect: Rect;
  onDone: () => void;
};

/**
 * iMessage's Spotlight: the room goes dark and a soft beam sweeps down from
 * the top onto the new bubble, holds, and lifts. The overlay only ever
 * darkens, so the bubble itself is the real view seen through a hole in the
 * dim: nothing here redraws it.
 */
export default function SpotlightEffect({ rect, onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(SPOTLIGHT_MS, onDone);
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

const DIM: f32 = 0.9;          // how dark the room gets
const BEAM: f32 = 0.5;         // how much of the dim the beam lifts
const HOLE_PAD: f32 = 10.0;    // px around the bubble left fully lit
const HOLE_SOFT: f32 = 26.0;   // px over which the hole's edge fades

fn sdRoundRect(p: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
  let d = abs(p) - half + vec2<f32>(r);
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  if (p <= 0.0 || p >= 1.0) {
    return vec4<f32>(0.0);
  }
  let uv = ndc * 0.5 + 0.5;
  let res = u.resolution.xy / u.resolution.w;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * res;

  let origin = u.params0.xy;
  let size = u.params0.zw;
  let centre = origin + size * 0.5;

  // Dark in, hold, lift.
  let env = smoothstep(0.0, 0.1, p) * (1.0 - smoothstep(0.82, 1.0, p));
  // The beam arrives from above the screen and settles on the bubble.
  let arrive = smoothstep(0.08, 0.42, p);
  let sweep = 1.0 - pow(1.0 - arrive, 3.0);
  let beamC = mix(vec2<f32>(centre.x, -0.15 * res.y), centre, sweep);
  let radius = max(size.x, size.y) * 0.75 + 70.0;
  // A little taller than wide, as a lamp overhead throws it.
  let rel = (q - beamC) * vec2<f32>(1.0, 0.8);
  let beam = 1.0 - smoothstep(radius * 0.35, radius, length(rel));

  // The bubble sits in a soft-edged hole once the beam has reached it.
  let sd = sdRoundRect(q - centre, size * 0.5 + vec2<f32>(HOLE_PAD), 22.0);
  let hole = (1.0 - smoothstep(0.0, HOLE_SOFT, sd)) * smoothstep(0.3, 0.5, p);

  var dim = DIM * env;
  dim = dim * (1.0 - BEAM * beam);
  dim = dim * (1.0 - hole);
  return vec4<f32>(0.0, 0.0, 0.0, dim);
}
`;
