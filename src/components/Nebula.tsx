import { useEffect, useMemo, useState } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** Core color of the nebula clouds. */
  color?: ColorInput;
  /** Color of the glowing dust around the core. */
  dustColor?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Brightness of the clouds. Default: 1.0 */
  intensity?: number;
  /** Number of fbm octaves sampled per pixel. Default: 5 */
  fbmOctaves?: number;
  /** Scale applied to the noise UVs before sampling. Default: 2.0 */
  uvScale?: number;
};

export default function Nebula({
  color = '#a855f7',
  dustColor = '#38bdf8',
  speed = 1.0,
  intensity = 1.0,
  fbmOctaves = 5,
  uvScale = 2.0,
  ...viewProps
}: Props) {
  // Slowly swirl the clouds.
  const [swirl, setSwirl] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSwirl((s) => s + 0.016 * speed), 16);
    return () => clearInterval(id);
  }, [speed]);

  const colors = useMemo(() => [color, dustColor], [color, dustColor]);
  const params = useMemo(
    () => [intensity, fbmOctaves, uvScale, swirl],
    [intensity, fbmOctaves, uvScale, swirl]
  );

  return (
    <ShaderView
      fragmentShader={NEBULA_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const NEBULA_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2<f32>(1.0, 0.0)), s.x),
    mix(hash(i + vec2<f32>(0.0, 1.0)), hash(i + vec2<f32>(1.0, 1.0)), s.x),
    s.y
  );
}

// Fractional Brownian motion with a user-controlled number of octaves.
fn fbm(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  var value = 0.0;
  var amplitude = 0.5;
  for (var i = 0; i < i32(u.params0.y); i++) {
    value += amplitude * noise(p);
    p = p * 2.0 + vec2<f32>(1.3, 7.1);
    amplitude *= 0.5;
  }
  return value;
}

// Sparkling dust: four fixed layers of small stars.
fn dust(uv: vec2<f32>) -> f32 {
  var sparkle = 0.0;
  for (var layer = 0; layer < 4; layer++) {
    let cell = floor(uv * (20.0 + f32(layer) * 13.0));
    let h = hash(cell + f32(layer));
    sparkle += step(0.985, h) * (0.5 + 0.5 * sin(u.time.x * 3.0 + h * 40.0));
  }
  return sparkle;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let swirl = u.params0.w;
  let q = uv * u.params0.z + vec2<f32>(swirl * 0.1, -swirl * 0.05);
  let clouds = fbm(q + fbm(q + swirl * 0.2));
  let core = mix(u.color1.rgb, u.color0.rgb, clouds) * clouds * u.params0.x;
  let color = core + vec3<f32>(dust(uv)) * u.color1.rgb;
  return vec4<f32>(color, 1.0);
}
`;
