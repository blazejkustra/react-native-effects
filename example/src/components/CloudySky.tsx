import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
};

export default function CloudySky({ speed = 0.1, ...viewProps }: Props) {
  const params = useMemo(() => [Math.random() * 1000], []);

  return (
    <ShaderView
      fragmentShader={CLOUDY_SKY_SHADER}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const CLOUDY_SKY_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash(p_in: vec2<f32>) -> f32 {
  var p = fract(p_in * vec2<f32>(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  // Quintic fade
  let u2 = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = hash(i + vec2<f32>(0.0, 0.0));
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u2.x), mix(c, d, u2.x), u2.y);
}

fn fbm(p_in: vec2<f32>) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p_in;
  for (var i = 0; i < 6; i++) {
    s += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return s;
}

fn flow(p: vec2<f32>, t: f32) -> vec2<f32> {
  let e = 0.035;
  let n1 = fbm(p * 0.6 + vec2<f32>(0.0, t * 0.035));
  let n2 = fbm(p * 0.6 + vec2<f32>(t * 0.035, 0.0));
  return vec2<f32>(
    n1 - fbm(p + vec2<f32>(e, 0.0)),
    n2 - fbm(p + vec2<f32>(0.0, e))
  );
}

fn skyColor(uv: vec2<f32>) -> vec3<f32> {
  let top    = vec3<f32>(0.416, 0.455, 0.506);
  let middle = vec3<f32>(0.37, 0.41, 0.46);
  let bottom = vec3<f32>(0.329, 0.373, 0.420);
  let g = smoothstep(0.0, 1.0, uv.y);
  let midmix = mix(middle, bottom, smoothstep(0.35, 1.0, 1.0 - uv.y));
  return mix(top, midmix, 1.0 - g);
}

fn cloudDensity(uv: vec2<f32>, scale: f32, t: f32, coverage: f32, softness: f32) -> f32 {
  let wind = vec2<f32>(0.25, 0.02);
  var p = uv * scale + wind * t;
  let w = flow(p * 0.35, t) * 0.8;
  p += w;
  let n = fbm(p);
  return smoothstep(coverage, coverage + softness, n);
}

fn densityGrad(p: vec2<f32>, s: f32, t: f32) -> vec2<f32> {
  let e = 1.5 / s;
  let c = cloudDensity(p, s, t, 0.5, 0.2);
  let cx = cloudDensity(p + vec2<f32>(e, 0.0), s, t, 0.5, 0.2) - c;
  let cy = cloudDensity(p + vec2<f32>(0.0, e), s, t, 0.5, 0.2) - c;
  return vec2<f32>(cx, cy);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

  let seed = u.params0.x;
  let t = (u.time.x + seed) * 5.0;

  // Base sky
  var col = skyColor(uv);

  // Clouds only at the top — fade out above the sections area
  let cloudMask = smoothstep(0.55, 0.85, uv.y);

  // Coverage and scale params — higher scale = smaller features, lower coverage = more clouds
  let covFar  = 0.30;
  let covMid  = 0.28;
  let covNear = 0.26;
  let sFar  = 3.0;
  let sMid  = 4.5;
  let sNear = 6.0;

  // Densities
  let dFar  = cloudDensity(p, sFar,  t * 0.30, covFar,  0.15);
  let dMid  = cloudDensity(p, sMid,  t * 0.35, covMid,  0.15);
  let dNear = cloudDensity(p, sNear, t * 0.40, covNear, 0.15);

  // Layer opacities
  let oFar  = 0.6;
  let oMid  = 0.7;
  let oNear = 0.8;

  // Lighting direction
  let L = normalize(vec3<f32>(-0.6, 0.7, 0.35));
  let cloudAlbedo = vec3<f32>(0.82, 0.84, 0.87);
  let cloudShadow = vec3<f32>(0.45, 0.48, 0.53);

  // FAR layer
  let gF = densityGrad(p, sFar, t * 0.30);
  let ndlF = clamp(0.5 + 0.5 * dot(normalize(vec3<f32>(-gF.x, -gF.y, 1.0)), L), 0.0, 1.0);
  let cF = mix(cloudShadow, cloudAlbedo, ndlF);
  col = mix(col, cF, dFar * oFar * cloudMask);

  // MID layer
  let gM = densityGrad(p, sMid, t * 0.35);
  let ndlM = clamp(0.45 + 0.55 * dot(normalize(vec3<f32>(-gM.x, -gM.y, 1.0)), L), 0.0, 1.0);
  let cM = mix(cloudShadow * 0.96, cloudAlbedo, ndlM);
  col = mix(col, cM, dMid * oMid * cloudMask);

  // NEAR layer with rim lighting
  let gN = densityGrad(p, sNear, t * 0.40);
  let nrmN = normalize(vec3<f32>(-gN.x, -gN.y, 1.0));
  let ndlN = clamp(0.42 + 0.58 * dot(nrmN, L), 0.0, 1.0);
  let rim = pow(1.0 - clamp(dot(nrmN, L), 0.0, 1.0), 2.0);
  let cN = mix(cloudShadow * 0.92, cloudAlbedo, ndlN) + rim * 0.05;
  col = mix(col, cN, dNear * oNear * cloudMask);

  // Vignette
  let vig = smoothstep(1.2, 0.4, length(p * vec2<f32>(1.2, 1.0)));
  col *= mix(0.96, 1.0, vig);

  return vec4<f32>(col, 1.0);
}
`;
