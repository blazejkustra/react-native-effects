import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** The color tint for the fire effect. */
  color?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Size of the sparks. Default: 1.0 */
  sparkSize?: number;
  /** Intensity of the fire. Default: 1.0 */
  fireIntensity?: number;
  /** Intensity of the smoke. Default: 1.0 */
  smokeIntensity?: number;
};

export default function Campfire({
  color = '#ffffff',
  speed = 1.0,
  sparkSize = 1.0,
  fireIntensity = 1.0,
  smokeIntensity = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(
    () => [sparkSize, fireIntensity, smokeIntensity],
    [sparkSize, fireIntensity, smokeIntensity]
  );

  return (
    <ShaderView
      fragmentShader={CAMPFIRE_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const CAMPFIRE_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn mod289_3(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_4(x: vec4<f32>) -> vec4<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec4<f32>) -> vec4<f32> {
  return mod289_4(((x * 34.0) + 1.0) * x);
}

fn taylorInvSqrt(r: vec4<f32>) -> vec4<f32> {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn snoise(v: vec3<f32>) -> f32 {
  let C = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

  var i = floor(v + dot(v, vec3<f32>(C.y, C.y, C.y)));
  let x0 = v - i + dot(i, vec3<f32>(C.x, C.x, C.x));

  let g = step(vec3<f32>(x0.y, x0.z, x0.x), x0);
  let l = 1.0 - g;
  let i1 = min(g, vec3<f32>(l.z, l.x, l.y));
  let i2 = max(g, vec3<f32>(l.z, l.x, l.y));

  let x1 = x0 - i1 + vec3<f32>(C.x, C.x, C.x);
  let x2 = x0 - i2 + vec3<f32>(C.y, C.y, C.y);
  let x3 = x0 - vec3<f32>(D.y, D.y, D.y);

  i = mod289_3(i);
  let p = permute(permute(permute(
    i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));

  let n_ = 0.142857142857;
  let ns = n_ * vec3<f32>(D.w, D.y, D.z) - vec3<f32>(D.x, D.z, D.x);

  let j = p - 49.0 * floor(p * ns.z * ns.z);

  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + vec4<f32>(ns.y, ns.y, ns.y, ns.y);
  let y = y_ * ns.x + vec4<f32>(ns.y, ns.y, ns.y, ns.y);
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4<f32>(x.x, x.y, y.x, y.y);
  let b1 = vec4<f32>(x.z, x.w, y.z, y.w);

  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4<f32>(0.0));

  let a0 = vec4<f32>(b0.x, b0.z, b0.y, b0.w) + vec4<f32>(s0.x, s0.z, s0.y, s0.w) * vec4<f32>(sh.x, sh.x, sh.y, sh.y);
  let a1 = vec4<f32>(b1.x, b1.z, b1.y, b1.w) + vec4<f32>(s1.x, s1.z, s1.y, s1.w) * vec4<f32>(sh.z, sh.z, sh.w, sh.w);

  let p0 = vec3<f32>(a0.x, a0.y, h.x);
  let p1 = vec3<f32>(a0.z, a0.w, h.y);
  let p2 = vec3<f32>(a1.x, a1.y, h.z);
  let p3 = vec3<f32>(a1.z, a1.w, h.w);

  let norm = inverseSqrt(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  let p0n = p0 * norm.x;
  let p1n = p1 * norm.y;
  let p2n = p2 * norm.z;
  let p3n = p3 * norm.w;

  var m = max(0.6 - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4<f32>(dot(p0n, x0), dot(p1n, x1), dot(p2n, x2), dot(p3n, x3)));
}

fn prng(seed: vec2<f32>) -> f32 {
  var s = fract(seed * vec2<f32>(5.3983, 5.4427));
  s = s + dot(vec2<f32>(s.y, s.x), s + vec2<f32>(21.5351, 14.3137));
  return fract(s.x * s.y * 95.4337);
}

const PI = 3.1415926535897932384626433832795;

fn noiseStack(pos: vec3<f32>, octaves: i32, falloff: f32) -> f32 {
  var noise = snoise(pos);
  var off = 1.0;
  var p = pos;

  if (octaves > 1) {
    p = p * 2.0;
    off = off * falloff;
    noise = (1.0 - off) * noise + off * snoise(p);
  }
  if (octaves > 2) {
    p = p * 2.0;
    off = off * falloff;
    noise = (1.0 - off) * noise + off * snoise(p);
  }
  if (octaves > 3) {
    p = p * 2.0;
    off = off * falloff;
    noise = (1.0 - off) * noise + off * snoise(p);
  }
  return (1.0 + noise) / 2.0;
}

fn noiseStackUV(pos: vec3<f32>, octaves: i32, falloff: f32) -> vec2<f32> {
  let displaceA = noiseStack(pos, octaves, falloff);
  let displaceB = noiseStack(pos + vec3<f32>(3984.293, 423.21, 5235.19), octaves, falloff);
  return vec2<f32>(displaceA, displaceB);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let sparkSize = u.params0.x;
  let fireIntensity = u.params0.y;
  let smokeIntensity = u.params0.z;

  let resolution = u.resolution.xy;
  let vUv = ndc * 0.5 + vec2<f32>(0.5, 0.5);
  let fragCoord = vUv * resolution;

  let xpart = fragCoord.x / resolution.x;
  let ypart = fragCoord.y / resolution.y;

  let clip = 210.0;
  let ypartClip = fragCoord.y / clip;
  let ypartClippedFalloff = clamp(2.0 - ypartClip, 0.0, 1.0);
  let ypartClipped = min(ypartClip, 1.0);
  let ypartClippedn = 1.0 - ypartClipped;

  let xfuel = 1.0 - abs(2.0 * xpart - 1.0);

  let timeSpeed = 0.5;
  let realTime = timeSpeed * time;

  let coordScaled = 0.01 * fragCoord;
  let position = vec3<f32>(coordScaled, 0.0) + vec3<f32>(1223.0, 6434.0, 8425.0);
  let flow = vec3<f32>(4.1 * (0.5 - xpart) * pow(ypartClippedn, 4.0), -2.0 * xfuel * pow(ypartClippedn, 64.0), 0.0);
  let timing = realTime * vec3<f32>(0.0, -1.7, 1.1) + flow;

  let displacePos = vec3<f32>(1.0, 0.5, 1.0) * 2.4 * position + realTime * vec3<f32>(0.01, -0.7, 1.3);
  let displace3 = vec3<f32>(noiseStackUV(displacePos, 2, 0.4), 0.0);

  let noiseCoord = (vec3<f32>(2.0, 1.0, 1.0) * position + timing + 0.4 * displace3) / 1.0;
  let noise = noiseStack(noiseCoord, 3, 0.4);

  let flames = pow(ypartClipped, 0.3 * xfuel) * pow(noise, 0.3 * xfuel);

  let f = ypartClippedFalloff * pow(1.0 - flames * flames * flames, 8.0);
  let fff = f * f * f;
  var fire = 1.5 * vec3<f32>(f, fff, fff * fff) * fireIntensity;

  let smokeNoise = 0.5 + snoise(0.4 * position + timing * vec3<f32>(1.0, 1.0, 0.2)) / 2.0;
  let smoke = vec3<f32>(0.3 * pow(xfuel, 3.0) * pow(ypart, 2.0) * (smokeNoise + 0.4 * (1.0 - noise))) * smokeIntensity;

  let sparkGridSize = 30.0;
  var sparkCoord = fragCoord - vec2<f32>(0.0, 190.0 * realTime);
  sparkCoord = sparkCoord - 30.0 * noiseStackUV(0.01 * vec3<f32>(sparkCoord, 30.0 * time), 1, 0.4);
  sparkCoord = sparkCoord + 100.0 * flow.xy;

  if (sparkCoord.y / sparkGridSize % 2.0 < 1.0) {
    sparkCoord.x = sparkCoord.x + 0.5 * sparkGridSize;
  }

  let sparkGridIndex = vec2<f32>(floor(sparkCoord / sparkGridSize));
  let sparkRandom = prng(sparkGridIndex);
  let sparkLife = min(10.0 * (1.0 - min((sparkGridIndex.y + (190.0 * realTime / sparkGridSize)) / (24.0 - 20.0 * sparkRandom), 1.0)), 1.0);

  var sparks = vec3<f32>(0.0);
  if (sparkLife > 0.0) {
    let sparkSizeScaled = xfuel * xfuel * sparkRandom * 0.08 * sparkSize;
    let sparkRadians = 999.0 * sparkRandom * 2.0 * PI + 2.0 * time;
    let sparkCircular = vec2<f32>(sin(sparkRadians), cos(sparkRadians));
    let sparkOffset = (0.5 - sparkSizeScaled) * sparkGridSize * sparkCircular;
    let sparkModulus = (sparkCoord + sparkOffset) % sparkGridSize - 0.5 * vec2<f32>(sparkGridSize);
    let sparkLength = length(sparkModulus);
    let sparksGray = max(0.0, 1.0 - sparkLength / (sparkSizeScaled * sparkGridSize));
    sparks = sparkLife * sparksGray * vec3<f32>(1.0, 0.3, 0.0);
  }

  fire = fire * u.color0.rgb;

  let finalColor = max(fire, sparks) + smoke;
  return vec4<f32>(clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0)), u.color0.a);
}
`;
