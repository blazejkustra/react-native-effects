import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type TorchSceneProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'params'
> & {
  /** `u.live = (spotX pt, spotY pt, beam 0 narrow..1 wide, light 0..1)`. */
  paramsSynchronizable: ParamsSynchronizable;
  /** Width / height of the photo, for cover-fit sampling. */
  photoAspect: number;
};

/**
 * A dark photo lit by a phone torch: moonlight-level ambient everywhere, and
 * a warm-white spot whose size and brightness follow the beam (a narrow beam
 * packs the same light into a smaller, hotter disc). The spot has a hot core,
 * a flat flood with a soft rim, faint reflector rings and a hint of colour
 * fringing at its edge.
 */
export default function TorchScene({
  paramsSynchronizable,
  photoAspect,
  ...rest
}: TorchSceneProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[photoAspect]}
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const WARM: vec3<f32> = vec3<f32>(1.0, 0.93, 0.8);
const AMBIENT: vec3<f32> = vec3<f32>(0.002, 0.0026, 0.0045);

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn coverUv(uv: vec2<f32>) -> vec2<f32> {
  let screenAspect = u.resolution.z;
  let photoAspect = u.params0.x;
  var t = vec2<f32>(uv.x, 1.0 - uv.y);
  if (screenAspect < photoAspect) {
    t.x = 0.5 + (t.x - 0.5) * screenAspect / photoAspect;
  } else {
    t.y = 0.5 + (t.y - 0.5) * photoAspect / screenAspect;
  }
  return t;
}

// Radial light profile, r in spot radii.
fn profile(r: f32) -> f32 {
  let core = exp(-r * r * 5.0) * 0.9;
  let flood = (1.0 - smoothstep(0.1, 1.08, r)) * 0.5;
  let rings = 0.035 * exp(-pow((r - 0.9) / 0.045, 2.0))
    + 0.02 * exp(-pow((r - 0.62) / 0.05, 2.0));
  let spill = 0.02 * exp(-r * 1.6);
  return core + flood + rings + spill;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let pt = vec2<f32>(uv.x, 1.0 - uv.y) * u.resolution.xy / u.resolution.w;
  let photo = textureSampleLevel(tex, samp, coverUv(uv), 0.0).rgb;
  let raw = pow(photo, vec3<f32>(2.2));
  let albedo = raw / (vec3<f32>(1.0) + raw) * 1.7;

  let beam = clamp(u.live.z, 0.0, 1.0);
  let light = clamp(u.live.w, 0.0, 1.0);
  let radius = mix(58.0, 250.0, beam);
  let d = (pt - u.live.xy) / radius;
  let r = length(d * vec2<f32>(1.0, 1.08));
  let gain = light * mix(2.4, 0.95, beam);
  let lit = vec3<f32>(
    profile(r * 0.985),
    profile(r),
    profile(r * 1.02)
  ) * gain * WARM;

  var col = albedo * (AMBIENT + lit * 1.05);
  col = vec3<f32>(1.0) - exp(-col * 1.25);
  col = pow(col, vec3<f32>(1.0 / 2.2));
  col = col + (hash21(uv * u.resolution.xy + fract(u.time.x) * 91.0) - 0.5) / 255.0;
  return vec4<f32>(col, 1.0);
}
`;
