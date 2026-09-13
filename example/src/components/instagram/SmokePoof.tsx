import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type SmokePoofProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent'
> & {
  /** `u.live = (progress 0→1, seed, 0, 0)`. Nothing is drawn at 0 or 1. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A single grey smoke puff that bursts out of the centre, billows, drifts
 * up-left and thins into wisps — the "poof" Instagram plays when a voice
 * message is discarded. Progress is pushed through the live channel so a
 * Reanimated timing curve drives it frame-accurately.
 */
export default function SmokePoof({
  paramsSynchronizable,
  ...rest
}: SmokePoofProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      transparent
      {...rest}
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
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// Soft round puff: 1 at the centre, 0 at radius r.
fn puff(q: vec2<f32>, centre: vec2<f32>, r: f32) -> f32 {
  let d = length(q - centre) / r;
  return 1.0 - smoothstep(0.0, 1.0, d);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  if (p <= 0.001 || p >= 0.999) {
    return vec4<f32>(0.0);
  }
  let seed = u.live.y * 17.0;

  // Centred, aspect-corrected, y-up. The button sits at the origin.
  let c = (ndc * 0.5) * vec2<f32>(u.resolution.z, 1.0);

  // Burst: fast expansion that decelerates, then a gentle drift up and left.
  let grow = 1.0 - pow(1.0 - p, 2.4);
  let radius = 0.12 + 0.25 * grow;
  let drift = vec2<f32>(-0.05, 0.07) * p * p + vec2<f32>(-0.01, 0.02) * p;
  var q = c - drift;

  // Domain warp so the cloud boils rather than scales like a sticker.
  let warpN = fbm(q * 4.0 + seed + vec2<f32>(0.0, -p * 1.2));
  let warpM = fbm(q * 4.0 - seed + vec2<f32>(p * 0.9, 0.4));
  q = q + (vec2<f32>(warpN, warpM) - 0.5) * (0.03 + 0.07 * grow);

  // Overlapping puffs around the centre with a slight upward bias.
  var d = puff(q, vec2<f32>(0.0, 0.0), radius * 1.1);
  d = d + puff(q, vec2<f32>(-0.6, 0.35) * radius, radius * 0.8);
  d = d + puff(q, vec2<f32>(0.6, 0.3) * radius, radius * 0.75);
  d = d + puff(q, vec2<f32>(-0.35, -0.55) * radius, radius * 0.7);
  d = d + puff(q, vec2<f32>(0.45, -0.5) * radius, radius * 0.7);
  d = d + puff(q, vec2<f32>(-0.15, 0.8) * radius, radius * 0.7);
  d = d + puff(q, vec2<f32>(0.2, 0.75) * radius, radius * 0.6);
  d = min(d, 1.5);

  // Erode with soft, low-frequency noise; the threshold rises over time so
  // the cloud thins into a few wisps instead of fading uniformly.
  let n = fbm(q * 4.5 + seed * 0.7 + vec2<f32>(p * 0.5, p * 1.4));
  let field = d * (0.6 + 0.8 * n);
  let thr = 0.32 + 0.7 * p;
  var alpha = smoothstep(thr, thr + 0.85, field);

  // Envelope: pops in over the first ~5%, holds, thins out at the end.
  let env = smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.5, 1.0, p));
  alpha = alpha * env * 0.82;

  // Colour: mid ash grey, a touch lighter where dense and lit from top-left,
  // with the button's red bleeding into the young smoke.
  let lit = fbm(q * 4.5 + seed * 0.7 + vec2<f32>(p * 0.5 - 0.1, p * 1.4 + 0.1));
  var col = vec3<f32>(0.44, 0.45, 0.48);
  col = col + vec3<f32>(0.16) * clamp((lit - n) * 3.0 + 0.3, 0.0, 1.0) * min(d, 1.0);
  col = mix(col, col * vec3<f32>(1.3, 0.7, 0.75),
            (1.0 - smoothstep(0.0, 0.3, p)) * 0.5 * min(d, 1.0));

  return vec4<f32>(col * alpha, alpha);
}
`;
