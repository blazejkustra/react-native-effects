import { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type ParticleDispersionProps = Omit<
  ShaderViewProps,
  | 'fragmentShader'
  | 'paramsSynchronizable'
  | 'params'
  | 'texture'
  | 'colors'
  | 'transparent'
> & {
  /** `u.live = (dissolve progress 0→1, rim shimmer 0→1, zoom, seed)`, `u.liveData[0].x` = lift 0→1. */
  paramsSynchronizable: ParamsSynchronizable;
  /**
   * One image, two panels side by side: the photo on the left, and on the
   * right a data panel with R = subject mask, G = distance outside the
   * subject in photo px / 255, B = that distance normalised to its maximum.
   */
  atlas: ImageSourcePropType;
  /** Size of ONE panel (the photo), in px. */
  photoWidth: number;
  photoHeight: number;
  /** Centre of the subject in photo px (the shimmer and wind revolve around it). */
  subject: { x: number; y: number };
  /** Flat colour left behind once the background has dispersed. */
  backdrop?: ColorInput;
  /** Colour of the rim light that traces the subject afterwards. */
  rimColor?: ColorInput;
};

/**
 * iOS-style "lift subject" reveal: the photo's background breaks up into a
 * fine dust that rises, glitters and fades, leaving the cut-out subject on a
 * flat colour with a soft contact shadow. A light then traces the silhouette
 * from the top down both sides while the cut-out shrinks a little and settles
 * in the middle of the screen.
 *
 * Same fragment-only particle trick as the Telegram dissolve: each ~1.3pt
 * cell of the background is one grain, released in order of its distance
 * from the subject (precomputed into the atlas), carried by a smooth wind
 * field that is inverted per fragment, and gathered from a 5×5 cell window.
 */
export default function ParticleDispersion({
  paramsSynchronizable,
  atlas,
  photoWidth,
  photoHeight,
  subject,
  backdrop = '#6e625a',
  rimColor = '#fff3e4',
  ...rest
}: ParticleDispersionProps) {
  const params = useMemo(
    () => [photoWidth, photoHeight, subject.x, subject.y],
    [photoWidth, photoHeight, subject.x, subject.y]
  );
  const colors = useMemo(() => [backdrop, rimColor], [backdrop, rimColor]);
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={params}
      colors={colors}
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

// Timeline in progress units (0..1 over the dissolve).
const SWEEP: f32 = 0.5;     // the front travels from the subject to the far corner
const JITTER: f32 = 0.06;   // per-cell start scatter
const LIFE: f32 = 0.6;      // a grain's life once released
const GHOST: f32 = 0.2;     // how far ahead of the front the photo fades to the flat colour
const CELL: f32 = 1.35;     // grain grid, logical px
const GATHER: i32 = 2;      // neighbourhood half-width in cells
const SPREAD: f32 = 1.6;    // per-grain random offset, logical px (< GATHER*CELL - slack)
const DRIFT: f32 = 150.0;   // upward travel over a life, logical px
const SPARKLE: f32 = 0.35;  // share of grains that flash white
const DROP: f32 = 0.3;      // share of background cells that never become grains
const LIFT: f32 = 0.55;     // how far grain colour is pulled toward warm sand
const SHADOW: f32 = 0.22;   // contact shadow strength under the lifted subject
const SHADOW_R: f32 = 30.0; // shadow falloff, logical px
const RIM_W: f32 = 7.5;     // rim glow width outside the silhouette, logical px
const LIFT_SCALE: f32 = 0.86; // subject scale once lifted
const LIFT_Y: f32 = 0.5;    // where the lifted subject's centre settles (fraction of height)

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Canvas size in logical px.
fn canvasSize() -> vec2<f32> {
  return u.resolution.xy / u.resolution.w;
}
// "cover" scale from photo px to logical px, including the live zoom.
fn coverScale() -> f32 {
  let cs = canvasSize();
  let pw = u.params0.xy;
  return max(cs.x / pw.x, cs.y / pw.y) * max(u.live.z, 0.01);
}
fn toPhoto(q: vec2<f32>) -> vec2<f32> {
  return (q - canvasSize() * 0.5) / coverScale() + u.params0.xy * 0.5;
}
fn toLogical(pp: vec2<f32>) -> vec2<f32> {
  return (pp - u.params0.xy * 0.5) * coverScale() + canvasSize() * 0.5;
}
fn inPhoto(pp: vec2<f32>) -> bool {
  let pw = u.params0.xy;
  return pp.x >= 0.0 && pp.y >= 0.0 && pp.x <= pw.x && pp.y <= pw.y;
}

// The atlas holds the photo on the left half and a data panel on the right:
// R = subject mask, G = distance outside the subject in photo px / 255,
// B = that distance / maxDist. Both lookups stay half a texel away from the
// seam so the linear sampler never blends the panels together.
fn photoAt(pp: vec2<f32>) -> vec3<f32> {
  let pw = u.params0.xy;
  let c = clamp(pp, vec2<f32>(0.5), pw - 0.5);
  let uv = vec2<f32>(c.x / (pw.x * 2.0), c.y / pw.y);
  return textureSampleLevel(tex, samp, uv, 0.0).rgb;
}
fn dataAt(pp: vec2<f32>) -> vec3<f32> {
  let pw = u.params0.xy;
  let c = clamp(pp, vec2<f32>(0.5), pw - 0.5);
  let uv = vec2<f32>((pw.x + c.x) / (pw.x * 2.0), c.y / pw.y);
  return textureSampleLevel(tex, samp, uv, 0.0).rgb;
}

// When a background cell lets go: mostly by distance from the subject, with a
// bias so the release starts low and finishes at the top-right corner.
fn startAt(pp: vec2<f32>, far: f32, k: vec2<f32>) -> f32 {
  let n = pp / u.params0.xy;
  let order = far * 0.62 + (1.0 - n.y) * 0.24 + n.x * 0.14;
  return SWEEP * order + JITTER * hash21(k + 7.3);
}

fn travel(tau: f32) -> f32 {
  return 1.0 - pow(1.0 - tau, 2.2);
}

// Smooth, invertible wind in logical px: rise, gentle expansion away from the
// subject and two low-frequency swirl layers (every gradient well under 1).
fn wind(o: vec2<f32>, tau: f32, seed: f32) -> vec2<f32> {
  let e = travel(tau);
  let c = toLogical(u.params0.zw);
  let s = seed * 6.2831;
  let lowA = sin(o.x * 0.030 + s) * cos(o.y * 0.037 + s * 1.7);
  let lowB = sin(o.y * 0.028 - s) * cos(o.x * 0.026 + s * 0.6);
  let hiA = sin(o.x * 0.10 + o.y * 0.08 + s * 2.0);
  let hiB = cos(o.x * 0.07 - o.y * 0.12 + s * 3.0);
  var d = vec2<f32>(0.0, -DRIFT) * e;
  d = d + (o - c) * vec2<f32>(0.22, 0.10) * e;
  d = d + vec2<f32>(lowA, lowB) * 16.0 * e;
  d = d + vec2<f32>(hiA, hiB) * 3.0 * e;
  return d;
}

fn cellStart(o: vec2<f32>) -> f32 {
  let k = floor(o / CELL);
  let c = (k + 0.5) * CELL;
  let pp = toPhoto(c);
  let d = dataAt(pp);
  return startAt(pp, d.b, k);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  let rimP = u.live.y;
  let seed = u.live.w;
  let liftE = clamp(u.liveData[0].x, 0.0, 1.0);
  let uv = ndc * 0.5 + 0.5;
  let cs = canvasSize();
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * cs;   // logical px, y-down
  let s = coverScale();
  let pp = toPhoto(q);

  let photo = photoAt(pp);
  let flat = u.color0.rgb;

  // The lifted subject: once the background is gone it shrinks a little and
  // settles in the middle of the screen. Sample it through its own mapping.
  let cL = toLogical(u.params0.zw);
  let cT = cs * vec2<f32>(0.5, LIFT_Y);
  let cNow = mix(cL, cT, liftE);
  let sNow = mix(1.0, LIFT_SCALE, liftE);
  let qs = cL + (q - cNow) / sNow;
  let pps = toPhoto(qs);
  let subj = photoAt(pps);
  let dataS = dataAt(pps);
  let mask = dataS.r;
  let near = dataS.g * 255.0 * s * sNow;

  // Contact shadow under the subject, longer and softer as it lifts.
  let shOff = mix(10.0, 20.0, liftE) / (s * sNow);
  let shR = mix(SHADOW_R, SHADOW_R * 1.6, liftE);
  let nearS = dataAt(pps - vec2<f32>(0.0, shOff)).g * 255.0 * s * sNow;
  let shadow = 1.0 - SHADOW * exp(-nearS / shR);
  let flatShaded = flat * shadow;

  // Background under this fragment: intact photo, ghosting toward the flat
  // colour as the front approaches, then the flat colour once released.
  var bg = photo;
  if (p > 0.0) {
    let kq = floor(q / CELL);
    let cq = (kq + 0.5) * CELL;
    let st = cellStart(cq);
    let ghost = smoothstep(st - GHOST, st, p);
    bg = mix(photo, flatShaded, ghost);
  }
  if (p >= 1.0) {
    bg = flatShaded;
  }

  // Grains: gather the origin cells whose wind could land them here.
  var dust = vec3<f32>(0.0);
  var dustA = 0.0;
  if (p > 0.0 && p < 1.0) {
    var o = q;
    for (var i = 0; i < 4; i = i + 1) {
      let tauO = clamp((p - cellStart(o)) / LIFE, 0.0, 1.0);
      o = q - wind(o, tauO, seed);
    }
    let k0 = floor(o / CELL);
    for (var dy = -GATHER; dy <= GATHER; dy = dy + 1) {
      for (var dx = -GATHER; dx <= GATHER; dx = dx + 1) {
        let k = k0 + vec2<f32>(f32(dx), f32(dy));
        let c = (k + 0.5) * CELL;
        let cpp = toPhoto(c);
        if (!inPhoto(cpp)) {
          continue;
        }
        let d = dataAt(cpp);
        if (d.r > 0.5) {
          continue;
        }
        let tau = (p - startAt(cpp, d.b, k)) / LIFE;
        if (tau <= 0.0 || tau >= 1.0) {
          continue;
        }
        let h = hash22(k);
        if (h.x < DROP) {
          continue;
        }
        var col = mix(photoAt(cpp), vec3<f32>(0.93, 0.86, 0.76), LIFT);
        if (h.y < SPARKLE) {
          let flash = 0.5 + 0.5 * sin(tau * 40.0 + h.y * 6.2831);
          col = mix(col, vec3<f32>(1.0, 0.98, 0.93), 0.55 + 0.45 * flash);
        }
        let jit = (hash22(k + 3.1) - 0.5) * 2.0 * SPREAD * smoothstep(0.0, 1.0, tau);
        let pos = c + wind(c, tau, seed) + jit;
        let r = CELL * (0.72 - 0.25 * tau);
        let dist = length(q - pos);
        let cov = 1.0 - smoothstep(r - 0.5, r + 0.5, dist);
        if (cov <= 0.0) {
          continue;
        }
        let twinkle = 0.75 + 0.25 * sin(tau * 26.0 + h.y * 6.2831);
        let fade = (1.0 - smoothstep(0.45, 1.0, tau)) * twinkle;
        let w = cov * fade;
        dust = dust + col * w;
        dustA = dustA + w;
      }
    }
    dustA = min(dustA, 1.0);
  }

  var outCol = mix(bg, dust, dustA);
  // The subject is drawn on top, untouched.
  outCol = mix(outCol, subj, mask);

  // Rim shimmer: a soft light that grows from the top of the subject down
  // both sides, then fades out.
  if (rimP > 0.0) {
    let dir = q - cNow;
    let ang = abs(atan2(dir.x, -dir.y)) / 3.14159; // 0 at top, 1 at bottom
    let reach = rimP * 1.3;
    let front = smoothstep(reach, reach - 0.18, ang);
    let trail = mix(0.3, 1.0, exp(-(reach - ang) * 2.5));
    let life = smoothstep(0.0, 0.08, rimP) * (1.0 - smoothstep(0.7, 1.0, rimP));
    let outer = exp(-near / RIM_W) * (1.0 - mask);
    let edge = mask * (1.0 - mask) * 3.5;
    let glow = (outer * 1.25 + edge) * front * trail * life;
    outCol = outCol + u.color1.rgb * glow;
  }

  return vec4<f32>(outCol, 1.0);
}
`;
