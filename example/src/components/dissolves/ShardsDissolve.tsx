import { createDissolveComponent } from './common';

/**
 * Shards — the card cracks into voronoi cells that wink out one by one along a
 * diagonal front, each with a glowing crack edge just before it goes. Reads like
 * the surface shattering into angular pieces.
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

  let vor = voronoi(uv * vec2<f32>(9.0 * aspect, 9.0));
  let edist = vor.x;
  let mid = vor.y;

  // Each shard leaves at its own rank (random + directional bias).
  let rank = mid * 0.55 + bias * 0.6;
  let cellAlpha = 1.0 - smoothstep(rank, rank + 0.05, threshold);

  // Glowing crack edges, riding a travelling band just ahead of the dissolve
  // front: the glow fades in as the front nears a shard and fades out as the
  // shard winks away, so cracks never all light up at once.
  let crack = smoothstep(0.045, 0.0, edist);
  let front = smoothstep(rank - 0.18, rank - 0.04, threshold)
            * (1.0 - smoothstep(rank - 0.02, rank + 0.05, threshold));
  let glow = crack * front * gate;

  let rgb = base * cellAlpha + vec3<f32>(1.0, 0.7, 0.3) * glow * 1.2;
  let alpha = clamp(cellAlpha + glow, 0.0, 1.0);
  return vec4<f32>(rgb * alpha, alpha);
}
`);
