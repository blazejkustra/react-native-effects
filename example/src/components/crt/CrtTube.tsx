import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type CrtTubeProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent'
> & {
  /** `u.live = (powerOff 0|1, seconds since the last toggle, 0, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A snapshot of a screen shown on an old CRT tube: barrel curvature,
 * scanlines, an RGB phosphor mask and a faint rolling band while on. Power
 * off squashes the picture into a white-hot horizontal line, pulls the line
 * into a dot and lets the dot's phosphor fade; power on runs it back with an
 * overshoot and a decaying degauss wobble.
 */
export default function CrtTube({
  paramsSynchronizable,
  ...rest
}: CrtTubeProps) {
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const CURVE: f32 = 0.12;
const PHOSPHOR: vec3<f32> = vec3<f32>(0.86, 0.93, 1.0);

// Picture scale (x, y), the collapsed dot's brightness and the degauss
// wobble, all as functions of the seconds since the last toggle.
struct Beam {
  scale: vec2<f32>,
  spot: f32,
  wobble: f32,
};

fn sdBox(p: vec2<f32>, b: vec2<f32>) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

fn easeIn(x: f32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  return c * c * c;
}

fn easeOut(x: f32) -> f32 {
  let c = 1.0 - clamp(x, 0.0, 1.0);
  return 1.0 - c * c * c;
}

fn powerOff(e: f32) -> Beam {
  let squash = easeIn(e / 0.24);
  let pinch = smoothstep(0.25, 0.46, e);
  var b: Beam;
  b.scale = vec2<f32>((1.0 + 0.04 * squash) * (1.0 - pinch), 1.0 - squash);
  let fade = exp(-max(e - 0.46, 0.0) / 0.2) * 0.8 + exp(-max(e - 0.46, 0.0) / 0.6) * 0.2;
  b.spot = smoothstep(0.38, 0.46, e) * fade;
  b.wobble = 0.0;
  return b;
}

fn powerOn(e: f32) -> Beam {
  let t = max(e - 0.2, 0.0);
  var b: Beam;
  b.scale = vec2<f32>(
    easeOut((e - 0.07) / 0.15),
    select(0.0, 1.0 - exp(-t * 12.0) * cos(t * 13.0), e > 0.2)
  );
  b.spot = smoothstep(0.0, 0.05, e) * (1.0 - smoothstep(0.08, 0.2, e));
  b.wobble = smoothstep(0.18, 0.28, e) * exp(-max(e - 0.26, 0.0) * 3.2);
  return b;
}

fn screen(cuv: vec2<f32>, wob: f32) -> vec3<f32> {
  let tuv = vec2<f32>(cuv.x, 1.0 - cuv.y);
  let shift = vec2<f32>(wob * 0.006, 0.0);
  let g = textureSampleLevel(tex, samp, tuv, 0.0).g;
  let r = textureSampleLevel(tex, samp, tuv + shift, 0.0).r;
  let bl = textureSampleLevel(tex, samp, tuv - shift, 0.0).b;
  return vec3<f32>(r, g, bl);
}

fn phosphorMask(px: f32) -> vec3<f32> {
  let k = floor(px % 3.0);
  return vec3<f32>(
    select(0.93, 1.1, k < 0.5),
    select(0.93, 1.1, k > 0.5 && k < 1.5),
    select(0.93, 1.1, k > 1.5)
  );
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let res = u.resolution.xy;
  let dpr = u.resolution.w;
  let e = u.live.y;
  var b: Beam;
  if (u.live.x > 0.5) {
    b = powerOff(e);
  } else {
    b = powerOn(e);
  }

  let p = (uv - 0.5) * res;
  let box = res * 0.5 * b.scale;
  let d = sdBox(p, box);
  let compress = 1.0 - clamp(b.scale.y, 0.0, 1.0);
  let lit = step(0.001, b.scale.x);

  var col = vec3<f32>(0.0);

  if (d < 0.0 && b.scale.y > 0.002) {
    var local = p / box;
    local.x = local.x + b.wobble * 0.035 * sin(local.y * 9.0 + e * 38.0);
    var c = local * 0.5;
    c = c * (1.0 + CURVE * (dot(c, c) - 0.25));
    let cuv = c + 0.5;
    let edge = smoothstep(0.0, 0.006, cuv.x) * smoothstep(1.0, 0.994, cuv.x)
      * smoothstep(0.0, 0.004, cuv.y) * smoothstep(1.0, 0.996, cuv.y);

    var img = screen(clamp(cuv, vec2<f32>(0.0), vec2<f32>(1.0)), b.wobble);
    let t = u.time.x;
    let scan = 0.94 + 0.06 * sin(cuv.y * res.y * 2.0944);
    let flick = 1.0 + 0.012 * sin(t * 9.0) * sin(t * 2.3);
    let band = 0.035 * exp(-pow((fract(cuv.y - t * 0.11) - 0.5) * 9.0, 2.0));
    let vign = 1.0 - 0.35 * dot(c, c);
    img = img * phosphorMask(uv.x * res.x) * scan * flick * vign + band;
    img = img * (1.0 + b.wobble * 0.22 * vec3<f32>(sin(e * 21.0), sin(e * 21.0 + 2.1), sin(e * 21.0 + 4.2)));

    let boost = 1.0 + 2.2 * compress * compress;
    let hot = vec3<f32>(1.0) - exp(-img * boost * 1.5);
    img = mix(img, hot, smoothstep(0.0, 0.3, compress));
    img = mix(img, PHOSPHOR * 1.4, smoothstep(0.09, 0.005, b.scale.y));
    col = img * edge;
  }

  let glowR = (6.0 + 10.0 * compress) * dpr;
  let halo = exp(-max(d, 0.0) / glowR) * compress * compress * 0.75;
  let core = (1.0 - smoothstep(0.0, 1.4 * dpr, d)) * smoothstep(0.6, 1.0, compress);
  col = col + PHOSPHOR * (halo + core * 1.3) * lit;

  let rr = length(p) / dpr;
  col = col + PHOSPHOR * b.spot * (1.7 * exp(-rr * rr / 14.0) + 0.45 * exp(-rr / 12.0));

  return vec4<f32>(min(col, vec3<f32>(1.0)), 1.0);
}
`;
