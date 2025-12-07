export const GLITTER_SHADER = /* wgsl */ `
struct GlitterParams {
  resolution: vec4<f32>,
  time_vec: vec4<f32>,
  controls: vec4<f32>,  // (scale, speed, intensity, density)
  colorA: vec4<f32>,
  colorB: vec4<f32>,
}

@group(0) @binding(0) var<uniform> params: GlitterParams;

fn hash(p: vec2<f32>) -> f32 {
  let h = sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123;
  return fract(h);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);

  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));

  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn pow12(x: f32) -> f32 {
  let x2 = x * x;
  let x4 = x2 * x2;
  let x8 = x4 * x4;
  return x8 * x4;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = params.time_vec.x;
  let res = params.resolution.xy;
  let uv = (ndc * 0.5 + 0.5) * res / res.x;

  let scale = params.controls.x;
  let speed = params.controls.y;
  let intensity = params.controls.z;
  let density = clamp(params.controls.w, 0.0, 0.99);

  let offset = time * speed;
  let wrapped = offset - floor(offset / 4096.0) * 4096.0;
  let scroll = vec2<f32>(wrapped);

  let n1 = noise(uv * scale * 1.07 + scroll);
  let n2 = noise(uv * scale * 0.93 - scroll);

  let spark = clamp(n1 * 0.5 + n2 * 0.5, 0.0, 1.0);
  let sharpened = pow12(spark);
  let gated = max(0.0, sharpened - density) / max(1e-5, 1.0 - density);

  let tint = mix(params.colorA.rgb, params.colorB.rgb, spark);
  let rgb = tint * intensity * gated;
  let alpha = clamp(intensity * gated, 0.0, 1.0);

  return vec4<f32>(rgb, alpha);
}
`;
