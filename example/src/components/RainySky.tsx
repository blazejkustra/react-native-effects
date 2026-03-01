import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Rain intensity (0-2). Default: 1.0 */
  rainIntensity?: number;
  /** Sky gradient start color (bottom). Default: '#2C3E50' */
  startColor?: string;
  /** Sky gradient end color (top). Default: '#1B2838' */
  endColor?: string;
};

export default function RainySky({
  speed = 0.2,
  rainIntensity = 0.1,
  startColor = '#2C3E50',
  endColor = '#1B2838',
  ...viewProps
}: Props) {
  const params = useMemo(
    () => [rainIntensity, Math.random() * 1000],
    [rainIntensity]
  );

  const colors = useMemo(() => [startColor, endColor], [startColor, endColor]);

  return (
    <ShaderView
      fragmentShader={RAINY_SKY_SHADER}
      params={params}
      colors={colors}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const RAINY_SKY_SHADER = /* wgsl */ `
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

// Fine rain streaks using high-frequency elongated noise
fn rain(uv: vec2<f32>, time: f32, intensity: f32) -> f32 {
  var acc = 0.0;

  // Layer 1 — near rain
  let st1 = vec2<f32>(
    uv.x * 120.0 + uv.y * 8.0,
    uv.y * 18.0 + time * 3.5
  );
  let f1 = noise(st1) + noise(st1 * 1.7 + vec2<f32>(7.52, 13.23));
  let r1 = clamp(pow(f1 * 0.5, 22.0) * 60.0 * intensity, 0.0, uv.y * 0.35 + 0.05);
  acc += r1;

  // Layer 2 — mid rain
  let st2 = vec2<f32>(
    uv.x * 180.0 + uv.y * 12.0 + 50.0,
    uv.y * 25.0 + time * 2.8 + 17.0
  );
  let f2 = noise(st2) + noise(st2 * 1.5 + vec2<f32>(11.31, 5.72));
  let r2 = clamp(pow(f2 * 0.5, 22.0) * 50.0 * intensity, 0.0, uv.y * 0.35 + 0.05);
  acc += r2;

  // Layer 3 — far rain
  let st3 = vec2<f32>(
    uv.x * 260.0 + uv.y * 15.0 + 100.0,
    uv.y * 30.0 + time * 2.2 + 31.0
  );
  let f3 = noise(st3) + noise(st3 * 1.3 + vec2<f32>(3.17, 9.43));
  let r3 = clamp(pow(f3 * 0.5, 22.0) * 40.0 * intensity, 0.0, uv.y * 0.3 + 0.03);
  acc += r3;

  return acc;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let rainTime = time * 30.0; // compensate for speed=0.1 so rain moves naturally
  let intensity = u.params0.x;
  let seed = u.params0.y;

  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

  let t = (time + seed) * 5.0;

  // Sky gradient
  let skyBottom = u.color0.rgb;
  let skyTop = u.color1.rgb;
  var col = mix(skyBottom, skyTop, uv.y);

  // Cloud mask — concentrates clouds in upper ~40%
  let cloudMask = smoothstep(0.35, 0.75, uv.y);

  // Stormy coverage — denser than CloudySky
  let covFar  = 0.22;
  let covMid  = 0.20;
  let covNear = 0.18;
  let sFar  = 3.0;
  let sMid  = 4.5;
  let sNear = 6.0;

  // Densities
  let dFar  = cloudDensity(p, sFar,  t * 0.30, covFar,  0.15);
  let dMid  = cloudDensity(p, sMid,  t * 0.35, covMid,  0.15);
  let dNear = cloudDensity(p, sNear, t * 0.40, covNear, 0.15);

  // Higher opacities for thick overcast
  let oFar  = 0.7;
  let oMid  = 0.8;
  let oNear = 0.9;

  // Lighting direction
  let L = normalize(vec3<f32>(-0.6, 0.7, 0.35));
  let cloudAlbedo = vec3<f32>(0.55, 0.58, 0.65);
  let cloudShadow = vec3<f32>(0.25, 0.28, 0.35);

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

  // Rain streaks — subtle white brightness like reference
  let rainVal = rain(uv, rainTime, intensity);
  col += vec3<f32>(0.15) * rainVal;

  // Darken bottom for wet ground feel
  let groundDark = smoothstep(0.2, 0.0, uv.y) * 0.2;
  col *= (1.0 - groundDark);

  // Vignette
  let vig = smoothstep(1.2, 0.4, length(p * vec2<f32>(1.2, 1.0)));
  col *= mix(0.96, 1.0, vig);

  return vec4<f32>(col, 1.0);
}
`;
