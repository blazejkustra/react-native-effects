import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';
import { ISLAND_UV } from './NameDropWave';

type PosterRevealProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'params'
> & {
  /** `u.live.x` = seconds since the phones touched. */
  paramsSynchronizable: ParamsSynchronizable;
  /** A full-screen snapshot of the contact poster. */
  snapshotUri: string;
};

/**
 * The contact poster arriving: a blurred, glowing card swells out of the
 * Dynamic Island, comes into focus just inside the screen edges, then grows
 * to fill the display.
 */
export default function PosterReveal({
  paramsSynchronizable,
  snapshotUri,
  ...rest
}: PosterRevealProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[ISLAND_UV.x, ISLAND_UV.y, ISLAND_UV.w, ISLAND_UV.h]}
      texture={{ uri: snapshotUri }}
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const TAPS: i32 = 40;

fn ease(x: f32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  return 1.0 - (1.0 - c) * (1.0 - c) * (1.0 - c);
}

fn rounded(p: vec2<f32>, halfSize: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - halfSize + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn poster(uv: vec2<f32>) -> vec3<f32> {
  let c = clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999));
  return textureSampleLevel(tex, samp, c, 0.0).rgb;
}

fn defocus(uv: vec2<f32>, radius: vec2<f32>, spin: f32) -> vec3<f32> {
  if (radius.x < 0.0005) {
    return poster(uv);
  }
  var c = vec3<f32>(0.0);
  for (var i = 0; i < TAPS; i++) {
    let f = f32(i) + 0.5;
    let r = sqrt(f / f32(TAPS));
    let a = f * 2.39996 + spin;
    c += poster(uv + vec2<f32>(cos(a), sin(a)) * r * radius);
  }
  return c / f32(TAPS);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let res = u.resolution.xy / u.resolution.w;
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let pt = uv * res;
  let t = u.live.x;

  let island = u.params0.xy * res;
  let islandSize = u.params0.zw * res;

  let rise = ease((t - 1.48) / 0.16);
  let grow = 0.62 * rise + 0.38 * smoothstep(1.66, 2.05, t);
  let cardMin = mix(island - islandSize * 0.5, vec2<f32>(0.0), grow);
  let cardMax = mix(island + islandSize * 0.5, res, grow);
  let ext = (cardMax - cardMin) * 0.5;
  let center = (cardMin + cardMax) * 0.5;
  let radius = mix(islandSize.y * 0.5, 56.0, rise);
  let sd = rounded(pt - center, ext, min(radius, min(ext.x, ext.y)));
  let edge = 0.8 + 26.0 * (1.0 - smoothstep(1.55, 1.7, t));
  let coverage = (1.0 - smoothstep(-edge, edge, sd)) * step(0.001, grow);

  if (coverage <= 0.0) {
    return vec4<f32>(0.0);
  }

  let local = (pt - cardMin) / max(cardMax - cardMin, vec2<f32>(1.0));
  let focus = 1.0 - smoothstep(1.62, 1.85, t);
  let blurPt = 30.0 * focus;
  let spin = fract(52.9829 * fract(dot(pt * u.resolution.w, vec2<f32>(0.06711, 0.00584)))) * 6.2832;
  var col = defocus(local, vec2<f32>(blurPt) / res, spin);
  col = mix(col, vec3<f32>(0.93, 0.92, 0.97), focus * 0.35);

  let a = coverage;
  return vec4<f32>(col * a, a);
}
`;
