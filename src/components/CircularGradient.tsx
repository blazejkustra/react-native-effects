import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** The color at the center of the gradient. */
  centerColor: ColorInput;
  /** The color at the edge of the gradient. Default: transparent */
  edgeColor?: ColorInput;
  /** Horizontal center position (0-1). Default: 0.5 */
  centerX?: number;
  /** Vertical center position (0-1). Default: 0.5 */
  centerY?: number;
  /** Horizontal radius. Default: 0.5 */
  sizeX?: number;
  /** Vertical radius. Default: 0.5 */
  sizeY?: number;
};

export default function CircularGradient({
  centerColor,
  edgeColor = 'rgba(0,0,0,0)',
  centerX = 0.5,
  centerY = 0.5,
  sizeX = 0.5,
  sizeY = 0.5,
  ...viewProps
}: Props) {
  const colors = useMemo(
    () => [centerColor, edgeColor],
    [centerColor, edgeColor]
  );
  const params = useMemo(
    () => [centerX, centerY, sizeX, sizeY],
    [centerX, centerY, sizeX, sizeY]
  );

  return (
    <ShaderView
      fragmentShader={CIRCULAR_GRADIENT_SHADER}
      colors={colors}
      params={params}
      isStatic={true}
      {...viewProps}
    />
  );
}

const CIRCULAR_GRADIENT_SHADER = /* wgsl */ `
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
  let uv = (ndc * 0.5) + vec2<f32>(0.5, 0.5);

  let center = u.params0.xy;
  let size = u.params0.zw;

  let diff = uv - center;
  let normalizedDiff = diff / size;
  let dist = length(normalizedDiff);

  let t = smoothstep(0.0, 1.0, dist);
  let color = mix(u.color0, u.color1, t);
  return color;
}
`;
