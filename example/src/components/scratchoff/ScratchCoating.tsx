import { useMemo } from 'react';
import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

/** The play area, in points. Three prize boxes in a row. */
export const PLAY_W = 340;
export const PLAY_H = 104;
export const AREAS = [
  { x: 0, y: 0, w: 104, h: 104 },
  { x: 118, y: 0, w: 104, h: 104 },
  { x: 236, y: 0, w: 104, h: 104 },
] as const;
export const AREA_RADIUS = 10;

/** Coverage grid over the play area: one float per cell in `u.liveData`. */
export const GRID_X = 24;
export const GRID_Y = 15;
/** `u.liveData[TILT_SLOT].xy` carries the tilt, after the grid. */
export const TILT_SLOT = (GRID_X * GRID_Y) / 4;
export const CHANNEL_LENGTH = 4 + (TILT_SLOT + 1) * 4;

export type PrizeSymbol = 0 | 1 | 2 | 3;

type ScratchCoatingProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'params' | 'transparent'
> & {
  /**
   * `u.live` = reveal sweep 0..1 for each area; `u.liveData` = the coverage
   * grid (row-major, 0..1), then the tilt (-1..1) at `TILT_SLOT`.
   */
  paramsSynchronizable: ParamsSynchronizable;
  /** Symbol under each area: star, clover, diamond, heart. */
  symbols: readonly [PrizeSymbol, PrizeSymbol, PrizeSymbol];
};

/**
 * The silver latex over the prize areas, and the holographic symbols under it.
 *
 * Where the coverage grid says the finger has been, the latex is gone. The
 * grid is coarse, so the edge is cut by two octaves of noise: scratched latex
 * tears along its own grain into flaky, irregular edges and leaves specks
 * behind. The remaining coat is metallic: fine grain, a printed lattice, a
 * broad sheen and glitter that both move with tilt, a darker curled rim at
 * the tear, and a shadow on the card just inside it. Under it each area has
 * a hot-stamped holographic symbol: silver foil with fine diffraction grooves
 * that throw saturated spectral bands racing across it with tilt, edged by a
 * printed dark outline. An area's reveal sweep clears what is left in one
 * diagonal pass with a line of sparkle.
 */
export default function ScratchCoating({
  paramsSynchronizable,
  symbols,
  ...rest
}: ScratchCoatingProps) {
  const params = useMemo(() => [...symbols], [symbols]);
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={params}
      transparent
      {...rest}
    />
  );
}

function rect(i: number): string {
  const a = AREAS[i]!;
  return `vec4<f32>(${a.x}.0, ${a.y}.0, ${a.w}.0, ${a.h}.0)`;
}

const SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const PLAY = vec2<f32>(${PLAY_W}.0, ${PLAY_H}.0);
const GRID = vec2<i32>(${GRID_X}, ${GRID_Y});
const RADIUS = ${AREA_RADIUS}.0;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash(i);
  let b = hash(i + vec2<f32>(1.0, 0.0));
  let c = hash(i + vec2<f32>(0.0, 1.0));
  let d = hash(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var s = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 3; i++) {
    s += amp * vnoise(p);
    p = p * 2.1 + vec2<f32>(3.1, 7.7);
    amp *= 0.5;
  }
  return s;
}

fn cell(ix: i32, iy: i32) -> f32 {
  let x = clamp(ix, 0, GRID.x - 1);
  let y = clamp(iy, 0, GRID.y - 1);
  let i = y * GRID.x + x;
  return u.liveData[i / 4][i % 4];
}

fn coverage(pt: vec2<f32>) -> f32 {
  let g = pt / PLAY * vec2<f32>(GRID) - 0.5;
  let i = vec2<i32>(floor(g));
  let f = fract(g);
  let a = cell(i.x, i.y);
  let b = cell(i.x + 1, i.y);
  let c = cell(i.x, i.y + 1);
  let d = cell(i.x + 1, i.y + 1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn sdRoundRect(p: vec2<f32>, r: vec4<f32>, rad: f32) -> f32 {
  let c = r.xy + r.zw * 0.5;
  let q = abs(p - c) - r.zw * 0.5 + rad;
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - rad;
}

fn sdStar(p0: vec2<f32>) -> f32 {
  let k1 = vec2<f32>(0.809016994, -0.587785252);
  let k2 = vec2<f32>(-k1.x, k1.y);
  var p = vec2<f32>(abs(p0.x), p0.y);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p = vec2<f32>(abs(p.x), p.y - 1.0);
  let ba = 0.45 * vec2<f32>(-k1.y, k1.x) - vec2<f32>(0.0, 1.0);
  let h = clamp(dot(p, ba) / dot(ba, ba), 0.0, 1.0);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

fn sdClover(p: vec2<f32>) -> f32 {
  let r = 0.36;
  var d = length(p - vec2<f32>(0.0, 0.4)) - r;
  d = min(d, length(p - vec2<f32>(0.4, 0.0)) - r);
  d = min(d, length(p - vec2<f32>(-0.4, 0.0)) - r);
  d = min(d, length(p - vec2<f32>(0.0, -0.4)) - r);
  let stem = p - vec2<f32>(0.05, -0.55);
  let h = clamp(dot(stem, vec2<f32>(0.32, -0.95)), 0.0, 0.5);
  d = min(d, length(stem - vec2<f32>(0.32, -0.95) * h) - 0.07);
  return d;
}

fn sdDiamond(p: vec2<f32>) -> f32 {
  let q = abs(p);
  return (q.x * 0.95 + q.y * 0.68 - 0.75) * 0.82;
}

fn dot2(v: vec2<f32>) -> f32 {
  return dot(v, v);
}

fn sdHeart(p0: vec2<f32>) -> f32 {
  let p = vec2<f32>(abs(p0.x), p0.y * 1.05 + 0.62) / 1.25;
  if (p.y + p.x > 1.0) {
    return (sqrt(dot2(p - vec2<f32>(0.25, 0.75))) - 0.353553) * 1.25;
  }
  let d = sqrt(min(dot2(p - vec2<f32>(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0))));
  return d * sign(p.x - p.y) * 1.25;
}

fn symbolSdf(kind: f32, q: vec2<f32>) -> f32 {
  if (kind < 0.5) {
    return sdStar(q * 1.05);
  }
  if (kind < 1.5) {
    return sdClover(q);
  }
  if (kind < 2.5) {
    return sdDiamond(q);
  }
  return sdHeart(q);
}

fn areaRect(i: i32) -> vec4<f32> {
  switch (i) {
    case 0: { return ${rect(0)}; }
    case 1: { return ${rect(1)}; }
    default: { return ${rect(2)}; }
  }
}

fn symbolKind(i: i32) -> f32 {
  return u.params0[i];
}

fn holoSymbol(pt: vec2<f32>, r: vec4<f32>, kind: f32, tilt: vec2<f32>) -> vec4<f32> {
  let c = r.xy + r.zw * 0.5;
  let size = r.w * 0.3;
  let q = vec2<f32>(pt.x - c.x, c.y - pt.y) / size;
  if (dot(q, q) > 2.6) {
    return vec4<f32>(0.0);
  }
  let d = symbolSdf(kind, q);
  let e = 0.02;
  let grad = vec2<f32>(
    symbolSdf(kind, q + vec2<f32>(e, 0.0)) - d,
    symbolSdf(kind, q + vec2<f32>(0.0, e)) - d
  ) / e;
  let px = 1.2 / size;
  let inside = 1.0 - smoothstep(-px, px, d);
  let outline = 1.0 - smoothstep(px * 0.9, px * 2.0, abs(d + px * 0.5));

  let bevel = 1.0 - smoothstep(0.0, 0.16, -d);
  let n = normalize(vec3<f32>(-grad * bevel * 1.6, 1.0));

  let grooveDir = normalize(vec2<f32>(0.8, 0.6));
  let across = dot(q, vec2<f32>(-grooveDir.y, grooveDir.x));
  let grooves = 0.5 + 0.5 * sin(across * size * 3.2);
  let order = dot(q, grooveDir) * 0.9 + length(q) * 0.35 + n.x * 0.5 - n.y * 0.3 + tilt.x * 2.4 + tilt.y * 1.5;
  let hue = fract(order);
  let spectral = clamp(abs(fract(hue + vec3<f32>(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, vec3<f32>(0.0), vec3<f32>(1.0));
  let band = smoothstep(0.15, 0.7, 0.5 + 0.5 * cos(6.2832 * order * 0.8));

  let silver = vec3<f32>(0.74, 0.76, 0.8) * (0.8 + 0.25 * n.z) * (0.93 + 0.1 * grooves);
  var col = mix(silver, mix(spectral, vec3<f32>(1.0), 0.22) * (0.8 + 0.3 * grooves), band * 0.9);
  let light = normalize(vec3<f32>(-0.4 + tilt.x * 0.6, 0.5 - tilt.y * 0.6, 0.8));
  let spec = min(pow(max(dot(n, light), 0.0), 30.0), 1.0);
  col += vec3<f32>(spec * 0.45);
  let ink = vec3<f32>(0.06, 0.09, 0.08);
  let alpha = max(inside, outline);
  let rgb = mix(ink, col, inside * (1.0 - outline * 0.8));
  return vec4<f32>(rgb * alpha, alpha);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let pt = vec2<f32>(uv.x, 1.0 - uv.y) * PLAY;
  let tilt = u.liveData[${TILT_SLOT}].xy;

  var area = -1;
  var r = vec4<f32>(0.0);
  for (var i = 0; i < 3; i++) {
    let ri = areaRect(i);
    if (sdRoundRect(pt, ri, RADIUS) < 0.0) {
      area = i;
      r = ri;
    }
  }
  if (area < 0) {
    return vec4<f32>(0.0);
  }
  let aa = 1.0 - smoothstep(-0.8, 0.4, sdRoundRect(pt, r, RADIUS));

  let n1 = fbm(pt * 0.16);
  let n2 = vnoise(pt * 0.55);
  var e = coverage(pt) + (n1 - 0.5) * 0.62 + (n2 - 0.5) * 0.2;

  let reveal = u.live[area];
  let local = (pt - r.xy) / r.zw;
  let diag = local.x * 0.72 + local.y * 0.28 + (n1 - 0.5) * 0.16;
  let front = reveal * 1.45 - 0.2;
  e = max(e, smoothstep(front + 0.04, front - 0.04, diag) * step(0.001, reveal));
  let speck = step(0.9, n2) * step(e, 0.95) * (1.0 - reveal);
  let coat = max(1.0 - smoothstep(0.48, 0.52, e), speck * 0.9);

  var under = holoSymbol(pt, r, symbolKind(area), tilt);
  let shadow = (1.0 - smoothstep(0.52, 0.64, e)) * (1.0 - coat) * 0.3;
  under = vec4<f32>(under.rgb * (1.0 - shadow), under.a + (1.0 - under.a) * shadow);

  let grain = hash(floor(pt * 2.5));
  var silver = 0.71 + 0.07 * n1 + 0.05 * (grain - 0.5);
  let lp = abs(fract((pt.x + pt.y) / 9.0) - 0.5);
  let lq = abs(fract((pt.x - pt.y) / 9.0) - 0.5);
  silver -= 0.035 * (1.0 - smoothstep(0.0, 0.06, min(lp, lq)));
  let pn = pt / PLAY.x;
  let s = pn.x * 0.8 + pn.y * 0.6 - 0.55 + tilt.x * 0.75 - tilt.y * 0.5;
  let sheen = exp(-s * s * 14.0) * 0.16 + exp(-s * s * 120.0) * 0.07;
  let gcell = floor(pt * 0.8);
  let gh = hash(gcell + vec2<f32>(9.0, 2.0));
  let glitter = step(0.95, gh) * min(pow(max(cos(gh * 41.0 + tilt.x * 9.0 + tilt.y * 7.0), 0.0), 14.0), 1.0) * 0.3;
  var coatCol = vec3<f32>(silver) * vec3<f32>(0.98, 0.99, 1.03) + vec3<f32>(sheen + glitter);
  let rim = smoothstep(0.36, 0.48, e) * (1.0 - speck);
  coatCol *= 1.0 - 0.22 * rim;

  let sweepGlow = exp(-pow((diag - front) * 18.0, 2.0)) * step(0.001, reveal) * step(reveal, 0.999);
  let sparkle = step(0.82, hash(floor(pt * 0.5) + vec2<f32>(floor(reveal * 20.0)))) * sweepGlow;
  let glowAmt = clamp(sweepGlow * 0.35 + sparkle * 0.9, 0.0, 1.0);

  var rgb = mix(under.rgb, coatCol, coat);
  var alpha = mix(under.a, 1.0, coat);
  rgb += vec3<f32>(1.0, 0.97, 0.88) * glowAmt;
  alpha = max(alpha, glowAmt);
  return vec4<f32>(min(rgb, vec3<f32>(alpha)) * aa, alpha * aa);
}
`;
