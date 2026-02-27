import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** The color of the start of the gradient. */
  startColor: ColorInput;
  /** The color of the end of the gradient. */
  endColor: ColorInput;
  /** The angle of the gradient in degrees (0-360). */
  angle: number;
  /** Rotation speed in degrees/second. 0 = static. Default: 0 */
  speed?: number;
};

export default function LinearGradient({
  startColor,
  endColor,
  angle,
  speed = 0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [startColor, endColor], [startColor, endColor]);
  const params = useMemo(() => [angle, speed], [angle, speed]);

  return (
    <ShaderView
      fragmentShader={LINEAR_GRADIENT_SHADER}
      colors={colors}
      params={params}
      speed={speed === 0 ? 0 : 1}
      isStatic={speed === 0}
      {...viewProps}
    />
  );
}

const LINEAR_GRADIENT_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + vec2<f32>(0.5, 0.5);
  let baseAngle = u.params0.x;
  let rotationSpeed = u.params0.y;
  let angle = (baseAngle + u.time.x * rotationSpeed) * 3.14159265359 / 180.0;
  let dir = vec2<f32>(cos(angle), sin(angle));
  let fromCenter = uv - vec2<f32>(0.5, 0.5);
  let corrected = vec2<f32>(fromCenter.x * u.resolution.z, fromCenter.y);
  let t = clamp(dot(corrected, dir) + 0.5, 0.0, 1.0);
  return mix(u.color0, u.color1, t);
}
`;
