/** 96 bytes = 6 × vec4<f32> */
export const UNIFORM_BUFFER_SIZE = 96;

/** Number of float32 values in the uniform buffer */
export const UNIFORM_FLOAT_COUNT = UNIFORM_BUFFER_SIZE / 4; // 24

export const UNIFORMS_WGSL = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (seconds, dt, 0, 0)
  color0:     vec4<f32>,  // colors[0] RGBA
  color1:     vec4<f32>,  // colors[1] RGBA
  params0:    vec4<f32>,  // params[0..3]
  params1:    vec4<f32>,  // params[4..7]
};
@group(0) @binding(0) var<uniform> u: Uniforms;
`;
