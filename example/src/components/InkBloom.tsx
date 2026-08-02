import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';
import type { ColorInput, ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * The colour the pigment *transmits*. Absorption is its complement, so a
   * blue-violet ink eats red and green and leaves blue: dense dye reads almost
   * black, thin dye tints the water toward this hue.
   */
  inkColor?: ColorInput;
  /** Colour of the lit water the ink is suspended in. */
  waterColor?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /**
   * Optical density of the dye — the Beer-Lambert multiplier on concentration.
   * Higher makes the same amount of ink darker, it does not create more ink.
   * Default: 1.0
   */
  intensity?: number;
  /** Strength of the multi-scale turbulence that curls the filaments. Default: 1.0 */
  turbulence?: number;
  /** Brightness of the water volume the dye is lit against. Default: 1.0 */
  waterLight?: number;
  /**
   * Backward-advection step count, 6-32. This is the performance dial: cost per
   * pixel is linear in it. Because every step is an exactly area-preserving map,
   * lowering it costs a little path fidelity but never any dye — conservation is
   * the same at 8 steps as at 32. 8-10 for low-end devices, 24+ for a hero shot.
   * Default: 13
   */
  detail?: number;
  /** Size of the initial drop. Default: 1.0 */
  dropSize?: number;
  /** Seconds one bloom lasts before a fresh drop falls. Default: 15 */
  duration?: number;
  /** Strength of the vortex ring that mushrooms the drop. Default: 1.0 */
  swirl?: number;
  /**
   * Molecular diffusivity. Controls how fast the dye *spreads*, never how fast
   * it disappears — total dye is conserved, so raising this makes the bloom go
   * pale sooner only because the same pigment covers more water. Default: 1.0
   */
  diffusion?: number;
  /**
   * Optional live channel: `(progress01, dropX, dropY, 1)`. When the 4th float
   * is 1 the shader stops running its own cycle and takes the bloom's age from
   * `progress01` and the drop origin from `dropX`/`dropY` (both 0..1 in UV
   * space, y measured from the BOTTOM). Lets a gesture restart the bloom.
   */
  paramsSynchronizable?: ParamsSynchronizable;
};

export default function InkBloom({
  inkColor = '#3a2fa8',
  waterColor = '#3fb0c8',
  speed = 1.0,
  intensity = 1.0,
  turbulence = 1.0,
  waterLight = 1.0,
  detail = 13,
  dropSize = 1.0,
  duration = 15,
  swirl = 1.0,
  diffusion = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [inkColor, waterColor], [inkColor, waterColor]);
  const params = useMemo(
    () => [
      intensity,
      turbulence,
      waterLight,
      detail,
      dropSize,
      duration,
      swirl,
      diffusion,
    ],
    [
      intensity,
      turbulence,
      waterLight,
      detail,
      dropSize,
      duration,
      swirl,
      diffusion,
    ]
  );

  return (
    <ShaderView
      fragmentShader={INK_BLOOM_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const INK_BLOOM_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const TAU_F = 6.2831853;

// Total "flow time" one bloom travels through. The mapping from wall-clock age
// to flow time saturates (see flowClock), which is what makes the bloom
// decelerate the way a real drop does once viscosity takes over -- and keeps the
// backward integration step bounded no matter how old the bloom is.
const SPAN = 2.2;

// Four incommensurate, non-axis-aligned wave directions. Irrational-ish angles
// and frequencies keep the streamfunction quasi-periodic, so no grid ever
// becomes readable.
const D1 = vec2<f32>( 0.9239,  0.3827);
const D2 = vec2<f32>(-0.3090,  0.9511);
const D3 = vec2<f32>( 0.4848, -0.8746);
const D4 = vec2<f32>(-0.8090, -0.5878);
const D5 = vec2<f32>( 0.6691,  0.7431);

fn hash11(x: f32) -> f32 {
  var p = fract(x * 0.1031);
  p = p * (p + 33.33);
  p = p * (p + p);
  return fract(p);
}

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + vec3<f32>(dot(p3, vec3<f32>(p3.y, p3.z, p3.x) + 33.33));
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

// Per-bloom randomised state. Re-rolled every cycle (or on every tap) so two
// blooms are never the same shape and the effect cannot read as a loop.
struct Bloom {
  origin: vec2<f32>,
  asym:   f32,
  turb:   f32,
  swirl:  f32,
  ph:     vec4<f32>,
  wob:    vec2<f32>,
};

// ---------------------------------------------------------------------------
// The flow map, as a composition of exactly area-preserving elementary maps
// ---------------------------------------------------------------------------
// Being divergence-free is not enough on its own: stepping a divergence-free
// field with explicit Euler leaves a per-step Jacobian of 1 + h^2*det(grad v),
// which compounds over a dozen-odd steps into tens of percent of spurious
// compression -- dye would quietly evaporate. So the field is never integrated.
// It is *factorised* into pieces whose exact flows are known in closed form and
// whose Jacobians are identically 1:
//
//   * a regularised point vortex is a rigid rotation about its centre, because
//     |p - c| is invariant along its own streamlines;
//   * a streamfunction psi(dir.p) is a pure shear along e = dir-perp, because
//     the displacement is parallel to e and dir.p is invariant under it;
//   * buoyancy/drift is a rigid translation.
//
// Applying them in sequence (Lie splitting) gives a map with det = 1 exactly,
// at any step size. Splitting only perturbs the *path*, never the area -- so the
// dye density carried by this map is conserved by construction.

// Rigid rotation of p about c, plus the exact Jacobian applied to dv. The angle
// is atan(w) rather than w, obtained without trig from (I + wJ)/sqrt(1+w^2)
// whose determinant is 1 identically. The differential part of the rotation
// (inner fluid turns faster than outer) is the rank-1 term added to dv before
// the spin -- it is what winds the dye into spirals, and it is J-orthogonal to d
// so it too has determinant exactly 1.
fn spin(p: vec2<f32>, dv: vec2<f32>, c: vec2<f32>, g: f32, a2: f32, h: f32) -> vec4<f32> {
  let d = p - c;
  let idd = 1.0 / (dot(d, d) + a2);
  let w = h * g * idd;
  let inv = inverseSqrt(1.0 + w * w);
  let si = w * inv;
  let mu = -2.0 * w * inv * inv * idd;
  let jd = vec2<f32>(-d.y, d.x);
  let dvs = dv + jd * (mu * dot(d, dv));
  return vec4<f32>(
    c + vec2<f32>(inv * d.x - si * d.y, si * d.x + inv * d.y),
    vec2<f32>(inv * dvs.x - si * dvs.y, si * dvs.x + inv * dvs.y)
  );
}

// Pure shear from psi = (amp/f) * sin(f*dir.p + phase). The displacement is
// along e (perpendicular to dir) so dir.p is untouched and the map is exact for
// any h; its Jacobian I + (alpha e) outer dir has determinant 1 because e.dir = 0.
fn shear(p: vec2<f32>, dv: vec2<f32>, dir: vec2<f32>, f: f32, amp: f32, phase: f32, h: f32) -> vec4<f32> {
  let th = f * dot(dir, p) + phase;
  let e = vec2<f32>(dir.y, -dir.x);
  return vec4<f32>(
    p + e * (h * amp * cos(th)),
    dv + e * (-h * amp * f * sin(th) * dot(dir, dv))
  );
}

// One step of the flow map at flow time s with (signed) step h, carrying the
// position and the perturbation vector together. Pass a negative h to run the
// map backwards, which is what the fragment needs.
fn flowStep(pd: vec4<f32>, s: f32, h: f32, b: Bloom) -> vec4<f32> {
  var st = pd;
  let k = clamp(s / SPAN, 0.0, 1.25);

  // --- primary vortex ring: the mushroom cap ---
  // A counter-rotating pair descends under its own induction, expands and
  // weakens: the cross-section of the ring a real ink drop rolls up into. Its
  // strength ramps in so the drop falls as a compact slug before it rolls up.
  let ringY = b.origin.y - 0.50 * k;
  let ringR = 0.062 + 0.095 * k;
  let acore = 0.055 + 0.075 * k;
  let a2 = acore * acore;
  let g = b.swirl * 0.34 * (0.10 + 0.90 * smoothstep(0.04, 0.42, k))
        * (1.0 - 0.45 * min(k, 1.0)) * 2.0 * acore;

  // Nothing in a real bloom is mirror-symmetric -- offset the pair slightly.
  let asym = b.asym;
  let cL = vec2<f32>(b.origin.x - ringR * (1.0 + 0.13 * asym), ringY + 0.020 * asym);
  let cR = vec2<f32>(b.origin.x + ringR * (1.0 - 0.09 * asym), ringY - 0.016 * asym);

  st = spin(st.xy, st.zw, cL, -g * (1.0 - 0.16 * asym), a2, h);
  st = spin(st.xy, st.zw, cR,  g * (1.0 + 0.20 * asym), a2, h);

  // --- shed secondary vortices: the asymmetric trailing tendrils ---
  let wk = smoothstep(0.08, 0.50, k) * (1.0 - 0.5 * min(k, 1.0));
  let aw2 = 0.0045 + 0.0060 * k;
  let wA = vec2<f32>(b.origin.x + b.wob.x * (0.10 + 0.07 * k), b.origin.y - 0.32 * k + 0.05 * b.wob.y);
  let wB = vec2<f32>(b.origin.x - b.wob.y * (0.08 + 0.08 * k), b.origin.y - 0.17 * k - 0.04 * b.wob.x);
  st = spin(st.xy, st.zw, wA, b.swirl * 0.030 * wk * sign(b.wob.y + 0.001), aw2, h);
  st = spin(st.xy, st.zw, wB, b.swirl * 0.024 * wk * sign(0.001 - b.wob.x), aw2, h);

  // --- multi-scale turbulence: fractal curling of every edge ---
  let td = b.turb * (0.55 + 0.45 * exp(-0.30 * s));
  st = shear(st.xy, st.zw, D1,  5.9, 0.070 * td, b.ph.x + s * 0.22, h);
  st = shear(st.xy, st.zw, D2, 11.3, 0.050 * td, b.ph.y + s * 0.33, h);
  st = shear(st.xy, st.zw, D3, 21.7, 0.040 * td, b.ph.z + s * 0.45, h);
  st = shear(st.xy, st.zw, D4, 38.9, 0.024 * td, b.ph.w + s * 0.62, h);
  st = shear(st.xy, st.zw, D5, 71.3, 0.013 * td, b.ph.z * 1.7 + s * 0.85, h);

  // --- the drop's own momentum, plus a slow tank drift so late ink never
  //     freezes into a still frame. A rigid translation: det 1, dv untouched. ---
  let plunge = -0.17 * exp(-s * 1.6) - 0.007;
  let drift = 0.006 * sin(s * 0.33 + b.ph.x);
  return vec4<f32>(st.xy + vec2<f32>(drift, plunge) * h, st.zw);
}

// ---------------------------------------------------------------------------
// Conserved dye
// ---------------------------------------------------------------------------
// There is no decay term anywhere below this line. Concentration is the initial
// dye distribution read through the inverse flow map, smoothed by molecular
// diffusion. Both operations conserve the integral of concentration exactly:
//
//   * the flow map is area-preserving (every velocity term is divergence-free),
//     so  integral of  c0(Phi^-1x) dx = integral of  c0(y) |det dPhi| dy = integral of  c0(y) dy;
//   * the diffusion kernel is mass-normalised (see 'blob'), so convolving with
//     it moves dye around but never destroys any.
//
// Diffusion is applied in *initial* space, where it is anisotropic. Pulling an
// isotropic physical kernel of width sigma back through the map gives a kernel
// with covariance sigma^2 (FTF)^-1; since det F = 1 its two widths are
// sigma*lambda and sigma/lambda, where lambda is the local stretch. The
// backward-advected perturbation vector 'dv' supplies both: it aligns with the
// wide axis and its length IS lambda. So one vector carried through the loop
// gives the whole kernel.
struct Kern {
  ax: vec2<f32>,   // unit long axis of the pulled-back kernel, in initial space
  a2: f32,         // (sigma * lambda)^2 -- wide, along ax
  b2: f32,         // (sigma / lambda)^2 -- narrow, across ax
};

// One Gaussian parcel of dye, convolved with the anisotropic kernel. The
// amplitude r^2 / (A*B) is exactly what keeps pi*A*B*amp = pi*r^2 constant, so
// this parcel carries the same mass at every age. It is also the entire source
// of filament thinning: a parcel stretched 30x gets A ~= 30*sigma and its peak
// falls by the same factor, with the dye still there, just spread thinner.
fn blob(d: vec2<f32>, r: f32, w: f32, kern: Kern) -> f32 {
  let a2 = r * r + kern.a2;
  let b2 = r * r + kern.b2;
  let du = dot(d, kern.ax);
  let dp = d.x * kern.ax.y - d.y * kern.ax.x;
  return w * r * r * inverseSqrt(a2 * b2) * exp(-(du * du / a2 + dp * dp / b2));
}

// The dye distribution the instant the drop lands: a main parcel, three
// satellite ligaments (a drop never enters as one clean sphere) and a short
// sinuous column dragged down from the surface. Every piece is a mass-conserving
// parcel, so the total is a fixed number of "grams of dye" for the whole life of
// the bloom.
fn inkAt(p: vec2<f32>, c: vec2<f32>, rad: f32, rot: vec2<f32>, kern: Kern) -> f32 {
  let d = p - c;
  let rp = vec2<f32>(-rot.y, rot.x);

  let o1 = vec2<f32>( 1.45,  0.35);
  let o2 = vec2<f32>(-1.25, -0.90);
  let o3 = vec2<f32>( 0.30,  1.75);
  let e1 = vec2<f32>(dot(rot, o1), dot(rp, o1)) * rad;
  let e2 = vec2<f32>(dot(rot, o2), dot(rp, o2)) * rad;
  let e3 = vec2<f32>(dot(rot, o3), dot(rp, o3)) * rad;

  var s = blob(d, rad, 1.0, kern);
  s = s + blob(d - e1, rad * 0.44, 0.86, kern);
  s = s + blob(d - e2, rad * 0.34, 0.76, kern);
  s = s + blob(d - e3, rad * 0.28, 0.64, kern);

  // The column the drop drags down through the surface, leaning per bloom.
  let cw = rad * 0.55 * rot.x;
  let t1 = vec2<f32>( cw,        rad * 1.25);
  let t2 = vec2<f32>(-cw * 1.4,  rad * 2.30);
  let t3 = vec2<f32>( cw * 0.6,  rad * 3.40);
  s = s + blob(d - t1, rad * 0.32, 0.80, kern);
  s = s + blob(d - t2, rad * 0.25, 0.60, kern);
  s = s + blob(d - t3, rad * 0.20, 0.42, kern);

  return s;
}

// Wall-clock age -> flow time. Saturating: the drop travels fast on entry and
// asymptotically stalls, with a small linear residue so the cloud keeps creeping
// instead of locking in place.
fn flowClock(age: f32) -> f32 {
  return SPAN * (1.0 - exp(-age * 0.45)) + age * 0.048;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  // Aspect-corrected, centred, in units of screen height. Circles stay circular.
  let p0 = vec2<f32>(ndc.x * 0.5 * aspect, ndc.y * 0.5);

  let density   = max(u.params0.x, 0.0);
  let turbP     = u.params0.y;
  let waterL    = max(u.params0.z, 0.0);
  let stepsP    = u.params0.w;
  let dropSize  = clamp(u.params1.x, 0.25, 3.0);
  let cycle     = max(u.params1.y, 3.0);
  let swirlP    = u.params1.z;
  let diffP     = max(u.params1.w, 0.05);

  // Either the shader runs its own bloom cycle, or a live channel drives the age
  // and the drop origin (tap to drop).
  let driven = clamp(u.live.w, 0.0, 1.0);
  let age = mix(u.time.x % cycle, clamp(u.live.x, 0.0, 1.0) * cycle, driven);
  let seed = mix(floor(u.time.x / cycle), u.live.y * 137.13 + u.live.z * 61.7, driven);

  let r1 = hash11(seed * 1.371 + 3.11);
  let r2 = hash11(seed * 2.713 + 9.47);
  let r3 = hash11(seed * 0.917 + 17.31);
  let r4 = hash11(seed * 3.301 + 5.29);
  let r5 = hash11(seed * 1.913 + 23.77);

  var b: Bloom;
  b.origin = mix(
    vec2<f32>((r1 - 0.5) * 0.16 * min(aspect, 1.2), 0.36 + (r5 - 0.5) * 0.04),
    vec2<f32>((u.live.y - 0.5) * aspect, u.live.z - 0.5),
    driven
  );
  b.asym  = (r2 - 0.5) * 2.0;
  b.turb  = turbP;
  b.swirl = swirlP;
  b.ph    = vec4<f32>(r1, r3, r4, r2) * TAU_F;
  b.wob   = vec2<f32>(r3 - 0.5, r4 - 0.5) * 2.0;

  // ---- backward advection ----------------------------------------------
  // Integrate this pixel's parcel BACKWARDS through the divergence-free field,
  // from now to the moment the drop landed, then read the initial dye there.
  // Stretching, thinning and filamenting are consequences of the flow map, not
  // of any noise applied to a static shape.
  //
  // Alongside the position we carry a perturbation vector through the linearised
  // dynamics. In a chaotic flow it aligns with the dominant stretching direction
  // within a few steps, so its length is the local flow-map stretch factor --
  // a finite-time Lyapunov measure for the price of one dot product per term.
  // Sedimentation. Pigment is denser than water, so a spent cloud keeps sinking
  // long after the vortex ring has died; over a bloom's life it settles out of
  // the bottom of the frame. This is the only reason the visible dye eventually
  // goes to zero -- it is a rigid translation of the whole field (det 1, dv
  // untouched), so it removes dye from *view* without destroying any of it.
  let sink = 0.0017 * age * age;

  let sNow = flowClock(age);
  let n = i32(clamp(stepsP, 6.0, 32.0));
  let h = sNow / f32(n);
  var st = vec4<f32>(p0 + vec2<f32>(0.0, sink), 0.7071, 0.7071);
  for (var i = 0; i < 32; i = i + 1) {
    if (i >= n) { break; }
    let s = sNow - (f32(i) + 0.5) * h;
    st = flowStep(st, s, -h, b);
  }
  let q = st.xy;
  let dv = st.zw;

  // Static roughness baked into the t = 0 drop, so the boundary the flow stretches
  // is already irregular. Time-independent: the shape at t = 0 never changes.
  let w1 = vec2<f32>(vnoise(q * 28.0 + 11.3), vnoise(q * 28.0 + 41.7)) - 0.5;
  let w2 = vec2<f32>(vnoise(q * 70.0 + 5.1), vnoise(q * 70.0 + 71.9)) - 0.5;
  let qw = q + w1 * 0.0075 + w2 * 0.0030;

  // Pulled-back diffusion kernel. sigma grows as sqrt(t) -- Fickian -- and the
  // stretch splits it into a long axis and a short one. Nothing here scales the
  // dye down; the amplitude drop inside 'blob' is purely the mass-normalisation
  // of a widening kernel.
  // The axis must come from the TRUE length of dv (it can briefly contract
  // below 1 before it aligns); lambda is clamped separately, because det F = 1
  // guarantees the real stretch is never below 1 even when dv has not aligned yet.
  let dlen = length(dv);
  let lam = clamp(dlen, 1.0, 260.0);
  let sigP = diffP * (0.0016 + 0.0125 * sqrt(max(age, 0.0)));
  var kern: Kern;
  kern.ax = select(vec2<f32>(0.7071, 0.7071), dv / dlen, dlen > 1.0e-5);
  kern.a2 = min(sigP * sigP * lam * lam, 0.05);
  kern.b2 = sigP * sigP / (lam * lam);

  // Internal texture of the dye: ink is already streaky the instant it enters,
  // and stretching pulls that texture into dozens of overlapping striations.
  // Mean-1 multiplicative, so it redistributes dye without creating any. It
  // fades once the kernel is wider than the striation scale.
  let tex = vnoise(q * 46.0 + 3.3) * 0.45 + vnoise(q * 95.0 + 17.7) * 0.55;
  let texAmp = 0.55 * exp(-kern.a2 * 260.0) * smoothstep(0.0, 0.8, age);
  let striate = 1.0 - texAmp + texAmp * 2.0 * tex;

  let rot = vec2<f32>(cos(r4 * TAU_F), sin(r4 * TAU_F));
  // The only term that changes total dye: the drop physically entering the
  // water over the first fifth of a second. After that the integral is flat.
  let entry = smoothstep(0.0, 0.20, age);
  let conc = max(inkAt(qw, b.origin, 0.055 * dropSize, rot, kern), 0.0)
           * striate * entry;

  // ---- the water the ink is in ------------------------------------------
  // A lit volume, not a black void: keyed from above, falling off with depth,
  // crossed by slow broad light shafts, and framed by a soft tank vignette that
  // reaches true zero so the panel still has real black at the edges.
  let t = u.time.x;
  // The tank framing follows the panel, not the aspect-corrected plane --
  // otherwise a wide layout turns the medium into a circular spotlight. Only the
  // dye lives in aspect-corrected space, so circles still stay circular.
  let wq = (uv - vec2<f32>(0.5, 0.50)) * vec2<f32>(min(aspect, 1.0), 1.0);
  let vg = exp(-(wq.x * wq.x * 2.4 + wq.y * wq.y * 2.4));
  let vign = max(0.0, vg - 0.30) * 1.4286;
  let shafts = 0.80
    + 0.20 * sin(uv.x * 5.3 * aspect - uv.y * 1.7 + t * 0.19)
    + 0.12 * sin(uv.x * 9.1 * aspect + uv.y * 3.1 - t * 0.11);
  let fromAbove = mix(0.44, 1.0, smoothstep(-0.10, 1.02, uv.y));
  let lightAmt = vign * shafts * fromAbove * waterL;
  // Real water is not a pure hue -- a little broadband white keeps it from
  // reading as a coloured gel.
  let waterRGB = mix(u.color1.rgb, vec3<f32>(1.0), 0.14) * lightAmt;

  // ---- subtractive dye ---------------------------------------------------
  // Beer-Lambert. The pigment REMOVES light from the water behind it; it never
  // adds any. Absorption per channel is the complement of the ink's transmission
  // colour, plus a broadband floor so a dense core goes almost black rather than
  // glowing in its own hue. Consequence: brightness falls monotonically with
  // concentration, so the thin leading edge is the *lightest* part of the ink
  // and sits closest to the water colour -- the opposite of a bright rim.
  let tau = conc * density * 3.6;
  let kAbs = vec3<f32>(0.32) + 2.9 * (vec3<f32>(1.0) - clamp(u.color0.rgb, vec3<f32>(0.0), vec3<f32>(1.0)));
  let trans = exp(-tau * kAbs);
  // A little single scattering so the dye has body instead of reading as a
  // silhouette. Albedo is low enough that ink is always darker than the water
  // it displaces, at every concentration.
  let scat = u.color0.rgb * lightAmt * (1.0 - exp(-tau * 1.1)) * 0.34;

  var col = waterRGB * trans + scat;

  col = col / (1.0 + col * 0.35);
  // Dither: flat water gradients would otherwise band on 8-bit output.
  col = col + vec3<f32>((hash21(uv * u.resolution.xy) - 0.5) * (1.8 / 255.0));

  return vec4<f32>(max(col, vec3<f32>(0.0)), 1.0);
}
`;
