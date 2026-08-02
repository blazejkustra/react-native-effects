/**
 * Extra live-data region after `live`: vec4s for paramsSynchronizable channels
 * longer than 4 floats (touch trails, multi-touch, audio spectra).
 */
export const LIVE_DATA_VEC4_COUNT = 96;

/** 1648 bytes = (7 + 96) × vec4<f32> */
export const UNIFORM_BUFFER_SIZE = (7 + LIVE_DATA_VEC4_COUNT) * 16;

/** Number of float32 values in the uniform buffer */
export const UNIFORM_FLOAT_COUNT = UNIFORM_BUFFER_SIZE / 4;

/** Max floats a paramsSynchronizable channel can carry (`live` + `liveData`). */
export const LIVE_FLOAT_COUNT = 4 + LIVE_DATA_VEC4_COUNT * 4;

export const UNIFORMS_WGSL = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (seconds, dt, 0, 0)
  color0:     vec4<f32>,  // colors[0] RGBA
  color1:     vec4<f32>,  // colors[1] RGBA
  params0:    vec4<f32>,  // params[0..3]
  params1:    vec4<f32>,  // params[4..7]
  live:       vec4<f32>,  // paramsSynchronizable[0..3]; (0,0,0,0) when unused
  liveData:   array<vec4<f32>, 96>,  // paramsSynchronizable[4..387] for long channels
};
@group(0) @binding(0) var<uniform> u: Uniforms;
`;
