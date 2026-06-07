import { createDissolveComponent } from './common';

/**
 * Pixel Glitch — the card dissolves block by block on a coarse grid, with a
 * cyan RGB-split shimmer running along the dissolve front. Retro digital
 * "deletion" vibe.
 */
export default createDissolveComponent(/* wgsl */ `
@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let prog = clamp(u.params1.x, 0.0, 1.0);

  let base = cardSurface(uv);
  let bias = uv.x * 0.55 + (1.0 - uv.y) * 0.45;
  let threshold = prog * 1.2;
  let gate = step(0.001, prog) * (1.0 - step(0.999, prog));

  let blocks = vec2<f32>(22.0 * aspect, 22.0);
  let cell = floor(uv * blocks);
  let hh = hash21(cell);
  let bd = hh * 0.55 + bias * 0.6;
  let cellAlpha = 1.0 - smoothstep(bd, bd + 0.02, threshold);

  // RGB split near the front for a glitch shimmer.
  let frontish = 1.0 - smoothstep(0.0, 0.12, abs(bd - threshold));
  let off = frontish * 0.02;
  let cr = cardSurface(uv + vec2<f32>(off, 0.0)).r;
  let cb = cardSurface(uv - vec2<f32>(off, 0.0)).b;
  var gcol = base;
  gcol.r = mix(base.r, cr, frontish);
  gcol.b = mix(base.b, cb, frontish);

  let glow = frontish * gate * 0.5;
  let rgb = gcol * cellAlpha + vec3<f32>(0.6, 0.9, 1.0) * glow;
  let alpha = clamp(cellAlpha + glow * 0.6, 0.0, 1.0);
  return vec4<f32>(rgb * alpha, alpha);
}
`);
