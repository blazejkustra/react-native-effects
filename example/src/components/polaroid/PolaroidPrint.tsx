import type { ImageSourcePropType } from 'react-native';
import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

/** An i-Type print: 88 x 107 mm, a 79 mm square image, 22 mm chin. */
export const PRINT_ASPECT = 88 / 107;

type PolaroidPrintProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'texture'
> & {
  photo: ImageSourcePropType;
  /** `u.live = (development 0..1, sway, seed, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * An instant print developing.
 *
 * The frame is paper: off-white, fibrous, with the image window pressed
 * slightly into it. Inside the window the photo comes up out of the milky
 * blue-grey opacifier the way the chemistry does it: shadows first, the dye
 * layers in order (blue, then green, red last, so the early image is cold
 * and cyan), contrast building as it goes. The reagent is spread from the
 * chin, so the bottom of the image is a little ahead, and the spread is never
 * perfectly even. The finished print is soft, warm and vignetted.
 */
export default function PolaroidPrint({
  photo,
  paramsSynchronizable,
  ...rest
}: PolaroidPrintProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      texture={photo}
      paramsSynchronizable={paramsSynchronizable}
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

const PRINT = vec2<f32>(88.0, 107.0);
const IMG_MIN = vec2<f32>(4.5, 6.0);
const IMG_SIZE = 79.0;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var s = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 3; i++) {
    s += amp * vnoise(p);
    p = p * 2.03 + vec2<f32>(17.0, 9.0);
    amp *= 0.5;
  }
  return s;
}

fn paper(mm: vec2<f32>) -> vec3<f32> {
  let fiber = vnoise(mm * vec2<f32>(14.0, 3.5)) * 0.5 + vnoise(mm * vec2<f32>(3.0, 11.0)) * 0.5;
  let cloud = fbm(mm * 0.35);
  var col = vec3<f32>(0.955, 0.948, 0.925) * (0.975 + 0.03 * cloud + 0.018 * fiber);
  let edge = min(min(mm.x, PRINT.x - mm.x), min(mm.y, PRINT.y - mm.y));
  col *= 0.93 + 0.07 * smoothstep(0.0, 1.6, edge);
  return col;
}

fn develop(q: vec2<f32>, dev: f32, seed: f32) -> vec3<f32> {
  let photo = textureSampleLevel(tex, samp, q, 0.0).rgb;
  let lum = dot(photo, vec3<f32>(0.299, 0.587, 0.114));

  let mottle = fbm(q * 4.0 + vec2<f32>(seed * 13.0, seed * 7.0)) - 0.5;
  let fromPod = q.y * 0.09;
  let p = pow(dev, 1.5) * 1.2 - 0.06 + fromPod + mottle * 0.12 + (0.45 - lum) * 0.22;

  let pb = smoothstep(0.0, 0.55, p);
  let pg = smoothstep(0.1, 0.72, p);
  let pr = smoothstep(0.26, 0.98, p);
  let contrast = mix(0.4, 1.0, smoothstep(0.15, 1.0, p));

  var graded = photo * 0.9 + 0.05;
  graded = vec3<f32>(lum) + (graded - vec3<f32>(lum)) * 0.88;
  graded *= vec3<f32>(1.05, 1.0, 0.9);
  let vd = length((q - 0.5) * vec2<f32>(1.0, 1.05));
  graded *= 1.0 - 0.38 * smoothstep(0.25, 0.78, vd);
  let mid = vec3<f32>(0.42);
  let target_col = mid + (graded - mid) * contrast;

  let base = vec3<f32>(0.44, 0.5, 0.5) + vec3<f32>(mottle * 0.04);
  var col = vec3<f32>(
    mix(base.r, target_col.r, pr),
    mix(base.g, target_col.g, pg),
    mix(base.b, target_col.b, pb)
  );
  let grain = hash(floor(q * 900.0) + vec2<f32>(seed)) - 0.5;
  col += grain * 0.025;
  return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let mm = vec2<f32>(uv.x, 1.0 - uv.y) * PRINT;
  let dev = clamp(u.live.x, 0.0, 1.0);
  let sway = u.live.y;
  let seed = u.live.z;

  let rel = mm - IMG_MIN;
  let inImg = rel.x >= 0.0 && rel.y >= 0.0 && rel.x <= IMG_SIZE && rel.y <= IMG_SIZE;
  let dEdge = min(min(rel.x, IMG_SIZE - rel.x), min(rel.y, IMG_SIZE - rel.y));

  var col = paper(mm);
  let lip = smoothstep(0.0, 0.5, -dEdge) * (1.0 - smoothstep(0.5, 1.4, -dEdge));
  col *= 1.0 - 0.035 * lip;

  if (inImg) {
    let q = rel / IMG_SIZE;
    var img = develop(q, dev, seed);
    img *= 0.8 + 0.2 * smoothstep(0.0, 0.9, dEdge);
    let sheenPos = q.x * 0.7 + q.y * 0.3 - 0.35 + sway * 0.6;
    let sheen = exp(-pow((sheenPos - 0.3) * 4.5, 2.0));
    img += vec3<f32>(0.05) * sheen;
    col = img;
  }
  return vec4<f32>(col, 1.0);
}
`;
