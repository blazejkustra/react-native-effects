import type { ViewProps } from 'react-native';
import type { Synchronizable } from 'react-native-worklets';
import type { ColorInput } from '../../utils/colors';

/**
 * A 4-float synchronizable whose values are written into the dedicated `u.live`
 * uniform slot every frame. It has its own slot, so it never collides with the
 * 8 static `params` (`u.params0`/`u.params1`).
 *
 * This is the bridge for live, per-frame input (touch position, scroll
 * progress, velocity) coming from the JS thread into the off-thread render
 * loop. Create one with `useParamsSynchronizable` and update it from
 * gesture/scroll handlers. See `ShaderViewWithPanGesture`.
 */
export type ParamsSynchronizable = Synchronizable<Float64Array>;

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
  /** Use transparent background (clear to alpha 0). Default: false */
  transparent?: boolean;
  /**
   * Optional live input. Its 4 floats are written into the dedicated `u.live`
   * slot every frame — independent of the static `params`. Use for
   * touch/scroll/audio. Create it with `useParamsSynchronizable`.
   */
  paramsSynchronizable?: ParamsSynchronizable;
};
