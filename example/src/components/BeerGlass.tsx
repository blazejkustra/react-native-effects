import { useMemo } from 'react';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type Props = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'colors' | 'texture'
> & {
  /**
   * Live channel from {@link useBeerPhysics} (12 floats):
   * `u.live = (surfaceAngle rad, surfaceOffset k, sloshEnergy, pourIntensity)`,
   * `u.liveData[0] = (bubblePhase, mode2, mode3, chordMid)`,
   * `u.liveData[1] = (chordHalf, fillFraction, mode1Curvature, foamOut)`.
   */
  paramsSynchronizable: ParamsSynchronizable;
  /** Amber-gold beer body. */
  liquidColor?: ColorInput;
  /** White the head's half-transparent seam bubbles are lifted toward. */
  foamColor?: ColorInput;
};

// The head is a photograph of foam (iBeer's own trick — every procedural
// head read as drawn). Foam over beer, its lacy bottom line at 0.615 of the
// height; the shader keys the photo's beer out. Stock image: clear its
// licence before shipping.
const FOAM_PHOTO = require('../../assets/foam.jpg');

/**
 * The phone as a glass of beer — full-screen amber liquid with parallax layers
 * of rising bubbles, a photographed foam head riding the surface, a
 * glinting meniscus, dark glass headspace with lacing and condensation, and
 * a turbulent refill stream while pouring. The liquid is a signed depth field
 * below a volume-conserving surface solved on the JS side, with the sloshing
 * modes riding on top — so the scene is valid at any angle, including past
 * horizontal when the beer pours out of the top of the screen.
 */
export default function BeerGlass({
  paramsSynchronizable,
  liquidColor = '#e5920a',
  foamColor = '#faf8f3',
  ...rest
}: Props) {
  const colors = useMemo(
    () => [liquidColor, foamColor],
    [liquidColor, foamColor]
  );

  return (
    <ShaderView
      fragmentShader={BEER_SHADER}
      texture={FOAM_PHOTO}
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

// The foam photo: square, its lacy foam-over-beer seam at PHOTO_SEAM of the
// height from the top. It is scaled so the head above the seam is foamThick.
const PHOTO_SEAM: f32 = 0.615;

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

// Signed depth below the liquid surface at p (aspect-corrected screen coords,
// y up): positive inside the beer, negative in the headspace. The hydrostatic
// surface is the line dot(p, dn) = k that the JS side solved for volume
// conservation; the sloshing modes ride on top of it as standing waves across
// the wetted chord (xi = -1 .. 1 wall to wall): the mode-1 curvature term
// bends the rigid tilt into its real sin(pi x / L) shape, mode 2 is the
// symmetric hump, mode 3 the second antisymmetric wave. All three integrate
// to zero across the chord, so the level never breathes while it sloshes.
// A whisper of capillary ripple on top, scaled by the slosh energy.
fn liquidDepth(p: vec2<f32>, dn: vec2<f32>, es: vec2<f32>, t: f32, ripple: f32) -> f32 {
  let k = u.live.y;
  let a2 = u.liveData[0].y;
  let a3 = u.liveData[0].z;
  let sMid = u.liveData[0].w;
  let sHalf = max(u.liveData[1].x, 0.02);
  let c1 = u.liveData[1].z;
  let s = dot(p, es);
  let xi = clamp((s - sMid) / sHalf, -1.2, 1.2);
  let eta = a2 * cos(3.14159 * xi)
          + a3 * sin(4.71239 * xi)
          + c1 * (0.63662 * sin(1.5708 * xi) - xi)
          + ripple * (sin(s * 11.0 - t * 3.7) * 0.6
                    + sin(s * 19.0 + t * 5.1) * 0.3
                    + sin(s * 31.0 - t * 6.9) * 0.15);
  return dot(p, dn) - k - eta;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let screenUV = ndc * 0.5 + 0.5;        // y-up: uv.y = 1 is the TOP

  let ang = u.live.x;                    // sprung surface angle, any value
  let slosh = clamp(u.live.z, 0.0, 1.0);
  let pour = clamp(u.live.w, 0.0, 1.0);
  let phase = u.liveData[0].x;           // integrated bubble phase
  let lvl = u.liveData[1].y;             // fill fraction, 1 = full glass
  let foamOut = u.liveData[1].w;         // 0 seated .. 1 slid out of the mouth

  // World frame in aspect-corrected screen units: dn points DOWN along the
  // effective gravity, es runs along the liquid surface. Because everything
  // below is expressed with dot products against these two vectors, the
  // scene is valid at ANY angle — including past horizontal, when gravity
  // points out of the mouth of the glass and the beer pours out of the top.
  let dn = vec2<f32>(sin(ang), -cos(ang));
  let es = vec2<f32>(cos(ang), sin(ang));

  // Ripples fade only over the very last drop, so an empty glass is not
  // left with a shimmering film.
  let nearEmpty = smoothstep(0.0, 0.03, lvl);
  let ripple = (0.0015 + slosh * 0.012 + pour * 0.006) * nearEmpty;

  // --- Condensation drop field, computed FIRST in SCREEN-FIXED coords ---
  // The glass is the phone: drops never tilt or slosh with the beer, they
  // cling to the screen and slide toward the screen bottom. The whole beer
  // scene below is then evaluated at coordinates refracted by the drops.
  // Condensation only forms where the cold beer chills the glass, so the
  // field fades out at the liquid surface — the headspace glass stays dry.
  let pS = vec2<f32>((screenUV.x - 0.5) * aspect, screenUV.y);
  let depthS = liquidDepth(pS, dn, es, t, 0.0);
  let coldMask = smoothstep(-0.01, 0.06, depthS);
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
  let p = vec2<f32>(cx, uv.y);

  // Signed depth below the surface (positive = inside the beer) and the
  // along-surface coordinate. Every band, mask and texture below hangs off
  // these two numbers.
  let depth = liquidDepth(p, dn, es, t, ripple);
  let s = dot(p, es);

  let feather = 3.0 / u.resolution.y;
  let inLiquid = smoothstep(0.0, feather, depth);

  // Constant-thickness foam head riding the surface (never with fill level
  // or the pour). The top edge is built from two scales of
  // slow-drifting blobs so it reads as mounds of foam, not a wavy line; the
  // bottom edge is the photo's own lacy seam.
  // Thickness is measured PERPENDICULAR to the surface, so it stays the same
  // on screen at any rotation. Once the beer is gone the whole band slides
  // past the surface and out of the mouth after it, at the unhurried pace
  // the JS side sets (foamOut), like it is being drunk with it; a pour
  // brings it back onto the rising surface.
  let foamThick = 0.17;
  let foamShift = smoothstep(0.0, 1.0, foamOut) * (foamThick + 0.06);
  let dF = depth - foamShift;            // depth below the (shifted) band seat
  let lumpA = vnoise(vec2<f32>(s * 3.5, t * 0.05));
  let lumpB = vnoise(vec2<f32>(s * 9.0 + 4.0, t * 0.08));
  // Big soft mounds on top of the foam MASS, like a head that has been
  // poured rather than levelled.
  let topH = foamThick * (0.55 + lumpA * 0.62 + lumpB * 0.22);

  // --- Beer body ---
  var beer = u.color0.rgb;
  // Subtle depth gradient: only slightly darker toward the bottom, stays golden.
  let deep = clamp(depth * 0.9, 0.0, 1.0);
  beer = beer * (1.0 - deep * 0.2);
  // Slow drifting haze.
  let haze = fbm(vec2<f32>(cx * 2.4 + t * 0.03, uv.y * 2.4 - t * 0.05));
  beer = beer * (0.9 + haze * 0.18);
  // Three parallax layers of rising bubbles, sampled in the world frame
  // (along the surface, up against gravity) so they rise toward the level
  // surface and the field turns rigidly with the world when the phone
  // rotates instead of flattening out.
  let bp = vec2<f32>(s, -dot(p, dn));
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

  // --- Foam head ---
  // The photo, sampled in the surface-aligned frame that rides the beer:
  // its seam sits on the band seat, it mirrors sideways so it tiles without
  // a join, and the big mounds above cut its silhouette against the glass.
  // Yellowness (and darkness: bubble rims over beer) keys the photo's own
  // beer out — foam is ~0.13 red-minus-blue, beer ~0.85 — so its lacy seam
  // of half-transparent bubbles is what sits on OUR beer.
  let photoH = foamThick / PHOTO_SEAM;
  let puv = vec2<f32>(s / photoH + 0.5, PHOTO_SEAM + dF / photoH);
  let pc = textureSampleLevel(tex, samp, puv, 0.0).rgb;
  let plum = dot(pc, vec3<f32>(0.299, 0.587, 0.114));
  let beerness = max(smoothstep(0.35, 0.6, pc.r - pc.b),
                     1.0 - smoothstep(0.3, 0.55, plum));
  let topMask = smoothstep(-topH, -topH + 0.006, dF);
  // Nothing of the photo below its seam band (the photo's beer has bright
  // droplets that would survive the key as specks in ours).
  let seamCut = smoothstep(0.014, 0.008, dF);
  // While the band is sliding (out of the mouth, or back up through a
  // pour) only what is above the beer shows: the head builds on the
  // surface instead of showing through the liquid.
  let aboveBeer = smoothstep(0.03, 0.005, depth);
  let foamA = topMask * seamCut * aboveBeer * (1.0 - beerness);
  // Half-keyed seam bubbles lose their yellow so they read as translucent
  // white over our beer, not the photo's.
  let foam = mix(pc, u.color1.rgb * min(plum * 1.15, 1.0), beerness);
  // The seam's keyed pixels must land on beer, never on the dark glass: run
  // the beer a little way up under the head.
  let seamFill = smoothstep(-0.03, -0.02, dF) * seamCut * topMask;

  // --- Glass headspace above the foam ---
  var glass = vec3<f32>(0.1, 0.065, 0.032);
  // Faint foam lacing left on the glass.
  let lace = fbm(vec2<f32>(cx * 6.0, uv.y * 6.0 + 3.0));
  glass = glass + vec3<f32>(0.09, 0.08, 0.06) * smoothstep(0.62, 0.88, lace);
  // (The condensation drops refract this along with everything else — the
  // glass is one cold surface in front of the whole scene.)

  // --- Composite bottom-up: glass, then liquid, then foam ---
  // Thin film: when the phone is pitched back the beer lies on the back of
  // the box and thins to nothing at its visible edge, so that edge is a
  // paler wedge of beer instead of a hard line.
  let film = clamp(depth / 0.0005, 0.0, 1.0);
  let thinBeer = mix(beer, vec3<f32>(1.0, 0.9, 0.62), 0.45);
  var col = glass;
  col = mix(col, mix(thinBeer, beer, film), inLiquid);
  col = mix(col, beer, seamFill);
  col = mix(col, foam, foamA);

  // A subtle wet line where the foam sits on the beer.
  let glint = 0.7 + 0.3 * sin(s * 30.0 + t * 2.0);
  col = col + vec3<f32>(1.0, 0.9, 0.6)
            * exp(-depth * depth * 90000.0) * glint * 0.15 * nearEmpty;

  // --- Refill stream + splash churn ---
  if (pour > 0.001) {
    // The stream enters at the top centre of the glass and falls along
    // WORLD down — a falling stream is straight, it tapers as the liquid
    // accelerates, and it hits the surface wherever gravity takes it.
    let rel = p - vec2<f32>(0.0, 1.0);
    let along = dot(rel, dn);
    let across = dot(rel, es);
    let inStream = smoothstep(-0.01, 0.01, along);
    let streamW = (0.011 + 0.009 * (1.0 - clamp(along, 0.0, 1.0)))
                * (0.7 + pour * 0.3);
    let streamMask = smoothstep(streamW, streamW * 0.3, abs(across))
                   * smoothstep(0.01, -0.05, depth) * inStream * pour;
    let streamTex = 0.7 + 0.5 * vnoise(vec2<f32>(across * 160.0, along * 8.0 - t * 14.0));
    col = mix(col, vec3<f32>(1.0, 0.85, 0.45) * streamTex, streamMask * 0.85);
    let spd = length(vec2<f32>(across * 1.6, depth));
    let churn = 0.6 + 0.8 * vnoise(vec2<f32>(across * 60.0, s * 30.0 + t * 12.0));
    col = col + vec3<f32>(1.0, 0.95, 0.75) * exp(-spd * spd * 300.0)
              * pour * churn * 0.5 * inStream;
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
