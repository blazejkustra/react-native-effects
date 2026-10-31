import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type PayGlyphProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent'
> & {
  /** `u.live = (ring, spark, 0, 0)`, every amount 0..1. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A progress ring that draws itself around the glyph's centre, then closes
 * into a four-pointed spark.
 */
export default function PayGlyph({
  paramsSynchronizable,
  ...rest
}: PayGlyphProps) {
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

const TAU = 6.2832;
const MINT = vec3<f32>(0.5, 0.84, 0.75);

fn sparkDistance(c: vec2<f32>, size: f32) -> f32 {
  let q = abs(c) / max(size, 0.001);
  return (pow(q.x, 0.55) + pow(q.y, 0.55) - 1.0) * size;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let c = ndc * vec2<f32>(u.resolution.z, 1.0) * 1.05;
  let px = 2.4 / u.resolution.y;
  let ring = u.live.x;
  let spark = u.live.y;

  let r = length(c);
  let angle = fract(atan2(c.x, c.y) / TAU + 1.0);
  let band = 1.0 - smoothstep(0.06 - px, 0.06 + px, abs(r - 0.78));
  let drawn = step(angle, ring) * step(0.001, ring);
  let ringAlpha = band * drawn * (1.0 - spark);

  let sparkAlpha = (1.0 - smoothstep(-px, px, sparkDistance(c, 0.82 * spark))) * step(0.001, spark);

  let alpha = max(ringAlpha, sparkAlpha);
  return vec4<f32>(MINT * alpha, alpha);
}
`;
