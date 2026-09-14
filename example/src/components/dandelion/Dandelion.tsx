import { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type DandelionProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'params' | 'texture' | 'colors'
> & {
  /** See `useDandelionPhysics` for the channel layout. */
  paramsSynchronizable: ParamsSynchronizable;
  /**
   * One image, three panels of the same size side by side: the photo, the
   * photo with the seed head painted out, and a data panel with R = soft
   * head mask and G = hair matte (the white pappus pixels).
   */
  atlas: ImageSourcePropType;
  /** Size of ONE panel, in px. */
  panelWidth: number;
  panelHeight: number;
  /** The seed head in panel px: centre and radius. */
  head: { x: number; y: number; r: number };
};

/**
 * A photographed dandelion clock whose seeds blow away.
 *
 * The head is cut into ~12pt cells; each cell over the head is one tuft.
 * While attached, the fragment simply shows the photo (leaning a few px into
 * the breath). Once the detached fraction passes a cell's place in the order
 * (downwind rim first, centre last), that patch of the photo lifts off: the
 * fragment shows the bald panel underneath, and the tuft — the photo's own
 * pixels through the hair matte, so only the white hairs fly — is drawn
 * translated by the wind distance since its band let go, drifting up,
 * tumbling slowly and fading out.
 *
 * Same fragment-only particle trick as the Telegram dissolve: the wind is a
 * smooth field of the origin, inverted per fragment to find the neighbourhood
 * of cells that could land here, then gathered from a 5x5 window.
 */
export default function Dandelion({
  paramsSynchronizable,
  atlas,
  panelWidth,
  panelHeight,
  head,
  ...rest
}: DandelionProps) {
  const params = useMemo(
    () => [panelWidth, panelHeight, head.x, head.y, head.r, 0, 0, 0],
    [panelWidth, panelHeight, head.x, head.y, head.r]
  );
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={params}
      texture={atlas}
      {...rest}
    />
  );
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const BANDS: f32 = 64.0;
const CELL: f32 = 12.0;      // tuft grid, logical px — a loose seed is a patch this size, so it reads as a parachute, not a speck
const GATHER: i32 = 2;       // neighbourhood half-width in cells
const TUFT: f32 = 0.65;      // nominal tuft radius, in cells — smaller than the grid, so tufts read as separate
const SPREAD: f32 = 4.0;     // per-tuft random offset, logical px (well under GATHER*CELL)
const DROP: f32 = 0.3;       // share of cells that simply vanish rather than fly
const LIFE: f32 = 4.4;       // seconds a loose seed stays visible
const LIFT: f32 = 30.0;      // upward drift of a loose seed, logical px/s
const KICK: f32 = 75.0;      // the breath that frees a seed also throws it: launch travel, logical px
const KICK_TAU: f32 = 0.7;   // ...spent over about this long (s)
const EXPAND: f32 = 0.2;     // cloud expansion away from the head, 1/s (capped)
const WIND_DIR: vec2<f32> = vec2<f32>(0.62, -0.78); // screen space, y down: up and a little right
const WIND_PERP: vec2<f32> = vec2<f32>(0.78, 0.62);
const FRONT_SOFT: f32 = 0.035; // width of the attached/detached cross-fade, in order units — the fluff thins rather than cuts

fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Cheap smooth noise for an organic front, 0..1.
fn vnoise(p: vec2<f32>) -> f32 {
  let a = sin(p.x * 1.7 + sin(p.y * 1.3) * 1.5);
  let b = cos(p.y * 1.1 + sin(p.x * 0.7) * 1.2);
  return 0.5 + 0.5 * a * b;
}
fn rot2(v: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * v.x - s * v.y, s * v.x + c * v.y);
}

// Canvas size in logical px.
fn canvasSize() -> vec2<f32> {
  return u.resolution.xy / u.resolution.w;
}
// "cover" scale from panel px to logical px.
fn coverScale() -> f32 {
  let cs = canvasSize();
  let pw = u.params0.xy;
  return max(cs.x / pw.x, cs.y / pw.y);
}
fn toPhoto(q: vec2<f32>) -> vec2<f32> {
  return (q - canvasSize() * 0.5) / coverScale() + u.params0.xy * 0.5;
}
fn toLogical(pp: vec2<f32>) -> vec2<f32> {
  return (pp - u.params0.xy * 0.5) * coverScale() + canvasSize() * 0.5;
}

// Three panels side by side; every lookup stays half a texel inside its panel
// so the linear sampler never blends neighbours across a seam.
fn panelAt(pp: vec2<f32>, panel: f32) -> vec3<f32> {
  let pw = u.params0.xy;
  let c = clamp(pp, vec2<f32>(0.5), pw - 0.5);
  let uv = vec2<f32>((pw.x * panel + c.x) / (pw.x * 3.0), c.y / pw.y);
  return textureSampleLevel(tex, samp, uv, 0.0).rgb;
}
fn photoAt(pp: vec2<f32>) -> vec3<f32> { return panelAt(pp, 0.0); }
fn baldAt(pp: vec2<f32>) -> vec3<f32> { return panelAt(pp, 1.0); }
fn dataAt(pp: vec2<f32>) -> vec3<f32> { return panelAt(pp, 2.0); }

// Where in the release order a point of the head sits, 0 (first to go) .. 1.
// The downwind side goes first and the near side last. On the real thing the
// near side lets go first and streams over the top — but this is a flat
// photo, and a white seed crossing a white head is invisible until it is
// spent, so a near-side-first order reads as "nothing happened". Letting the
// far side go first sends every seed straight off the silhouette into the sky.
//
// The outer ring goes before the centre, but the ring, not the fringe: the
// outermost wisps beyond ~0.9 R carry no tuft in the matte, so an order that
// started right at the rim spent the first tenth of the breath stripping
// nothing visible. The range is normalised over the cells that do carry a
// tuft, so a gentle puff frees a few real seeds and the last of the energy
// still has seeds left to take; the divisor keeps the analytic maximum of
// raw (0.83, near side at 0.35 R with the noise at 1) under 1, since a cell
// past 1 would never let go and its patch of photo would stay on the bald
// head. Two octaves of noise keep the front ragged rather than a clean bite.
fn headOrder(pp: vec2<f32>) -> f32 {
  let d = (pp - u.params0.zw) / u.params1.x;
  let downwind = clamp(dot(d, WIND_DIR), -1.0, 1.0);
  let centre = 1.0 - smoothstep(0.35, 0.9, length(d));
  let n = 0.6 * vnoise(pp * 0.02) + 0.4 * vnoise(pp * 0.05 + 3.7);
  let raw = 0.52 * (0.5 - 0.5 * downwind) + 0.30 * centre + 0.18 * n;
  return (raw - 0.14) / 0.72;
}

// (time, wind distance) at which band k let go; time < 0 while attached.
fn bandInfo(k: i32) -> vec2<f32> {
  let v = u.liveData[1 + k / 2];
  return select(v.xy, v.zw, (k % 2) == 1);
}
fn bandOf(order: f32) -> i32 {
  return clamp(i32(floor(order * BANDS)), 0, i32(BANDS) - 1);
}

// Where a tuft released at origin o (logical px) is now, relative to o.
//
// A fragment can only gather tufts whose origins lie within a couple of cells
// of where it inverts the field to, so the travel has to be a smooth field of
// the origin with every spatial gradient well under 1. That alone would fly
// the seeds as one rigid copy of the head, which is exactly what a blown
// dandelion does not look like. So the cells are split into two interleaved
// classes (checkerboard) that ride different fields — different speed,
// opposite swirl — and the cloud expands away from the head as it ages. Each
// class stays smooth, so each inverts cleanly; between them they separate.
fn drift(o: vec2<f32>, age: f32, dW: f32, h: vec2<f32>, cls: f32) -> vec2<f32> {
  let speed = mix(0.82, 1.12, cls) + 0.12 * sin(o.x * 0.007 + cls * 2.0) * cos(o.y * 0.006);
  let ph = cls * 3.14159;
  let swirl = 9.0 * sin(age * 1.6 + o.x * 0.02 + o.y * 0.017 + ph)
            + 4.0 * sin(age * 3.1 - o.y * 0.03 + ph);
  let c = toLogical(u.params0.zw);
  var d = WIND_DIR * (dW * speed + KICK * (1.0 - exp(-age / KICK_TAU)) * mix(0.8, 1.2, cls));
  d = d + vec2<f32>(0.0, -LIFT * age);
  d = d + (o - c) * EXPAND * min(age, 2.5) * (0.6 + 0.4 * cls);
  d = d + WIND_PERP * swirl;
  d = d + (h - 0.5) * 2.0 * SPREAD * smoothstep(0.0, 1.0, age);
  return d;
}

// Age and wind distance of the tuft that started at origin o (0,0 if attached).
fn originState(o: vec2<f32>) -> vec2<f32> {
  let pp = toPhoto(o);
  let info = bandInfo(bandOf(headOrder(pp)));
  if (info.x < 0.0) {
    return vec2<f32>(0.0);
  }
  return vec2<f32>(u.live.z - info.x, u.live.w - info.y);
}

fn cellClass(k: vec2<f32>) -> f32 {
  return f32((i32(k.x) + i32(k.y)) & 1);
}

// Premultiplied colour + coverage of every tuft of one class landing at q.
fn gatherClass(q: vec2<f32>, cls: f32, detached: f32, nowT: f32, windW: f32, s: f32) -> vec4<f32> {
  var o = q;
  for (var i = 0; i < 4; i = i + 1) {
    let st = originState(o);
    o = q - drift(o, st.x, st.y, vec2<f32>(0.5), cls);
  }
  let k0 = floor(o / CELL);
  let r = CELL * TUFT;
  var acc = vec4<f32>(0.0);
  for (var dy = -GATHER; dy <= GATHER; dy = dy + 1) {
    for (var dx = -GATHER; dx <= GATHER; dx = dx + 1) {
      let k = k0 + vec2<f32>(f32(dx), f32(dy));
      if (cellClass(k) != cls) {
        continue;
      }
      let c = (k + 0.5) * CELL;
      let cpp = toPhoto(c);
      let dd = (cpp - u.params0.zw) / u.params1.x;
      if (dot(dd, dd) > 1.15) {
        continue;
      }
      let h = hash22(k);
      if (h.x < DROP) {
        continue;
      }
      if (dataAt(cpp).r < 0.5) {
        continue;
      }
      let thr = headOrder(cpp) + (h.y - 0.5) * 0.03;
      if (detached < thr) {
        continue;
      }
      let info = bandInfo(bandOf(thr));
      if (info.x < 0.0) {
        continue;
      }
      // The stagger is only for when a tuft appears and fades; its travel
      // uses the band's own clock, the same one the inversion above used, so
      // the tuft is where its fragment expects it. Staggering the travel too
      // moved tufts ~10 px off the inverted field, out of the gather window,
      // and they came back sliced along a cell boundary.
      let bandAge = nowT - info.x;
      let age = bandAge - h.y * 0.08;
      if (age <= 0.0 || age >= LIFE) {
        continue;
      }
      let dW = max(0.0, windW - info.y);
      let pos = c + drift(c, bandAge, dW, h, cls);
      let rel = q - pos;
      let dist = length(rel);
      // Tufts come in sizes; a soft gaussian body with a faint starburst
      // of spokes, so they read as fluffy specks rather than discs.
      let h2 = hash22(k + 7.7);
      let rr = r * mix(0.55, 1.35, h2.x);
      if (dist > rr * 1.6) {
        continue;
      }
      // The tuft is the photo's own patch, turned slowly as it tumbles, seen
      // through the hair matte so only the white hairs fly.
      let spin = (h.x - 0.5) * age * 1.6;
      let spp = cpp + rot2(rel, spin) / s;
      let pc = photoAt(spp);
      // The matte lets grey between-hair pixels through at low weight; only
      // the bright hairs fly, or a tuft carries a green-grey smudge with it.
      let hair = smoothstep(0.1, 0.85, dataAt(spp).g)
               * smoothstep(0.5, 0.7, dot(pc, vec3<f32>(0.3, 0.59, 0.11)));
      let ang = atan2(rel.y, rel.x);
      let spokes = 0.7 + 0.3 * cos(ang * 7.0 + h2.y * 6.2831 + spin * 3.0);
      let body = exp(-(dist * dist) / (0.55 * rr * rr));
      let cov = body * mix(1.0, spokes, smoothstep(0.3, 1.2, dist / rr));
      let fade = 1.0 - smoothstep(0.45, 1.0, age / LIFE);
      let w = hair * cov * fade * mix(0.75, 1.0, h2.y);
      if (w <= 0.003) {
        continue;
      }
      let col = mix(pc, vec3<f32>(0.97, 0.97, 0.94), 0.15);
      acc = acc + vec4<f32>(col * w, w);
    }
  }
  return acc;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let detached = u.live.x;
  let nowT = u.live.z;
  let windW = u.live.w;
  let lean = u.liveData[0].x;
  let sway = u.liveData[0].y;

  let uv = ndc * 0.5 + 0.5;
  let cs = canvasSize();
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * cs;   // logical px, y-down
  let s = coverScale();
  let pp = toPhoto(q);
  let headW = dataAt(pp).r;

  // The head leans a few px into the breath and sways on its stem; the
  // background does not. Sample the photo shifted where the head is. The
  // weight is a smooth radial falloff, not the head mask: the mask edge is
  // the jagged silhouette from Vision, and a displacement that jumps across
  // it tears a sliver of photo along that edge on every gust.
  let headSoft = 1.0 - smoothstep(0.85, 1.15, length((pp - u.params0.zw) / u.params1.x));
  let shift = (WIND_DIR * lean + vec2<f32>(sway * 0.35, sway)) * headSoft / s;
  let photo = photoAt(pp - shift);
  let bald = baldAt(pp);
  // The front is ragged where there is head to bite into. Outside the head
  // the two panels differ only in tone (the inpaint against the real bokeh,
  // out to where the fill feathers off), and a ragged front through that
  // showed up as sharp-edged blotches of darker green; there the cross-fade
  // is slow, spread over a good part of the strip, so it reads as nothing.
  let orderQ = headOrder(pp);
  let soft = mix(0.25, FRONT_SOFT, smoothstep(0.0, 0.5, headW));
  let attached = 1.0 - smoothstep(orderQ - soft, orderQ + soft, detached);
  var base = mix(bald, photo, attached);

  // Loose tufts, one gather per cell class.
  var acc = vec4<f32>(0.0);
  if (detached > 0.0) {
    acc = gatherClass(q, 0.0, detached, nowT, windW, s)
        + gatherClass(q, 1.0, detached, nowT, windW, s);
  }

  var outCol = base;
  if (acc.w > 0.0) {
    let a = min(acc.w, 1.0);
    outCol = base * (1.0 - a) + acc.rgb * (a / acc.w);
  }
  return vec4<f32>(outCol, 1.0);
}
`;
