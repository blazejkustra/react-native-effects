import { useMemo } from 'react';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type Props = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'colors'
> & {
  /**
   * Live channel from {@link useBeerPhysics}:
   * `u.live = (surfaceAngle rad, surfaceLevelOnScreen, sloshEnergy, pourIntensity)`,
   * `u.liveData[0].x` = integrated bubble phase.
   */
  paramsSynchronizable: ParamsSynchronizable;
  /** Amber-gold beer body. */
  liquidColor?: ColorInput;
  /** Creamy foam head. */
  foamColor?: ColorInput;
};

/**
 * The phone as a glass of beer — full-screen amber liquid with parallax layers
 * of rising bubbles, a constant-thickness creamy foam head riding the surface,
 * a glinting meniscus, dark glass headspace with lacing and condensation, and
 * a turbulent refill stream while pouring. The surface angle, level, slosh
 * energy, pour intensity and bubble phase all arrive through the live channel.
 */
export default function BeerGlass({
  paramsSynchronizable,
  liquidColor = '#e5920a',
  foamColor = '#f8f1dd',
  ...rest
}: Props) {
  const colors = useMemo(
    () => [liquidColor, foamColor],
    [liquidColor, foamColor]
  );

  return (
    <ShaderView
      fragmentShader={BEER_SHADER}
      colors={colors}
      paramsSynchronizable={paramsSynchronizable}
      {...rest}
    />
  );
}

const BEER_SHADER = /* wgsl */ `
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

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// One parallax layer of rising bubbles on a cell grid, sampled in a frame
// whose +y is WORLD up — bubbles always rise toward the liquid surface, at
// any phone rotation. The vertical scroll is driven by the INTEGRATED phase
// (never time x varying speed) at ONE speed per layer: a per-column speed
// would accumulate phase-scaled offsets between columns, and the pattern
// tears apart at every column boundary the moment the frame rotates.
// Returns (bodyDarkening, highlight): real bubbles both refract (darken)
// and glint, which keeps them visible against the bright beer near the
// surface as well as the darker beer at the bottom.
fn bubbles(p0: vec2<f32>, phase: f32, cells: f32, riseSpeed: f32, seed: f32) -> vec2<f32> {
  let gx = p0.x * cells + seed * 19.7;
  let gy = p0.y * cells - phase * riseSpeed;
  let p = vec2<f32>(gx, gy);
  let cell = floor(p);
  let rnd = hash21(cell);
  let hasB = step(0.45, rnd);
  let rs = fract(rnd * 5.71);
  // Strongly skewed small: mostly pinpricks, the odd larger lens.
  let r = 0.045 + rs * rs * rs * 0.13;
  // Wobble as it rises: bounded sine of phase x a per-cell constant.
  let wob = sin(phase * (1.2 + rnd * 1.6) + rnd * 31.4) * (0.05 + rs * 0.06);
  let ctr = vec2<f32>(0.32 + fract(rnd * 7.31) * 0.36 + wob,
                      0.32 + fract(rnd * 13.7) * 0.36);
  let f = fract(p);
  let rel = f - ctr;
  let d = length(rel);
  // Spherical shell. Interior picks up refracted darkening, strongest in the
  // lower half of the bubble...
  let inside = smoothstep(r, r * 0.92, d);
  let bodyShade = inside * clamp(0.35 - 0.45 * rel.y / max(r, 0.001), 0.0, 1.0);
  // ...a bright rim, strongest up-left where the light hits...
  let rim = smoothstep(r, r * 0.9, d) * smoothstep(r * 0.55, r * 0.8, d);
  let dir = rel / max(d, 0.001);
  let rimLight = rim * (0.55 + 0.45 * dot(dir, vec2<f32>(-0.45, 0.6)));
  // ...a hard specular glint up-left and a soft counter-glint down-right.
  let g1 = length(rel + vec2<f32>(r * 0.38, -r * 0.38));
  let g2 = length(rel - vec2<f32>(r * 0.3, -r * 0.3));
  let glints = smoothstep(r * 0.28, r * 0.05, g1)
             + smoothstep(r * 0.3, 0.0, g2) * 0.35;
  let bright = 0.6 + 0.4 * fract(rnd * 3.17);
  return vec2<f32>(hasB * bodyShade,
                   hasB * bright * (rimLight * 0.9 + glints * 0.9));
}

// Micro-pore field: EVERY cell holds one tiny, soft, slightly darker dot —
// the dense matte body of packed micro-bubbles that fills real foam between
// the visible domes. Kept at whisper contrast; the sheer density is what
// reads, not any single pore.
fn foamPores(p0: vec2<f32>, cells: f32, seed: f32) -> f32 {
  let p = p0 * cells + seed * 11.7;
  let cell = floor(p);
  let rnd = hash21(cell + seed * 5.3);
  let ctr = vec2<f32>(0.28 + fract(rnd * 7.31) * 0.44,
                      0.28 + fract(rnd * 13.7) * 0.44);
  let rel = fract(p) - ctr;
  let r = 0.12 + fract(rnd * 5.13) * 0.17;
  let dot1 = smoothstep(r, r * 0.25, length(rel));
  return dot1 * (0.45 + 0.55 * fract(rnd * 3.71));
}

// One layer of visible foam bubbles on a sparse cell grid. Each bubble is a
// smooth bright DOME (never a ring or a hole): gentle circular lift, a small
// highlight nudged toward the upper-left, and a SOFT gray contact-shadow just
// outside the rim — strongest below the bubble — where it presses into the
// surrounding micro-foam. That shadow is what makes the dome read as 3D.
// gate: cells below this hash never spawn a bubble (rarer at larger sizes).
// Returns (domeCoverage, highlight, contactShadow).
fn foamDome(p0: vec2<f32>, cells: f32, gate: f32, seed: f32) -> vec3<f32> {
  let p = p0 * cells + seed * 17.3;
  let cell = floor(p);
  let rnd = hash21(cell + seed * 3.9);
  if (rnd < gate) {
    return vec3<f32>(0.0);
  }
  let ctr = vec2<f32>(0.36 + fract(rnd * 7.31) * 0.28,
                      0.36 + fract(rnd * 13.7) * 0.28);
  let rel = fract(p) - ctr;
  let d = length(rel);
  let r = 0.15 + fract(rnd * 5.13) * 0.15;
  // Smooth bright cap — a defined circle, but the edge stays soft.
  let dome = smoothstep(r, r * 0.68, d);
  // Highlight offset toward the upper-left of the cap.
  let hd = length(rel - vec2<f32>(-r * 0.3, r * 0.3));
  let hi = smoothstep(r * 0.6, r * 0.12, hd);
  // Soft contact-shadow ring hugging the OUTSIDE of the rim — clipped so it
  // never bleeds onto the cap itself...
  let ring = smoothstep(r * 0.38, r * 0.07, abs(d - r * 1.18))
           * smoothstep(r * 0.94, r * 1.08, d);
  // ...biased below the bubble, fading around the top.
  let below = 0.6 + 0.4 * clamp(-rel.y / max(d, 0.001), -1.0, 1.0);
  return vec3<f32>(dome, hi, ring * below);
}

// --- Rain-on-glass droplet system ---
// Derived from "Heartfelt" by Martijn Steinrucken (BigWings),
// CC BY-NC-SA 3.0, shadertoy.com/view/ltffzl — only the droplet
// mechanics (static beads, sliding drops with trails, gradient-normal
// refraction) are ported; heart/story/lightning/grading are not.

fn n13(p: f32) -> vec3<f32> {
  var p3 = fract(vec3<f32>(p) * vec3<f32>(0.1031, 0.11369, 0.13787));
  p3 = p3 + dot(p3, p3.yzx + 19.19);
  return fract(vec3<f32>((p3.x + p3.y) * p3.z,
                         (p3.x + p3.z) * p3.y,
                         (p3.y + p3.z) * p3.x));
}

fn hash11(t: f32) -> f32 {
  return fract(sin(t * 12345.564) * 7658.76);
}

// Rises 0->1 over [0,b], falls back to 0 over [b,1].
fn sawWave(b: f32, t: f32) -> f32 {
  return smoothstep(0.0, b, t) * smoothstep(1.0, b, t);
}

// Drops sliding down the glass with a sinuous wiggle, leaving a wet trail
// that spawns small droplets behind them. Returns (drop mask, trail mask).
fn dropLayer(uv0: vec2<f32>, t: f32) -> vec2<f32> {
  var uv = uv0;
  uv.y = uv.y + t * 0.75;
  let a = vec2<f32>(6.0, 1.0);
  let grid = a * 2.0;
  var id = floor(uv * grid);
  let colShift = hash11(id.x);
  uv.y = uv.y + colShift;
  id = floor(uv * grid);
  let h = n13(id.x * 35.2 + id.y * 2376.1);
  let st = fract(uv * grid) - vec2<f32>(0.5, 0.0);
  var x = h.x - 0.5;
  var y = uv0.y * 20.0;
  let wiggle = sin(y + sin(y));
  x = x + wiggle * (0.5 - abs(x)) * (h.z - 0.5);
  x = x * 0.7;
  let ti = fract(t + h.z);
  y = (sawWave(0.85, ti) - 0.5) * 0.9 + 0.5;
  let p = vec2<f32>(x, y);
  let d = length((st - p) * a.yx);
  // Only some cells ever run a drop — occasional runners on a sweating
  // glass, not a rain-swept window. (h.y is unused by the original layer.)
  let keep = step(0.5, fract(h.y * 78.233));
  let mainDrop = smoothstep(0.4, 0.0, d) * keep;
  let r = sqrt(smoothstep(1.0, y, st.y));
  let cd = abs(st.x - x);
  var trail = smoothstep(0.23 * r, 0.15 * r * r, cd);
  let trailFront = smoothstep(-0.02, 0.02, st.y - y);
  trail = trail * trailFront * r * r * keep;
  y = uv0.y;
  y = fract(y * 10.0) + (st.y - 0.5);
  let dd = length(st - vec2<f32>(x, y));
  let droplets = smoothstep(0.3, 0.0, dd);
  let m = mainDrop + droplets * r * trailFront * keep;
  return vec2<f32>(m, trail);
}

// Small condensation beads that fade in and out on a fixed grid. Sparser
// than the original rain: only some cells ever grow a bead — this is a
// cold glass sweating, not a window in a storm.
fn staticDrops(uv0: vec2<f32>, t: f32) -> f32 {
  let uv = uv0 * 40.0;
  let id = floor(uv);
  let st = fract(uv) - 0.5;
  let h = n13(id.x * 107.45 + id.y * 3543.654);
  let keep = step(0.62, fract(h.x * 57.31));
  let p = (h.xy - 0.5) * 0.7;
  let d = length(st - p);
  // Mostly persistent beads: they sit on the glass and only slowly swell
  // and shrink, instead of twinkling in and out like rain.
  let fade = 0.55 + 0.45 * sawWave(0.025, fract(t + h.z));
  return smoothstep(0.3, 0.0, d) * fract(h.z * 10.0) * fade * keep;
}

// Combined drop field: static beads + two parallax sliding layers.
// Returns (coverage, trail).
fn rainDrops(uv: vec2<f32>, t: f32, l0: f32, l1: f32, l2: f32) -> vec2<f32> {
  let s = staticDrops(uv, t) * l0;
  let m1 = dropLayer(uv, t) * l1;
  let m2 = dropLayer(uv * 1.85, t) * l2;
  var c = s + m1.x + m2.x;
  c = smoothstep(0.3, 1.0, c);
  return vec2<f32>(c, max(m1.y * l0, m2.y * l1));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let screenUV = ndc * 0.5 + 0.5;        // y-up: uv.y = 1 is the TOP

  let ang = clamp(u.live.x, -1.2, 1.2);  // tan() blows up near +-90 deg
  let lvl = u.live.y;                    // surface height ON SCREEN, 0..1
  let slosh = clamp(u.live.z, 0.0, 1.0);
  let pour = clamp(u.live.w, 0.0, 1.0);
  let phase = u.liveData[0].x;           // integrated bubble phase

  // World-level surface with volume conservation (used both for the liquid
  // itself and to bound the condensation region). While the line spans the
  // full width, the centre height IS the level. Once the remaining beer is a
  // corner wedge (lvl < slope / 2) the line slides down into the gravity-side
  // corner so the wedge area still equals the level — the last of the beer
  // recedes into the corner and drains away smoothly (no snap to a flat film
  // on the bottom).
  let slope = tan(ang) * aspect;
  let m = max(abs(slope), 0.0001);
  let wedgeH = m * (sqrt(2.0 * lvl / m) - 0.5);
  let h0 = select(lvl, wedgeH, lvl < m * 0.5);

  // --- Condensation drop field, computed FIRST in SCREEN-FIXED coords ---
  // The glass is the phone: drops never tilt or slosh with the beer, they
  // cling to the screen and slide toward the screen bottom. The whole beer
  // scene below is then evaluated at coordinates refracted by the drops.
  // Condensation only forms where the cold beer chills the glass, so the
  // field fades out at the liquid surface — the headspace glass stays dry.
  let surfH0 = h0 + slope * (screenUV.x - 0.5);
  let coldMask = smoothstep(surfH0 + 0.01, surfH0 - 0.06, screenUV.y);
  let rainT = t * 0.07;                  // languid — condensation, not rain
  let dl0 = 0.9;                         // static beads
  let dl1 = 0.55;                        // occasional big sliding drops
  let dl2 = 0.3;                         // rare small sliding drops
  let dropUV = vec2<f32>((screenUV.x - 0.5) * aspect, screenUV.y - 0.5) * 1.5;
  let dc = rainDrops(dropUV, rainT, dl0, dl1, dl2) * coldMask;
  let de = vec2<f32>(0.0015, 0.0);
  let dropN = vec2<f32>(
      rainDrops(dropUV + de, rainT, dl0, dl1, dl2).x,
      rainDrops(dropUV + de.yx, rainT, dl0, dl1, dl2).x)
      * coldMask - dc.xx;

  // Refract the entire beer scene through the droplets: every coordinate
  // below derives from this shifted uv, so each drop shows a displaced
  // miniature of the beer behind it. Only the drop field itself uses the
  // undistorted screenUV.
  let uv = screenUV + dropN * 1.0;
  let cx = (uv.x - 0.5) * aspect;        // aspect-corrected, centred x

  // Slosh waves fade only over the very last drop, so an empty glass is not
  // left with a shimmering film.
  let nearEmpty = smoothstep(0.0, 0.03, lvl);
  let waveAmp = (0.004 + slosh * 0.028 + pour * 0.012) * nearEmpty;
  let waves = waveAmp * (sin(cx * 9.0 - t * 3.1) * 0.6
                       + sin(cx * 15.7 + t * 4.3) * 0.3
                       + sin(cx * 23.0 - t * 5.7) * 0.15);

  // Surface line in the (drop-refracted) scene frame — the level math
  // itself (h0, slope) is computed once above the drop block.
  let surfH = h0 + slope * (uv.x - 0.5) + waves;

  // Rigid surface-aligned frame: fu runs along the liquid surface, fv is the
  // perpendicular distance above it. Foam sampled here turns rigidly with the
  // world when the phone rotates — sampling by (y - surface(x)) instead would
  // SHEAR the texture and smear every foam bubble into a diagonal streak.
  let ca = cos(ang);
  let sa = sin(ang);
  let dvec = vec2<f32>(cx, uv.y - h0);
  let fu = dvec.x * ca + dvec.y * sa;
  let fv = -dvec.x * sa + dvec.y * ca;

  let feather = 3.0 / u.resolution.y;
  let inLiquid = smoothstep(surfH, surfH - feather, uv.y);

  // Constant-thickness foam head riding the surface (thickens a touch while
  // pouring, NEVER with fill level). The top edge is built from two scales of
  // slow-drifting blobs so it reads as mounds of foam, not a wavy line; the
  // bottom edge grows sparse soaked fingers that drip into the beer.
  // Constant thickness, always — the head never compresses. Over the last
  // stretch of the drink the whole band slides down past the surface and
  // flows out of the screen with the beer, like it's being drunk with it.
  // While pouring it stays seated on the rising surface instead.
  let foamThick = 0.11 * (1.0 + pour * 0.35);
  let foamShift = (1.0 - smoothstep(0.0, 0.15, lvl)) * (1.0 - pour)
                * (foamThick + 0.06);
  // The band edges are vertical offsets from the surface line, so divide by
  // cos(angle): the thickness you SEE is perpendicular to the surface, and
  // without the correction the foam visibly thins as the phone rotates.
  let vScale = 1.0 / max(ca, 0.35);
  let lumpA = vnoise(vec2<f32>(fu * 5.0, t * 0.06));
  let lumpB = vnoise(vec2<f32>(fu * 13.0 + 4.0, t * 0.1));
  let foamTop = surfH - foamShift
              + foamThick * (0.78 + lumpA * 0.38 + lumpB * 0.16) * vScale;
  let fingerN = vnoise(vec2<f32>(fu * 11.0, t * 0.1 + 7.0));
  let foamBot = surfH - foamShift
              - foamThick * 0.22 * fingerN * fingerN * vScale;
  let inFoam = smoothstep(foamTop, foamTop - feather, uv.y)
             * smoothstep(foamBot - feather, foamBot, uv.y);

  // --- Beer body ---
  var beer = u.color0.rgb;
  // Subtle depth gradient: only slightly darker toward the bottom, stays golden.
  let depth = clamp((surfH - uv.y) * 0.9, 0.0, 1.0);
  beer = beer * (1.0 - depth * 0.2);
  // Slow drifting haze.
  let haze = fbm(vec2<f32>(cx * 2.4 + t * 0.03, uv.y * 2.4 - t * 0.05));
  beer = beer * (0.9 + haze * 0.18);
  // Three parallax layers of rising bubbles, sampled in a world-aligned frame
  // (screen coords rotated by the surface angle) so they rise toward the
  // level surface and the field turns rigidly with the world when the phone
  // rotates instead of flattening out.
  let py = uv.y - 0.5;
  let bp = vec2<f32>(cx * ca + py * sa, py * ca - cx * sa);
  let b1 = bubbles(bp, phase, 11.0, 1.5, 1.0);
  let b2 = bubbles(bp, phase, 18.0, 2.4, 2.0);
  let b3 = bubbles(bp, phase, 28.0, 3.6, 3.0);
  let bubDark = clamp(b1.x + b2.x * 0.75 + b3.x * 0.5, 0.0, 1.0);
  let bubHi = b1.y + b2.y * 0.75 + b3.y * 0.5;
  // A whisper of refraction darkening keeps bubbles visible against the
  // bright beer near the foam; soft rims and glints lift toward white.
  beer = beer * (1.0 - bubDark * 0.1);
  beer = beer + vec3<f32>(1.0, 0.97, 0.85) * bubHi * 0.42;
  beer = mix(beer, vec3<f32>(1.0, 0.98, 0.9), clamp(bubHi * 0.2, 0.0, 1.0));

  // --- Foam head: bright cream packed with fine bubbles ---
  var foam = vec3<f32>(0.0);
  if (inFoam > 0.001) {
    // Surface-aligned frame: rides the surface (and the end-of-drink slide)
    // AND rotates rigidly with it. No drift: a real head sits still on the
    // beer — only the surface itself moves it.
    let fq = vec2<f32>(fu, fv + foamShift * ca);
    let fd = fq;
    // Barely-there large-scale cream billow keeps the head from going flat.
    let billow = vnoise(fd * 7.0);
    var lum = 1.0 + (billow - 0.5) * 0.04;
    // Dense micro-pore field at two fine scales: the matte gray-speckled
    // body of the foam between the visible bubbles. A slow patch noise
    // clusters the pores like the photo instead of uniform pepper.
    let poreCluster = 0.55 + 0.45 * vnoise(fd * 22.0 + 5.0);
    let pores1 = foamPores(fd, 230.0, 1.0);
    let pores2 = foamPores(fd, 400.0, 2.0);
    lum = lum - (pores1 * 0.075 + pores2 * 0.05) * poreCluster;
    // Visible bubbles fade out before the band edges: a dome must never be
    // SLICED by the lumpy top edge or the soaked bottom — half-circles
    // against the dark headspace destroy the illusion instantly. Each layer
    // gets a margin matched to its bubble size, so tiny bubbles still live
    // near the edge while the big domes bow out early.
    let botFade = smoothstep(foamBot, foamBot + 0.02, uv.y);
    let fade1 = smoothstep(foamTop, foamTop - 0.014, uv.y) * botFade;
    let fade2 = smoothstep(foamTop, foamTop - 0.03, uv.y) * botFade;
    let fade3 = smoothstep(foamTop, foamTop - 0.055, uv.y) * botFade;
    // Three dome layers, power-law sized: many small, some medium, few
    // large. Contact shadows land first (they live in the micro-foam)...
    let dm1 = foamDome(fd, 34.0, 0.30, 1.0);
    let dm2 = foamDome(fd, 17.0, 0.62, 2.0);
    let dm3 = foamDome(fd, 11.0, 0.86, 3.0);
    lum = lum - (dm1.z * fade1 * 0.055 + dm2.z * fade2 * 0.065
               + dm3.z * fade3 * 0.075);
    // ...then the smooth caps cover the pores beneath them and lift toward
    // bright, with a soft upper-left highlight on top.
    let cover = clamp(dm1.x * fade1 + dm2.x * fade2 + dm3.x * fade3, 0.0, 1.0);
    lum = mix(lum, 1.05, cover * 0.95);
    lum = lum + dm1.y * fade1 * 0.04 + dm2.y * fade2 * 0.05
              + dm3.y * fade3 * 0.06;
    // Bright and airy: crevices never dip far below base, and the head
    // pulls toward true WHITE — most on the bubble caps — so it reads as
    // real beer foam rather than flat cream.
    foam = u.color1.rgb * clamp(lum, 0.88, 1.1);
    let whiten = clamp((lum - 0.97) * 3.0, 0.0, 0.8);
    foam = mix(foam, vec3<f32>(1.0), whiten);
    // Beer-soaked only near the liquid, creamy white above.
    let fpos = clamp((fv + foamShift * ca) / max(foamThick, 0.001), 0.0, 1.0);
    foam = mix(foam * vec3<f32>(0.94, 0.8, 0.55), foam,
               smoothstep(0.0, 0.22, fpos));
    foam = foam * (0.97 + fpos * 0.07);
  }

  // --- Glass headspace above the foam ---
  var glass = vec3<f32>(0.1, 0.065, 0.032);
  // Faint foam lacing left on the glass.
  let lace = fbm(vec2<f32>(cx * 6.0, uv.y * 6.0 + 3.0));
  glass = glass + vec3<f32>(0.09, 0.08, 0.06) * smoothstep(0.62, 0.88, lace);
  // (The condensation drops refract this along with everything else — the
  // glass is one cold surface in front of the whole scene.)

  // --- Composite bottom-up: glass, then liquid, then foam ---
  var col = glass;
  col = mix(col, beer, inLiquid);
  col = mix(col, foam, inFoam);

  // A subtle wet line where the foam sits on the beer.
  let mdist = uv.y - surfH;
  let glint = 0.7 + 0.3 * sin(cx * 30.0 + t * 2.0);
  col = col + vec3<f32>(1.0, 0.9, 0.6)
            * exp(-mdist * mdist * 90000.0) * glint * 0.15 * nearEmpty;

  // --- Refill stream + splash churn ---
  if (pour > 0.001) {
    // A falling stream is straight, and it TAPERS toward the bottom as the
    // liquid accelerates — no side-to-side snaking.
    let sx = cx;
    let streamW = (0.011 + 0.009 * uv.y) * (0.7 + pour * 0.3);
    let streamMask = smoothstep(streamW, streamW * 0.3, abs(sx))
                   * smoothstep(surfH - 0.01, surfH + 0.05, uv.y) * pour;
    let streamTex = 0.7 + 0.5 * vnoise(vec2<f32>(sx * 160.0, uv.y * 8.0 - t * 14.0));
    col = mix(col, vec3<f32>(1.0, 0.85, 0.45) * streamTex, streamMask * 0.85);
    let spd = length(vec2<f32>(cx * 1.6, uv.y - surfH));
    let churn = 0.6 + 0.8 * vnoise(vec2<f32>(cx * 60.0, surfH * 30.0 + t * 12.0));
    col = col + vec3<f32>(1.0, 0.95, 0.75) * exp(-spd * spd * 300.0) * pour * churn * 0.5;
  }

  // --- Foggy cold glass, wiped clear by the running drops ---
  // No texture blur available, so the misted glass is a subtle milky veil:
  // a luma-lifted desaturated mix. Drops and their trails cut through it,
  // leaving wiped-clean streaks where the beer shows through vividly.
  let wipe = clamp(dc.x * 1.5 + dc.y * 1.2, 0.0, 1.0);
  let fogAmt = 0.22 * (1.0 - wipe) * coldMask;
  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(col, vec3<f32>(luma) * 1.2 + vec3<f32>(0.06), fogAmt);

  // A gentle specular glint inside each drop, keyed off the drop normal —
  // reads better on mobile than refraction alone.
  let glintAmt = clamp((dropN.x + dropN.y) * 5.0, 0.0, 1.0);
  col = col + vec3<f32>(1.0, 0.98, 0.92) * glintAmt * glintAmt * 0.32;

  // Cylinder shading: darker toward the screen edges + a soft vertical highlight.
  let ex = abs(uv.x - 0.5) * 2.0;
  col = col * (1.0 - 0.32 * ex * ex * ex);
  col = col * (1.0 + 0.06 * exp(-(uv.x - 0.72) * (uv.x - 0.72) * 40.0));

  // Vignette + dither.
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.35);
  col = col + (hash21(screenUV * u.resolution.xy) - 0.5) * (1.5 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
