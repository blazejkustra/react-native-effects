import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** The base color for the silk effect. */
  color?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Scale of the pattern. Default: 1.0 */
  scale?: number;
  /** Rotation angle in radians. Default: 0.0 */
  rotation?: number;
  /** Intensity of the noise grain. Default: 1.5 */
  noiseIntensity?: number;
};

export default function Silk({
  color = '#7B7481',
  speed = 1.0,
  scale = 1.0,
  rotation = 0.0,
  noiseIntensity = 1.5,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(
    () => [scale, rotation, noiseIntensity],
    [scale, rotation, noiseIntensity]
  );

  return (
    <ShaderView
      fragmentShader={SILK_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const SILK_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const e = 2.71828182845904523536;

fn noise(texCoord: vec2<f32>) -> f32 {
  let G = e;
  let r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

fn rotateUvs(uv: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  let rot = mat2x2<f32>(c, -s, s, c);
  return rot * uv;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let scale = u.params0.x;
  let rotation = u.params0.y;
  let noiseIntensity = u.params0.z;

  let resolution2D = u.resolution.xy;
  let vUv = ndc * 0.5 + vec2<f32>(0.5, 0.5);
  let fragCoord = vUv * resolution2D;

  let rnd = noise(fragCoord);
  let uv = rotateUvs(vUv * scale, rotation);
  var tex = uv * scale;
  let tOffset = time;

  tex.y = tex.y + 0.03 * sin(8.0 * tex.x - tOffset);

  let pattern = 0.6 +
                0.4 * sin(5.0 * (tex.x + tex.y +
                                 cos(3.0 * tex.x + 5.0 * tex.y) +
                                 0.02 * tOffset) +
                         sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  var col = u.color0 * vec4<f32>(pattern, pattern, pattern, 1.0) -
            vec4<f32>(rnd / 15.0 * noiseIntensity, rnd / 15.0 * noiseIntensity,
                     rnd / 15.0 * noiseIntensity, 0.0);
  col.a = u.color0.a;

  return clamp(col, vec4<f32>(0.0), vec4<f32>(1.0));
}
`;
