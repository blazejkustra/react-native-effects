import type { ImageSourcePropType, ViewProps } from 'react-native';
import type { Synchronizable } from 'react-native-worklets';
import type { ColorInput } from '../../utils/colors';

/**
 * A float-array synchronizable whose values are written into the dedicated
 * `u.live` (+ `u.liveData` for channels longer than 4 floats) uniform slots
 * every frame. It has its own region, so it never collides with the 8 static
 * `params` (`u.params0`/`u.params1`).
 *
 * This is the bridge for live, per-frame input (touch position, scroll
 * progress, velocity, touch trails) coming from the JS thread into the
 * off-thread render loop. Create one with `useParamsSynchronizable` and update
 * it from gesture/scroll handlers. See `ShaderViewWithPanGesture`.
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
   * Optional live input. Its floats are written into the dedicated `u.live`
   * slot (and `u.liveData` for channels longer than 4 floats) every frame —
   * independent of the static `params`. Use for touch/scroll/audio/trails.
   * Create it with `useParamsSynchronizable`.
   */
  paramsSynchronizable?: ParamsSynchronizable;
  /**
   * Optional image sampled by the shader (a `require('./photo.jpg')` or
   * `{ uri }`). It is decoded once, uploaded to the GPU and bound as
   * `@group(0) @binding(1) var samp: sampler;` and
   * `@group(0) @binding(2) var tex: texture_2d<f32>;` — declare both in the
   * shader when passing this, and neither when not. The sampler is linear
   * with mirror-repeat wrapping; sample with `textureSampleLevel(tex, samp,
   * uv, 0.0)` (no mipmaps). Rendering waits for the image to load.
   */
  texture?: ImageSourcePropType;
};
