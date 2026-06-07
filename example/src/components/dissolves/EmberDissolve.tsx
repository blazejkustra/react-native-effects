import { createDissolveComponent } from './common';

/**
 * Ember Burn — the card erodes along a noise front with a glowing orange rim,
 * like paper catching fire from the top-left corner.
 */
export default createDissolveComponent(/* wgsl */ `
@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let prog = clamp(u.live.x, 0.0, 1.0);

  let base = cardSurface(uv);
  let n = fbm(uv * vec2<f32>(7.0 * aspect, 7.0));
  let bias = uv.x * 0.55 + (1.0 - uv.y) * 0.45;
  let dval = n * 0.55 + bias * 0.65;

  let threshold = prog * 1.25;
  let edge = 0.05;
  let cardAlpha = smoothstep(threshold - edge, threshold + edge, dval);
  let gate = step(0.001, prog) * (1.0 - step(0.999, prog));

  let rim = 1.0 - smoothstep(0.0, edge * 2.5, abs(dval - threshold));
  let ember = rim * gate;

  let rgb = base * cardAlpha + vec3<f32>(1.0, 0.55, 0.16) * ember * 1.5;
  let alpha = clamp(cardAlpha + ember, 0.0, 1.0);
  return vec4<f32>(rgb * alpha, alpha);
}
`);
