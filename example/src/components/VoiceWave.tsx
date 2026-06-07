import { ShaderView, type ShaderViewProps } from 'react-native-effects';

type Props = Omit<ShaderViewProps, 'fragmentShader' | 'colors' | 'params'>;

/**
 * A simulated audio waveform — a glowing oscillating line with a soft filled
 * envelope, coloured blue→pink across its width, pulsing as if reacting to a
 * voice. The "amplitude" is faked from layered sines + noise for now; a real
 * mic could later drive it through `u.live`. Render it `transparent`.
 * Pure procedural — no texture sampling.
 */
export default function VoiceWave({ speed = 1.0, ...viewProps }: Props) {
  return (
    <ShaderView
      fragmentShader={WAVE_SHADER}
      speed={speed}
      transparent
      {...viewProps}
    />
  );
}

const WAVE_SHADER = /* wgsl */ `
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

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let uv = ndc * 0.5 + 0.5;
  let x = (uv.x - 0.5) * 2.0; // -1 .. 1
  let y = uv.y - 0.5;

  // Live audio: live = (level, bass, treble, listening).
  let level = u.live.x;
  let bass = u.live.y;
  let treble = u.live.z;

  // Loudness envelope: louder in the middle, tapering at the edges.
  let env = smoothstep(1.0, 0.15, abs(x));

  // Volume: a faint idle baseline so it's a gentle line when silent, then
  // driven hard by the mic level when you speak.
  let vol = 0.03 + 0.02 * sin(t * 1.7) + level * 0.85;

  // Waveform harmonics, shaped by the frequency bands — bass swells the base
  // wave, treble adds the fast spiky detail.
  let wave = sin(x * 9.0 + t * 3.4) * 0.5 * (0.6 + bass * 1.1)
           + sin(x * 19.0 - t * 2.2) * (0.18 + treble * 0.7)
           + (vnoise(vec2<f32>(x * 3.0, t * 0.7)) - 0.5) * (0.6 + treble * 1.0);
  let amp = wave * env * vol;

  // Distance to the waveform line, and a filled envelope band beneath it.
  let dist = abs(y - amp);
  let line = smoothstep(0.020, 0.0, dist);
  let fillH = abs(amp) + 0.006;
  let fill = smoothstep(fillH, fillH - 0.02, abs(y)) * 0.18 * env;
  let glow = smoothstep(0.13, 0.0, dist) * 0.5;

  // Blue → violet → pink across the width.
  let c1 = vec3<f32>(0.30, 0.55, 1.0);
  let c2 = vec3<f32>(1.0, 0.45, 0.85);
  var col = mix(c1, c2, uv.x);
  col = mix(col, vec3<f32>(1.0), line * 0.55);

  let alpha = clamp(line + glow + fill, 0.0, 1.0);
  // Transparent canvas composites PREMULTIPLIED.
  return vec4<f32>(col * alpha, alpha);
}
`;
