import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

export const CARD_RADIUS = 14;

type CardSurfaceProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable'
> & {
  /** `u.live = (tiltX -1..1, tiltY -1..1, glint 0..1, lift 0..1)`. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The face of a brushed black titanium card.
 *
 * Near-black metal brushed along its length, so the light on it is a crisp
 * anisotropic streak across the grain that slides with tilt, broken into
 * lines by the brushing. Only at steep angles does a faint thin-film tint
 * creep into the streak. A thin bright bevel runs round the edge. `glint`
 * runs a sharp band of light diagonally across once, the way the card catches
 * the light when Wallet lifts it.
 */
export default function CardSurface({
  paramsSynchronizable,
  ...rest
}: CardSurfaceProps) {
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

const CORNER_RADIUS = ${CARD_RADIUS}.0;

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
  for (var i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    p = p * 2.02 + vec2<f32>(5.3, 1.7);
    amp *= 0.5;
  }
  return s;
}

fn brushing(uv: vec2<f32>, px: vec2<f32>) -> f32 {
  let row = uv.y * px.y;
  let fine = hash(vec2<f32>(floor(row), 1.0));
  let streaks = vnoise(vec2<f32>(uv.x * 3.0, row * 0.35)) * 0.6 + vnoise(vec2<f32>(uv.x * 9.0, row * 0.9)) * 0.4;
  return fine * 0.45 + streaks * 0.55;
}

fn cornerDistance(uv: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
  let q = abs((uv - 0.5) * size) - (size * 0.5 - vec2<f32>(radius));
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  let p = (uv - 0.5) * vec2<f32>(aspect, 1.0);
  let tilt = clamp(u.live.xy, vec2<f32>(-1.0), vec2<f32>(1.0));
  let glint = u.live.z;
  let lift = u.live.w;

  let brush = brushing(uv, u.resolution.xy);
  let cloud = fbm(p * 2.2 + vec2<f32>(4.0, 1.0));
  var col = vec3<f32>(0.055, 0.058, 0.064) * (0.9 + 0.25 * cloud);
  col *= 0.86 + 0.28 * brush;
  col = mix(col, col * 1.35, smoothstep(-0.5, 0.5, p.y) * 0.4);

  let sx = 0.35 - tilt.x * 0.95;
  let sd = p.x - sx + p.y * 0.32 + tilt.y * 0.2;
  let core = exp(-sd * sd * 140.0);
  let wide = exp(-sd * sd * 9.0);
  let lines = 0.55 + 0.9 * brush;
  var spec = (core * 0.42 + wide * 0.1) * lines;

  let graze = smoothstep(0.35, 1.0, length(tilt));
  let film = 0.5 + 0.5 * cos(6.2832 * (vec3<f32>(0.0, 0.33, 0.67) + sd * 1.6 + tilt.x * 0.5 + 0.55));
  let tint = mix(vec3<f32>(1.0), film, 0.06 + 0.4 * graze);
  col += tint * spec * vec3<f32>(0.95, 0.97, 1.0);
  col += film * wide * graze * 0.05;

  let g = mix(-1.5, 1.5, glint);
  let gd = (p.x * 0.8 + p.y * 0.6) - g;
  let sweep = exp(-gd * gd * 260.0) * 0.5 + exp(-gd * gd * 16.0) * 0.08;
  col += vec3<f32>(sweep * sin(3.14159 * clamp(glint, 0.0, 1.0))) * lines;

  let edge = cornerDistance(uv, u.resolution.xy, CORNER_RADIUS * u.resolution.w);
  let coverage = clamp(0.5 - edge, 0.0, 1.0);
  let rim = 1.0 - smoothstep(0.0, 2.5 * u.resolution.w, -edge);
  col += vec3<f32>(0.22) * rim * (0.35 + 0.65 * uv.y + spec);
  col *= 1.0 + 0.05 * lift;
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)) * coverage, coverage);
}
`;
