import { ShaderView, type ShaderViewProps } from 'react-native-effects';

type Props = Omit<ShaderViewProps, 'fragmentShader' | 'colors' | 'params'>;

/**
 * A Gemini-style "thinking" blob — a soft metaball that gently morphs its shape
 * with a smooth dark→blue gradient fill, an inner moving highlight and a clean
 * single-colour glow (no plasma spilling outside, no hard rim). Render it
 * `transparent` in a square container. Pure procedural — no texture sampling.
 */
export default function ThinkingOrb({ speed = 1.0, ...viewProps }: Props) {
  return (
    <ShaderView
      fragmentShader={ORB_SHADER}
      speed={speed}
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

// One metaball contribution.
fn ball(p: vec2<f32>, c: vec2<f32>, r: f32) -> f32 {
  let d = p - c;
  return (r * r) / (dot(d, d) + 0.0009);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  // Zoom out a touch so the soft glow field decays well before the canvas edge
  // (otherwise the halo grazes — and gets clipped at — the box outskirts).
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0) * 1.4;

  // Live audio: params1 = (level, bass, treble, listening).
  let level = u.params1.x;
  let treble = u.params1.z;

  // Breathing, swollen by your voice.
  let breathe = 1.0 + 0.04 * sin(t * 1.6) + level * 0.65;

  // Voice wobble — jitter the metaball field when you talk so it distorts.
  let wob = vec2<f32>(sin(p.y * 9.0 + t * 6.0), cos(p.x * 9.0 + t * 6.0))
            * (level * 0.05 + treble * 0.035);
  let pp = p + wob;

  // A few slowly orbiting metaballs whose union is a soft morphing blob.
  let c0 = vec2<f32>(cos(t * 0.5), sin(t * 0.65)) * 0.05;
  let c1 = vec2<f32>(cos(t * 0.43 + 2.1), sin(t * 0.5 + 1.0)) * 0.07;
  let c2 = vec2<f32>(cos(t * 0.6 + 4.0), sin(t * 0.47 + 3.0)) * 0.055;
  var f = 0.0;
  f = f + ball(pp, c0, 0.16 * breathe);
  f = f + ball(pp, c1, 0.14 * breathe);
  f = f + ball(pp, c2, 0.12 * breathe);

  // Body (crisp-ish) and a wider soft glow field, both from the same metaball
  // field — so the glow is contained and matches the shape.
  let body = smoothstep(0.9, 1.15, f);
  let glow = smoothstep(0.28, 1.0, f);

  // Smooth vertical gradient: dark at the top → bright periwinkle at the bottom.
  let darkC = vec3<f32>(0.05, 0.07, 0.16);
  let blueC = vec3<f32>(0.46, 0.62, 1.0);
  let vert = smoothstep(0.15, 0.95, 1.0 - uv.y);
  var col = mix(darkC, blueC, vert);

  // Inner moving highlight near the lower metaball for a liquid sheen.
  let hl = exp(-dot(p - c1, p - c1) * 10.0);
  col = col + blueC * hl * 0.5;

  // Glow halo uses the bright blue only (no gradient muddiness).
  let alpha = clamp(body + glow * 0.55, 0.0, 1.0);
  // Brighten a touch when you speak.
  let rgb = mix(blueC, col, body) + blueC * level * 0.25;

  // Transparent canvas composites PREMULTIPLIED.
  return vec4<f32>(rgb * alpha, alpha);
}
`;
