import type { ImageSourcePropType } from 'react-native';
import type { ShaderViewProps } from '../ShaderView/types';

export type ShaderImageViewProps = ShaderViewProps & {
  /**
   * The image handed to the shader as a sampled texture.
   *
   * Accepts anything React Native's `Image` accepts — a `require()`d asset, a
   * `{ uri }` object, or a bare URI string. The bytes are fetched once,
   * decoded, and uploaded to a `rgba8unorm` texture; changing the prop uploads
   * a new one and restarts the render loop.
   *
   * The shader must declare the matching bindings (see
   * {@link SHADER_IMAGE_BINDINGS_WGSL}) — `ShaderImageView` binds a sampler at
   * `@binding(1)` and the texture at `@binding(2)` alongside the usual uniform
   * block at `@binding(0)`.
   */
  image: ImageSourcePropType;
  /**
   * Called once the texture has been uploaded and the shader is drawing it,
   * with the image's pixel dimensions. Useful for sizing the view to the
   * image's aspect ratio.
   */
  onImageLoad?: (size: { width: number; height: number }) => void;
  /**
   * Called if the image could not be fetched or decoded. The view keeps
   * rendering nothing rather than crashing.
   */
  onImageError?: (error: unknown) => void;
};

/**
 * The texture bindings `ShaderImageView` provides on top of the uniform block.
 * Paste these into your shader (after the `Uniforms` struct) to sample the
 * image:
 *
 * ```wgsl
 * let texel = textureSampleLevel(image, imageSampler, uv, 0.0);
 * ```
 *
 * Use `textureSampleLevel` rather than `textureSample`: the sticker-style
 * shaders this is built for sample inside non-uniform control flow, where
 * implicit-derivative sampling is invalid in WGSL.
 *
 * `textureDimensions(image)` gives the source pixel size, so a shader can
 * derive the image's aspect ratio without spending a uniform slot on it.
 */
export const SHADER_IMAGE_BINDINGS_WGSL = /* wgsl */ `
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var image: texture_2d<f32>;
`;
