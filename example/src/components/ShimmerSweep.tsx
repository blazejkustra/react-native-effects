import { ShaderView, type ShaderViewProps } from 'react-native-effects';

type Props = Omit<ShaderViewProps, 'fragmentShader' | 'colors' | 'params'>;

/**
 * The "AI is thinking" shimmer — but iridescent instead of the usual flat grey
 * sweep. A soft diagonal band of light travels across the surface on a loop,
 * tinted with a rainbow that drifts over time. Render it `transparent` and
 * `pointerEvents="none"` over skeleton lines (or any placeholder) to get the
 * streaming-generation shimmer every AI app has, only prettier.
 *
 * Pure procedural — no texture sampling.
 */
export default function ShimmerSweep({ speed = 1.0, ...viewProps }: Props) {
  return (
    <ShaderView
      fragmentShader={SHIMMER_SHADER}
      speed={speed}
      transparent
      {...viewProps}
    />
  );
}

const SHIMMER_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let uv = ndc * 0.4 + 0.4;

  // Diagonal coordinate (top-left → bottom-right) the light sweeps along.
  let d = uv.x * 0.6 + (1.0 - uv.y) * 0.4;

  // Looping sweep position; measure wrap-aware distance to it so the band
  // re-enters seamlessly each cycle.
  let sweep = fract(t * 0.36);
  var dist = abs(d - sweep);
  dist = min(dist, 1.0 - dist);

  // A broad soft band with a wide bright core — a lush wash of light rather
  // than a thin scanner line.
  let halo = smoothstep(0.42, 0.0, dist);
  let core = smoothstep(0.18, 0.0, dist);

  // Restrained 2-tone (blue → violet) instead of a full rainbow, so it reads
  // like a real AI app's generating state rather than a toy skeleton.
  let c1 = vec3<f32>(0.30, 0.55, 1.0);
  let c2 = vec3<f32>(0.66, 0.40, 1.0);
  let blend = 0.5 + 0.5 * sin(6.2831853 * (d * 0.6 + t * 0.08));
  let rgb = mix(c1, c2, blend);

  // Faint everywhere so the placeholder reads as "alive", brightest in the band.
  let alpha = clamp(halo * 0.4 + core * 0.5 + 0.06, 0.0, 1.0);

  // Transparent canvas composites with PREMULTIPLIED alpha — premultiply rgb.
  return vec4<f32>(rgb * alpha, alpha);
}
`;
