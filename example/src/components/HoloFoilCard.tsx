import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type Props = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'colors'
> & {
  /** Tilt channel: `u.live = (tiltX, tiltY, active, 0)`, 0.5 = flat. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A premium holographic foil surface — curved, desaturated iridescence under a
 * moving specular glare that blows out to white, with brushed micro-streaks and
 * fine sparkle dust. The tilt (from {@link useTilt}, via `u.live`) sweeps the
 * spectrum and the glare across the surface so it reads like real foil catching
 * the light. Pure procedural — no texture sampling.
 */
export default function HoloFoilCard({ paramsSynchronizable, ...rest }: Props) {
  return (
    <ShaderView
      fragmentShader={FOIL_SHADER}
      paramsSynchronizable={paramsSynchronizable}
      speed={1.0}
      {...rest}
    />
  );
}

const FOIL_SHADER = /* wgsl */ `
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

// Smooth full-spectrum cosine palette.
fn spectrum(h: f32) -> vec3<f32> {
  return 0.5 + 0.5 * cos(6.2831853 *
         (vec3<f32>(h) + vec3<f32>(0.0, 0.33, 0.67)));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let c = (uv - 0.5) * vec2<f32>(aspect, 1.0);

  // Tilt in [-1, 1]; 0.5 in the channel means flat.
  let tilt = (u.live.xy - 0.5) * 2.0;

  // Curved iridescence coordinate: warp straight bands with low-freq noise so
  // the colour flows like brushed foil instead of rigid candy stripes. Wide,
  // gradual bands (low frequency) read as premium.
  let warp = fbm(c * 2.0 + vec2<f32>(t * 0.05, t * 0.02));
  let g = c.x * 1.1 + c.y * 0.6 + (warp - 0.5) * 1.3
          + tilt.x * 0.7 - tilt.y * 0.45 + t * 0.02;

  // Desaturate the spectrum toward silver so it looks metallic, not neon.
  var irid = spectrum(fract(g * 0.7));
  let luma = dot(irid, vec3<f32>(0.299, 0.587, 0.114));
  irid = mix(vec3<f32>(luma), irid, 0.72);

  // Brushed anisotropic micro-streaks → metallic light/dark variation.
  let brush = 0.5 + 0.5 * sin(c.x * 88.0 + (warp - 0.5) * 16.0 + c.y * 6.0);
  var col = irid * (0.38 + 0.5 * brush);

  // Moving specular glare driven by tilt — the foil "shine" that blows to white.
  let glarePos = (c.x * 0.8 - c.y * 0.6)
                 - (tilt.x * 0.7 - tilt.y * 0.5) - 0.05 * sin(t * 0.4);
  let glare = exp(-glarePos * glarePos * 3.5);
  col = col + glare * 0.45;
  col = mix(col, vec3<f32>(1.0), glare * 0.45);

  // A softer counter-glare for depth on the opposite diagonal.
  let g2 = (c.x * 0.5 + c.y * 0.9) + tilt.y * 0.6;
  col = col + exp(-g2 * g2 * 1.5) * 0.10;

  // Premium framing: soft vignette so the edges sit darker.
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.55);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
