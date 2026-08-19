import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * Everything on the lighter that isn't leather or fire: the perforated
 * windscreen, the hinge post, the knurled flint wheel and its tube, the
 * chrome lip along the top of the case — plus the light the flame throws back
 * down onto all of it.
 *
 * The view covers the whole lighter (hardware on top, leather case below), so
 * the same pass can lay the flame's warm bounce and the windscreen's contact
 * shadow over the leather underneath: light crossing the seam is what stops
 * the two halves reading as two stacked rectangles. Everything above the case
 * is opaque, everything over the case is a thin wash, and the rest is alpha 0,
 * so the room behind shows through.
 *
 * Geometry lives in P-space: x scaled by the aspect, one unit = the view's
 * height, origin bottom-left — so circles stay circles.
 */
export default function LighterHardware({
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={HARDWARE_SHADER}
      paramsSynchronizable={paramsSynchronizable}
      transparent
      {...viewProps}
    />
  );
}

const HARDWARE_SHADER = /* wgsl */ `
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

// ---- Layout, in P-space (one unit = view height, origin bottom-left) ----
const CASE_TOP   = 0.6485;
const CASE_R     = 0.5333;          // right edge of the leather case
const CH_C       = vec2<f32>(0.2606, 0.7879);   // windscreen centre
const CH_H       = vec2<f32>(0.1879, 0.1394);   // windscreen half-extents
const RIM_C      = vec2<f32>(0.2606, 0.9143);
const RIM_H      = vec2<f32>(0.1929, 0.0130);
const POST_C     = vec2<f32>(0.5035, 0.7825);
const POST_H     = vec2<f32>(0.0417, 0.1225);
const WHEEL_C    = vec2<f32>(0.5035, 0.8530);
const WHEEL_R    = 0.0470;
const TUBE_C     = vec2<f32>(0.5035, 0.7330);
const TUBE_H     = vec2<f32>(0.0260, 0.0480);
const WICK       = vec2<f32>(0.2606, 0.8485);
const HOLE_ORIG  = vec2<f32>(0.1280, 0.7000);
const HOLE_STEP  = vec2<f32>(0.0880, 0.0700);
const HOLE_R     = 0.0172;

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

fn sdBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let d = abs(p) - b + vec2<f32>(r);
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

// Satin steel: a cylindrical sheen band across the piece, a kick off the far
// edge, a top-down gradient and fine vertical brushing.
fn steel(P: vec2<f32>, x0: f32, x1: f32, tone: f32, band: f32) -> f32 {
  let ax = clamp((P.x - x0) / max(x1 - x0, 0.0001), 0.0, 1.0);
  let d0 = (ax - band) * 3.4;          // main sheen
  let d1 = (ax - 0.88) * 9.0;          // kick off the far edge
  let d2 = (ax - 0.60) * 4.2;          // the dull side between them
  var m = tone + 0.42 * exp(-d0 * d0) + 0.20 * exp(-d1 * d1)
              - 0.11 * exp(-d2 * d2);
  m = m * (0.80 + 0.26 * P.y);
  // Brushing: long vertical streaks (low y-frequency), plus a coarser second
  // pass so the grain isn't a single regular comb.
  m = m * (1.0 + (vnoise(vec2<f32>(P.x * 180.0, P.y * 0.8)) - 0.5) * 0.26);
  m = m + (vnoise(vec2<f32>(P.x * 52.0, P.y * 0.45)) - 0.5) * 0.055;
  return m;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let P = vec2<f32>(uv.x * aspect, uv.y);
  let aa = 1.5 / u.resolution.y;

  let fl = clamp(u.live.x, 0.0, 1.4);
  let flare = clamp(u.live.z, 0.0, 1.0);
  let phase = u.liveData[0].x;
  let sparkAge = clamp(u.liveData[0].z, 0.0, 1.0);

  let flick = 0.84 + 0.20 * vnoise(vec2<f32>(phase * 2.7, 11.0))
                   + 0.12 * vnoise(vec2<f32>(phase * 8.3, 3.0));
  let lit = fl * flick;
  let warmC = vec3<f32>(1.00, 0.45, 0.12);

  var col = vec3<f32>(0.0);
  var alpha = 0.0;

  // ---- Hinge post (furthest back) ----
  let dPost = sdBox(P - POST_C, POST_H, 0.038);
  let cPost = smoothstep(aa, -aa, dPost);
  if (cPost > 0.001) {
    let m = steel(P, POST_C.x - POST_H.x, POST_C.x + POST_H.x, 0.18, 0.32);
    var c = vec3<f32>(0.42, 0.43, 0.46) * m;
    c = c + warmC * lit * 0.30 * m;
    col = mix(col, c, cPost);
    alpha = max(alpha, cPost);
  }

  // ---- Flint tube under the wheel ----
  let dTube = sdBox(P - TUBE_C, TUBE_H, 0.026);
  let cTube = smoothstep(aa, -aa, dTube);
  if (cTube > 0.001) {
    let m = steel(P, TUBE_C.x - TUBE_H.x, TUBE_C.x + TUBE_H.x, 0.22, 0.30);
    var c = vec3<f32>(0.46, 0.47, 0.50) * m;
    // Machined ring near the top of the tube.
    let rd = (P.y - TUBE_C.y - 0.030) * 90.0;
    let ring = exp(-rd * rd);
    c = c * (1.0 - ring * 0.35) + vec3<f32>(0.9) * ring * 0.10;
    c = c + warmC * lit * 0.28 * m;
    col = mix(col, c, cTube);
    alpha = max(alpha, cTube);
  }

  // ---- Windscreen (the perforated chimney) ----
  let dCh = sdBox(P - CH_C, CH_H, 0.012);
  let cCh = smoothstep(aa, -aa, dCh);
  if (cCh > 0.001) {
    let m = steel(P, CH_C.x - CH_H.x, CH_C.x + CH_H.x, 0.26, 0.28);
    var c = vec3<f32>(0.56, 0.575, 0.62) * m;
    // The far edges of a rolled box turn away from the light.
    let ex = abs(P.x - CH_C.x) / CH_H.x;
    c = c * (1.0 - smoothstep(0.70, 1.0, ex) * 0.50);
    // Shadow the sheet drops under its own rolled top edge.
    c = c * (1.0 - smoothstep(0.885, 0.915, P.y) * 0.35);

    // Holes: fold the plane into the nearest cell of a clamped 4x3 grid.
    let gi = clamp(round((P - HOLE_ORIG) / HOLE_STEP),
                   vec2<f32>(0.0, 0.0), vec2<f32>(3.0, 2.0));
    let hc = HOLE_ORIG + gi * HOLE_STEP;
    let hd = length(P - hc);
    let inHole = smoothstep(HOLE_R, HOLE_R - aa, hd);
    // Punched lip: bright where the rim faces the light, dark opposite.
    let lipD = (hd - HOLE_R) / 0.0065;
    let lip = exp(-lipD * lipD) * (1.0 - inHole);
    let side = normalize(P - hc + vec2<f32>(0.0001, 0.0));
    // Punched from the front: the metal flares out below each hole and casts
    // a shadow above it.
    c = c * (1.0 - lip * 0.40 * side.y);

    // Inside the hole: the flame, seen through the screen.
    var hole = vec3<f32>(0.016, 0.013, 0.012);
    let hGlow = lit * (0.35 + 0.75 * smoothstep(0.66, 0.90, P.y))
              * (1.0 - smoothstep(0.0, 0.11, abs(P.x - WICK.x)) * 0.55);
    hole = hole + vec3<f32>(1.00, 0.42, 0.07) * hGlow * 0.95;
    hole = hole + vec3<f32>(1.00, 0.80, 0.45) * hGlow * hGlow * 0.30;
    c = mix(c, hole, inHole);

    // Bounce off the flame, strongest at the top and toward the wick.
    let warmM = (0.30 + 0.85 * smoothstep(0.68, 0.93, P.y))
              * (1.0 - smoothstep(0.02, 0.20, abs(P.x - WICK.x)) * 0.45);
    c = c + warmC * lit * warmM * 0.42 * (1.0 - inHole);
    c = c + vec3<f32>(1.0, 0.7, 0.4) * flare * 0.25 * warmM;

    // Seam: the windscreen darkens where it drops into the case.
    let seam = smoothstep(0.045, 0.0, P.y - CASE_TOP);
    c = c * (1.0 - seam * 0.45);

    col = mix(col, c, cCh);
    alpha = max(alpha, cCh);
  }

  // ---- Top rim: the rolled edge of the windscreen ----
  let dRim = sdBox(P - RIM_C, RIM_H, 0.010);
  let cRim = smoothstep(aa, -aa, dRim);
  if (cRim > 0.001) {
    let m = steel(P, RIM_C.x - RIM_H.x, RIM_C.x + RIM_H.x, 0.30, 0.27);
    var c = vec3<f32>(0.58, 0.59, 0.63) * m;
    let ex = abs(P.x - RIM_C.x) / RIM_H.x;
    c = c * (1.0 - smoothstep(0.74, 1.0, ex) * 0.40);
    // Highlight along the top fold, shadow under it.
    let topF = smoothstep(RIM_C.y + RIM_H.y - 0.006, RIM_C.y + RIM_H.y, P.y);
    c = c + vec3<f32>(0.80, 0.82, 0.88) * topF * 0.22;
    c = c * (1.0 - smoothstep(RIM_C.y - RIM_H.y * 0.2, RIM_C.y - RIM_H.y, P.y) * 0.35);
    c = c + warmC * lit * 0.40;
    col = mix(col, c, cRim);
    alpha = max(alpha, cRim);
  }

  // ---- Flint wheel: knurled, in front of everything on the right ----
  let wd = length(P - WHEEL_C);
  let cWh = smoothstep(aa, -aa, wd - WHEEL_R);
  if (cWh > 0.001) {
    let rel = (P - WHEEL_C) / WHEEL_R;
    let rn = wd / WHEEL_R;
    let wa = atan2(rel.y, rel.x);
    // Knurling: cut only into the outer band, and sharpened so it reads as
    // milled teeth rather than a spoked wheel.
    let teeth = smoothstep(0.30, 0.80, 0.5 + 0.5 * sin(wa * 26.0));
    let band = smoothstep(0.62, 0.78, rn);
    // Lit from the upper left; the disc darkens fast toward its lower right.
    let lam = clamp(0.50 - rel.x * 0.34 + rel.y * 0.38, 0.10, 0.95);
    var m = lam * (1.0 - band * (0.30 - 0.24 * teeth));
    var c = vec3<f32>(0.34, 0.35, 0.38) * m;
    // Dark outline so the wheel reads as a part in front of the windscreen.
    c = c * (1.0 - smoothstep(0.88, 1.0, rn) * 0.55);
    // Hub and axle screw.
    c = mix(c, vec3<f32>(0.26, 0.26, 0.28) * (0.7 + 0.5 * lam),
            smoothstep(0.46, 0.34, rn));
    c = mix(c, vec3<f32>(0.13, 0.13, 0.15), smoothstep(0.22, 0.12, rn));
    // Bright bite of light along the upper-left of the rim.
    let rimL = smoothstep(0.80, 0.99, rn)
             * clamp(0.5 - rel.x * 0.6 + rel.y * 0.7, 0.0, 1.0);
    c = c + vec3<f32>(0.88, 0.90, 0.96) * rimL * 0.55;
    c = c + warmC * lit * 0.22;
    col = mix(col, c, cWh);
    alpha = max(alpha, cWh);
  }

  // ---- Chrome lip along the top of the case ----
  let lipTop = CASE_TOP;
  let lipBot = CASE_TOP - 0.011;
  let cLip = smoothstep(aa, -aa, sdBox(P - vec2<f32>(CASE_R * 0.5, (lipTop + lipBot) * 0.5),
                                       vec2<f32>(CASE_R * 0.5, (lipTop - lipBot) * 0.5), 0.004))
           * (1.0 - cCh);
  if (cLip > 0.001) {
    let ly = (P.y - lipBot) / (lipTop - lipBot);
    var c = vec3<f32>(0.26, 0.265, 0.28) * (0.45 + 0.85 * ly);
    let lg = (ly - 0.82) * 3.0;
    c = c + vec3<f32>(0.72, 0.74, 0.80) * exp(-lg * lg) * 0.30;
    c = c * (1.0 - smoothstep(0.70, 1.0, abs(P.x - CASE_R * 0.5) / (CASE_R * 0.5)) * 0.55);
    c = c + warmC * lit * 0.22;
    col = mix(col, c, cLip);
    alpha = max(alpha, cLip);
  }

  // ---- Over the leather: the flame's bounce, and the windscreen's shadow ----
  if (P.y < CASE_TOP && P.x < CASE_R) {
    let inCase = smoothstep(aa, -aa,
      sdBox(P - vec2<f32>(CASE_R * 0.5, CASE_TOP * 0.5),
            vec2<f32>(CASE_R * 0.5, CASE_TOP * 0.5), 0.030));
    let lp = (P - WICK) * vec2<f32>(1.0, 0.85);
    let fall = 1.0 / (1.0 + dot(lp, lp) * 30.0);
    let warmA = clamp(fall * lit * 0.34, 0.0, 0.45) * inCase;

    // Contact shadow directly under the windscreen, widening as it falls.
    let sw = CH_H.x + (CASE_TOP - P.y) * 0.6;
    var shA = smoothstep(0.075, 0.0, CASE_TOP - P.y)
            * smoothstep(sw + 0.02, sw - 0.05, abs(P.x - CH_C.x))
            * 0.55;
    // The light comes from the top, so the case falls off toward its foot,
    // and its rolled sides turn away — without this it reads as a flat swatch.
    let ex = abs(P.x - CASE_R * 0.5) / (CASE_R * 0.5);
    shA = shA + smoothstep(0.55, 0.0, P.y / CASE_TOP) * 0.42;
    shA = shA + smoothstep(0.62, 1.0, ex) * 0.40;
    shA = clamp(shA, 0.0, 0.85) * inCase;

    // A soft vertical sheen just inside the left edge — the case is a rounded
    // box, and rounded boxes catch a line of light.
    let sg = (ex - 0.62) * 5.5;
    let sheen = exp(-sg * sg) * (1.0 - step(0.0, P.x - CASE_R * 0.5)) * 0.10 * inCase;

    let overA = clamp(warmA + shA + sheen, 0.0, 1.0);
    if (overA > 0.001) {
      let overC = (warmC * warmA * 1.15 + vec3<f32>(1.0, 0.96, 0.92) * sheen)
                / max(overA, 0.0001);
      let outA = alpha + overA * (1.0 - alpha);
      col = (col * alpha + overC * overA * (1.0 - alpha)) / max(outA, 0.0001);
      alpha = outA;
    }
  }

  // ---- Sparks off the wheel while it is being struck ----
  var sparkC = vec3<f32>(0.0);
  if (sparkAge < 0.999) {
    let t = sparkAge;
    for (var i = 0; i < 10; i = i + 1) {
      let fi = f32(i);
      let r1 = hash21(vec2<f32>(fi, 3.0));
      let r2 = hash21(vec2<f32>(fi, 9.0));
      let ang = -0.30 + r1 * 2.0;
      let spd = 0.20 + r2 * 0.34;
      let pos = WHEEL_C
              + vec2<f32>(cos(ang), sin(ang)) * spd * t
              - vec2<f32>(0.0, 0.42 * t * t);
      let d = P - pos;
      let life = (1.0 - t) * (1.0 - t) * (0.5 + 0.5 * r2);
      sparkC = sparkC + vec3<f32>(1.00, 0.72, 0.32)
             * exp(-dot(d, d) * 40000.0) * life * 1.6;
    }
  }

  let sparkA = clamp(dot(sparkC, vec3<f32>(0.4, 0.4, 0.2)), 0.0, 1.0);
  let outA = clamp(alpha + sparkA, 0.0, 1.0);
  let prem = clamp(col, vec3<f32>(0.0), vec3<f32>(1.6)) * alpha + sparkC;

  return vec4<f32>(clamp(prem, vec3<f32>(0.0), vec3<f32>(1.0)), outA);
}
`;
