import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from '../utils/colors';
import ShaderView from './ShaderView';

type Props = ViewProps & {
  /** The base color for the liquid chrome effect. */
  color?: ColorInput;
  /** Animation speed multiplier. Default: 0.2 */
  speed?: number;
  /** Amplitude of the distortion. Default: 0.3 */
  amplitude?: number;
  /** Horizontal frequency. Default: 3 */
  frequencyX?: number;
  /** Vertical frequency. Default: 3 */
  frequencyY?: number;
};

export default function LiquidChrome({
  color = '#1a1a1a',
  speed = 0.2,
  amplitude = 0.3,
  frequencyX = 3,
  frequencyY = 3,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(
    () => [amplitude, frequencyX, frequencyY],
    [amplitude, frequencyX, frequencyY]
  );

  return (
    <ShaderView
      fragmentShader={LIQUID_CHROME_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const LIQUID_CHROME_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn renderImage(uvCoord: vec2<f32>) -> vec4<f32> {
  let resolution2D = u.resolution.xy;
  let time = u.time.x;
  let amplitude = u.params0.x;
  let frequencyX = u.params0.y;
  let frequencyY = u.params0.z;

  let fragCoord = uvCoord * resolution2D;
  var uv = (2.0 * fragCoord - resolution2D) / min(u.resolution.x, u.resolution.y);

  for (var i: f32 = 1.0; i < 10.0; i = i + 1.0) {
    uv.x = uv.x + amplitude / i * cos(i * frequencyX * uv.y + time);
    uv.y = uv.y + amplitude / i * cos(i * frequencyY * uv.x + time);
  }

  let baseColor = u.color0;
  let color = baseColor.rgb / abs(sin(time - uv.y - uv.x));
  return vec4<f32>(color, baseColor.a);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let vUv = ndc * 0.5 + vec2<f32>(0.5, 0.5);
  let resolution2D = u.resolution.xy;

  var col = vec4<f32>(0.0);
  var samples = 0;

  for (var i: i32 = -1; i <= 1; i = i + 1) {
    for (var j: i32 = -1; j <= 1; j = j + 1) {
      let offset = vec2<f32>(f32(i), f32(j)) * (1.0 / min(resolution2D.x, resolution2D.y));
      col = col + renderImage(vUv + offset);
      samples = samples + 1;
    }
  }

  return col / f32(samples);
}
`;
