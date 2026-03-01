import type { ViewProps } from 'react-native';
import type { ColorInput } from '../../utils/colors';

export type ShaderViewProps = ViewProps & {
  /** WGSL fragment shader source (must declare the Uniforms struct) */
  fragmentShader: string;
  /** Array of colors mapped to u.color0, u.color1 (max 2). Default: [] */
  colors?: ColorInput[];
  /** Time multiplier — controls animation speed. Default: 1.0 */
  speed?: number;
  /** Up to 8 shader-specific floats mapped to u.params0.xyzw and u.params1.xyzw */
  params?: number[];
  /** Render once then stop the RAF loop. Default: false */
  isStatic?: boolean;
};
