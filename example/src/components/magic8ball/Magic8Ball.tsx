import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * `[centerX, centerY, radius, revealRadius, revealY, 0, 0, 0]`. The centre
   * is in screen uv (y-up) and `radius` is a fraction of the screen HEIGHT;
   * `revealRadius` and `revealY` are in orb radii.
   */
  params: number[];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A clear glass orb full of pale mist, resting on a brass stand. Shaking stirs
 * the mist shut. Once it settles, a clearing opens along whichever way is
 * really up and the answer, a React Native `Text` laid over the shader, shows
 * through it.
 */
export default function Magic8Ball({
  params,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={MIST_ORB_SHADER}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const MIST_ORB_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

// Must match SUBMERGED_DEPTH in useMagic8BallPhysics.
const SUBMERGED_DEPTH: f32 = 1.2;
const KEY: vec3<f32> = vec3<f32>(-0.56, 0.72, 0.41);

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
  var amp = 0.5;
  var acc = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    acc = acc + amp * vnoise(p);
    p = p * 2.03 + vec2<f32>(3.1, 1.7);
    amp = amp * 0.5;
  }
  return acc;
}

fn rotate(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn backdrop(p: vec2<f32>) -> vec3<f32> {
  let pool = exp(-dot(p - vec2<f32>(0.0, 0.5), p - vec2<f32>(0.0, 0.5)) / 7.0);
  return mix(vec3<f32>(0.008, 0.014, 0.016), vec3<f32>(0.060, 0.115, 0.120), pool);
}

// A paned window high on the left and a dim fill on the right: all the glass
// ever reflects, so every highlight on the orb agrees.
fn room(d: vec3<f32>) -> vec3<f32> {
  var c = mix(vec3<f32>(0.01, 0.015, 0.018), vec3<f32>(0.10, 0.15, 0.16),
              smoothstep(-0.6, 0.9, d.y));
  let k = normalize(KEY);
  let tx = normalize(cross(k, vec3<f32>(0.0, 1.0, 0.0)));
  let ty = cross(tx, k);
  let facing = dot(d, k);
  if (facing > 0.0) {
    let w = vec2<f32>(dot(d, tx), dot(d, ty));
    let frame = 1.0 - smoothstep(0.0, 0.02, max(abs(w.x) - 0.15, abs(w.y) - 0.21));
    let mullion = smoothstep(0.004, 0.012, abs(w.x))
                * smoothstep(0.004, 0.012, abs(w.y));
    c = c + vec3<f32>(1.0, 0.97, 0.9) * frame * mullion * 9.0;
  }
  let fill = max(dot(d, normalize(vec3<f32>(0.8, -0.2, 0.55))), 0.0);
  return c + vec3<f32>(0.3, 0.42, 0.42) * fill * fill * fill * 0.5;
}

fn fresnel(cosine: f32) -> f32 {
  let m = clamp(1.0 - cosine, 0.0, 1.0);
  return 0.04 + 0.96 * m * m * m * m * m;
}

fn roundBox(p: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
  let d = abs(p) - half + r;
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

fn brass(x: f32, y: f32) -> vec3<f32> {
  let sheen = pow(max(cos(x * 2.6 + 0.7), 0.0), 3.0);
  let shade = mix(vec3<f32>(0.10, 0.065, 0.025), vec3<f32>(0.62, 0.45, 0.19), sheen);
  return shade * (0.7 + 0.5 * smoothstep(-0.12, 0.12, y));
}

fn drawStand(col0: vec3<f32>, p: vec2<f32>, e: f32) -> vec3<f32> {
  var col = col0;
  let footP = p - vec2<f32>(0.0, -1.1);
  let foot = roundBox(footP, vec2<f32>(0.5, 0.07), 0.05);
  col = mix(col, brass(footP.x, footP.y), 1.0 - smoothstep(-e, e, foot));
  let collarP = p - vec2<f32>(0.0, -0.96);
  let collar = roundBox(collarP, vec2<f32>(0.36, 0.12), 0.04);
  return mix(col, brass(collarP.x, collarP.y) * 0.85, 1.0 - smoothstep(-e, e, collar));
}

fn mistField(q: vec2<f32>, t: f32, churn: f32) -> f32 {
  let w = vec2<f32>(fbm(q * 1.5 + vec2<f32>(1.7, t * 0.05)),
                    fbm(q * 1.5 + vec2<f32>(t * 0.04, 9.2))) - 0.5;
  return fbm(q * 2.1 + w * (1.2 + 2.2 * churn));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let rad = max(u.params0.z, 0.001);
  let p = vec2<f32>((uv.x - u.params0.x) * aspect, uv.y - u.params0.y) / rad;
  let r = length(p);
  let e = 1.5 / (u.resolution.y * rad);
  let t = u.time.x;

  let tilt = u.live.x;
  let churn = clamp(u.live.y, 0.0, 1.0);
  let rise = clamp(u.live.z, 0.0, 1.0);
  let swirl = u.live.w;
  let sway = u.liveData[0].x;

  var col = backdrop(p);
  let shadow = exp(-pow(p.x / 1.5, 2.0) - pow((p.y + 1.2) / 0.16, 2.0));
  col = col * (1.0 - 0.8 * shadow);
  col = drawStand(col, p, e);

  let mask = 1.0 - smoothstep(-e, e, r - 1.0);
  if (mask > 0.001) {
    let rc = min(r, 1.0);
    let nz = sqrt(max(1.0 - rc * rc, 0.0));
    let n = normalize(vec3<f32>(p, max(nz, 0.02)));

    // Glass magnifies toward the rim, so the mist bulges with the orb.
    let lens = p * (1.0 + 0.35 * (1.0 - nz));
    let q = rotate(lens, (swirl * 0.14 + t * 0.03) * (1.4 - rc));
    let plume = mistField(q, t, churn);
    let wisps = fbm(q * 4.6 + vec2<f32>(plume * 3.0, t * 0.03));

    // The clearing rises along world up and carries the answer with it.
    let revealR = max(u.params0.w, 0.001);
    let up = vec2<f32>(-sin(tilt), cos(tilt));
    let across = vec2<f32>(-up.y, up.x);
    let center = vec2<f32>(0.0, u.params1.x)
               + (up * -SUBMERGED_DEPTH * (1.0 - rise) + across * sway * 0.1) * revealR;
    let opening = smoothstep(0.3, 1.0, rise) * (1.0 - churn);
    let holeR = revealR * 1.12 * opening;
    let holeEdge = length(p - center) + (wisps - 0.5) * 0.5;
    let clearing = (1.0 - smoothstep(holeR - 0.26, holeR + 0.08, holeEdge)) * opening;

    let density = clamp(0.5 + smoothstep(0.26, 0.62, plume) * 0.5, 0.0, 1.0);
    let lit = clamp(0.48 + dot(q, KEY.xy) * 0.42 + (plume - 0.45) * 0.9, 0.0, 1.0);
    let mist = mix(vec3<f32>(0.20, 0.31, 0.33), vec3<f32>(0.88, 0.93, 0.90), lit * lit)
             * (0.92 + 0.16 * wisps);

    let hollow = backdrop(-p * 1.4) * 0.8 + vec3<f32>(0.012, 0.03, 0.034);
    let glow = exp(-dot(p - center, p - center) / (0.34 + revealR * 0.5));
    let core = hollow + vec3<f32>(0.40, 0.33, 0.14) * glow * opening * 0.5;
    var body = mix(core, mist, density * (1.0 - clearing));

    body = body * mix(1.0, 0.55, smoothstep(0.72, 1.0, rc));
    let caustic = exp(-pow((rc - 0.86) / 0.08, 2.0)) * smoothstep(-0.2, -0.9, n.y);
    body = body + vec3<f32>(0.75, 0.82, 0.72) * caustic * 0.32;

    let reflected = 2.0 * n.z * n - vec3<f32>(0.0, 0.0, 1.0);
    body = body + room(reflected) * (fresnel(n.z) + 0.05);
    col = mix(col, body, mask);
  }

  let dither = (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);
  return vec4<f32>(clamp(col + vec3<f32>(dither), vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
