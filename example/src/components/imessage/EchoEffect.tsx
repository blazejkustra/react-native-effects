import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import type { Rect } from './types';
import { useEffectProgress } from './useEffectProgress';

export const ECHO_MS = 2400;

type Props = {
  /** The sent bubble, window logical px. */
  rect: Rect;
  /** View-shot of that bubble; every echo is a copy of it. */
  snapshotUri: string;
  onDone: () => void;
};

/**
 * iMessage's Echo: the bubble is copied a couple of dozen times and the
 * copies swirl out of it across the whole screen, shrinking a little and
 * fading at the end of their flight, while the real bubble stays put. The copies are the bubble's own
 * pixels: for every fragment each copy's transform is undone and the
 * snapshot sampled where it lands inside the rect.
 */
export default function EchoEffect({ rect, snapshotUri, onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(ECHO_MS, onDone);
  return (
    <ShaderView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[rect.x, rect.y, rect.w, rect.h]}
      texture={{ uri: snapshotUri }}
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const COPIES: i32 = 22;
const STAGGER: f32 = 0.38;     // share of the play spent launching copies
const GOLDEN: f32 = 2.39996;   // sunflower angle between neighbouring slots
const SWIRL: f32 = 1.2;        // radians a copy swings about the bubble in flight

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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

  let origin = u.params0.xy;
  let size = u.params0.zw;
  let centre = origin + size * 0.5;

  var rgb = vec3<f32>(0.0);
  var a = 0.0;
  for (var i = 0; i < COPIES; i = i + 1) {
    let fi = f32(i);
    let h2 = hash21(vec2<f32>(fi, 7.9));
    // Copies leave one after another, then all fly on the same clock.
    let ti = clamp((p - STAGGER * fi / f32(COPIES)) / (1.0 - STAGGER), 0.0, 1.0);
    if (ti <= 0.0) {
      continue;
    }
    let ease = 1.0 - pow(1.0 - ti, 2.4);
    // Each copy owns a slot in a sunflower laid over the whole screen, so
    // the swarm fills it evenly the way iMessage does, and swings into its
    // slot about the bubble rather than flying straight, so the flight
    // reads as a spiral.
    let slot = vec2<f32>(cos(fi * GOLDEN), sin(fi * GOLDEN))
      * sqrt((fi + 0.5) / f32(COPIES));
    let dest = res * 0.5 + slot * res * vec2<f32>(0.44, 0.46);
    let arm = dest - centre;
    let turn = SWIRL * (1.0 - ease);
    let ct = cos(turn);
    let st = sin(turn);
    let c = centre
      + vec2<f32>(ct * arm.x - st * arm.y, st * arm.x + ct * arm.y) * ease;
    let scale = mix(1.0, 0.7, ease);
    // The swarm holds together and each copy thins only at the end of its
    // flight, so the screen is full before anything is gone.
    let alpha = 1.0 - smoothstep(0.65, 1.0, ti);
    let rot = (h2 - 0.5) * 0.9 * ease;

    // Undo this copy's transform: where in the bubble does q come from?
    let d = q - c;
    let cr = cos(rot);
    let sr = sin(rot);
    let local = vec2<f32>(cr * d.x + sr * d.y, -sr * d.x + cr * d.y) / scale;
    let t = (local + size * 0.5) / size;
    if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) {
      continue;
    }
    let s = textureSampleLevel(tex, samp, t, 0.0);
    let w = s.a * alpha * (1.0 - a);
    rgb = rgb + s.rgb * w;
    a = a + w;
  }
  return vec4<f32>(rgb, a);
}
`;
