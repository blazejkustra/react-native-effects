import { useMemo } from 'react';
import type { ImageSourcePropType, ViewProps } from 'react-native';
import {
  ShaderImageView,
  type ColorInput,
  type ParamsSynchronizable,
} from 'react-native-effects';

/**
 * Canvas padding around the sticker rect, as a fraction of the sticker's
 * longest edge. It has to cover two things: the fold-back overhang (the curl
 * reaches up to one roll radius PAST the stuck edge once it wraps beyond
 * vertical) and the cast shadow when the sticker is lifted.
 */
export const STICKER_PAD = 0.28;

export type StickerLayout = {
  /** Canvas size in points — what the wrapping view must be. */
  canvasWidth: number;
  canvasHeight: number;
  /** Sticker rect size in points, inset inside the canvas. */
  width: number;
  height: number;
  /** Padding as a fraction of the canvas, handed to the shader. */
  padX: number;
  padY: number;
};

/**
 * Sizes a sticker of `size` points on its longest edge, given the source
 * image's aspect ratio, and returns both the canvas box and the shader's
 * padding fractions. Kept synchronous (rather than waiting on the decoded
 * image) so a sticker never reflows under the finger.
 */
export function stickerLayout(size: number, aspect: number): StickerLayout {
  const width = aspect >= 1 ? size : size * aspect;
  const height = aspect >= 1 ? size / aspect : size;
  const pad = size * STICKER_PAD;
  const canvasWidth = width + pad * 2;
  const canvasHeight = height + pad * 2;
  return {
    canvasWidth,
    canvasHeight,
    width,
    height,
    padX: pad / canvasWidth,
    padY: pad / canvasHeight,
  };
}

/**
 * Seed for the live channel — a flat, fully stuck sticker sitting still.
 * `wMax` near zero means "no curl": the roll radius goes to infinity and every
 * point stays in the plane.
 */
export const STICKER_LIVE_REST = [
  1, // front — contact line, 0 = nothing stuck yet, 1 = fully pressed down
  Math.PI / 2, // peel axis angle in local UV (PI/2 = rolls bottom -> top)
  0.02, // rMin — tightest roll radius the material can take
  0.02, // wMax — wrap angle at the free edge (radians)
  0, // cone — 0 = straight contact line, 1 = corner/conical peel
  0, // lift — hover height while dragging
  1, // alpha — global fade, for the fly-off
  0,
];

export type StickerProps = Omit<ViewProps, 'children'> & {
  image: ImageSourcePropType;
  /** Peel channel — see STICKER_LIVE_REST for the slot meanings. */
  paramsSynchronizable: ParamsSynchronizable;
  layout: StickerLayout;
  /** Die-cut vinyl border colour. */
  borderColor?: ColorInput;
  /** Colour of the sticker's paper backing, seen while it peels. */
  backingColor?: ColorInput;
  /** Width of the die-cut border, as a fraction of the sticker's height. */
  border?: number;
  /** Specular strength on the curl crest. */
  gloss?: number;
  /** Opacity of the cast shadow. */
  shadow?: number;
  /**
   * Shrinks the artwork inside the sticker rect so the die-cut border has room
   * to grow. Lower it for art that runs right to the edge of its image.
   */
  inset?: number;
  /** Fires once the artwork has been uploaded and is actually being drawn. */
  onImageLoad?: (size: { width: number; height: number }) => void;
};

/**
 * A vinyl sticker that can be pressed onto a surface and peeled back off.
 *
 * Everything visible is the shader: the die-cut border is grown from the
 * image's own alpha, and the sticking / peeling is real cylindrical-roll
 * geometry rather than a fade. The component itself is stateless — drive it
 * through `paramsSynchronizable` (see `useStickerPeel`).
 */
export default function Sticker({
  image,
  paramsSynchronizable,
  layout,
  borderColor = '#ffffff',
  backingColor = '#d9d3c7',
  border = 0.055,
  gloss = 0.6,
  shadow = 0.5,
  inset = 0.84,
  onImageLoad,
  style,
  ...viewProps
}: StickerProps) {
  const colors = useMemo(
    () => [borderColor, backingColor],
    [borderColor, backingColor]
  );

  const params = useMemo(
    () => [
      layout.padX,
      layout.padY,
      border,
      gloss,
      shadow,
      0.55, // backTint — how much of the art bleeds through the backing
      0.34, // edgeDark — the vinyl's own thickness at the edge-on crease
      inset,
    ],
    [layout.padX, layout.padY, border, gloss, shadow, inset]
  );

  return (
    <ShaderImageView
      fragmentShader={STICKER_SHADER}
      image={image}
      colors={colors}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      onImageLoad={onImageLoad}
      transparent
      style={[
        { width: layout.canvasWidth, height: layout.canvasHeight },
        style,
      ]}
      {...viewProps}
    />
  );
}

/**
 * The sticker is modelled as an inextensible sheet wrapped around a cylinder
 * that lies on the surface along the contact line.
 *
 * Working along the peel axis in units of the sticker's own extent, with the
 * contact line at f and arc length s measured from it, a material point sits at
 *
 *   x(phi) = f + R * sin(phi)      phi = s / R
 *   h(phi) = R * (1 - cos(phi))
 *
 * so phi = 0 is the contact line, phi = PI/2 is the top of the roll standing
 * edge-on, and phi > PI/2 has folded back OVER the stuck part with its backing
 * facing the camera. Sticking down and peeling off are the same motion: f
 * sweeps 0 -> 1 to press the sticker on, 1 -> 0 to lift it.
 *
 * Rendering is an inverse map. x(phi) is not monotonic, so a screen point can
 * be covered by several material points at once (that is exactly the fold); the
 * shader solves sin(phi) = (x - f) / R for every branch and keeps the highest,
 * which is the one the camera sees. The rest falls out of the geometry: the
 * moving specular is just the crest normal sweeping past the light, and the
 * shadow gap closes on its own because h goes to zero at the contact line.
 *
 * R itself is R = max((1 - f) / wMax, rMin). The first term keeps the curl
 * self-similar while pressing down (it shrinks with the flap instead of folding
 * over); the rMin floor takes over while peeling, where the roll has a radius
 * the material dictates and the wrap angle grows past PI as more comes free.
 */
const STICKER_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,  // die-cut border
  color1:     vec4<f32>,  // paper backing
  params0:    vec4<f32>,  // padX, padY, border, gloss
  params1:    vec4<f32>,  // shadow, backTint, edgeDark, inset
  live:       vec4<f32>,  // front, axis angle, rMin, wMax
  liveData:   array<vec4<f32>, 96>,  // [0] = cone, lift, alpha, unused
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var image: texture_2d<f32>;

const PI  = 3.14159265;
const TAU = 6.28318531;

// Key light from the upper left, already normalized.
const LIGHT = vec3<f32>(-0.4194, 0.5792, 0.6990);
const SHADOW_TINT = vec3<f32>(0.07, 0.07, 0.10);

// The vinyl's own thickness, in sticker-height units. Without it a perfectly
// flat sticker would cast no contact shadow at all — a stuck sticker would look
// printed on the wall rather than laid on it.
const THICKNESS = 0.024;

struct Roll {
  axis:  vec2<f32>,
  perp:  vec2<f32>,
  pmin:  f32,
  along: f32,   // extent of the sticker along the peel axis, in square space
  qmin:  f32,
  across: f32,
  front: f32,
  rMin:  f32,
  wMax:  f32,
  cone:  f32,
  lift:  f32,
};

struct Hit {
  valid: bool,
  phi:   f32,
  h:     f32,   // height above the surface, in along-axis units
  fv:    f32,   // contact line for this pixel (the cone tilts it)
  mat:   vec2<f32>,  // the material point, in square space
};

fn makeRoll(aspect: f32) -> Roll {
  var r: Roll;
  let theta = u.live.y;
  r.axis = vec2<f32>(cos(theta), sin(theta));
  r.perp = vec2<f32>(-r.axis.y, r.axis.x);

  // Extent of the sticker rect (0..aspect x 0..1 in square space) projected
  // onto each axis, so the along-axis coordinate is 0..1 edge to edge whatever
  // the peel angle is.
  let ex = vec2<f32>(r.axis.x * aspect, r.axis.y);
  r.pmin = min(0.0, ex.x) + min(0.0, ex.y);
  r.along = max(abs(ex.x) + abs(ex.y), 1e-4);

  let px = vec2<f32>(r.perp.x * aspect, r.perp.y);
  r.qmin = min(0.0, px.x) + min(0.0, px.y);
  r.across = max(abs(px.x) + abs(px.y), 1e-4);

  r.front = clamp(u.live.x, 0.0, 1.0);
  r.rMin = max(u.live.z, 0.002);
  r.wMax = max(u.live.w, 0.02);
  r.cone = clamp(u.liveData[0].x, 0.0, 1.0);
  r.lift = max(u.liveData[0].y, 0.0);
  return r;
}

fn alongOf(r: Roll, p: vec2<f32>) -> f32 {
  return (dot(p, r.axis) - r.pmin) / r.along;
}

fn acrossOf(r: Roll, p: vec2<f32>) -> f32 {
  return (dot(p, r.perp) - r.qmin) / r.across;
}

/**
 * Which material point is visible at p, if any. Solves the branch equation and
 * keeps the highest solution.
 */
fn solve(r: Roll, p: vec2<f32>) -> Hit {
  let x = alongOf(r, p);
  let vn = clamp(acrossOf(r, p), 0.0, 1.0);

  // A conical peel: the contact line tilts and the roll tightens toward one
  // side, which is what a corner lift actually looks like.
  let fv = r.front + r.cone * 0.30 * (vn - 0.5);
  let base = max((1.0 - fv) / r.wMax, r.rMin);
  let radius = max(base * mix(1.0, 0.55 + 0.9 * vn, r.cone), 1e-4);
  let phiEdge = max(0.0, 1.0 - fv) / radius;

  var hit: Hit;
  hit.valid = false;
  hit.phi = 0.0;
  hit.h = 0.0;
  hit.fv = fv;
  hit.mat = p;

  let q = (x - fv) / radius;
  if (abs(q) > 1.0) {
    return hit;
  }

  // sin(phi) = q has one solution per half turn; four candidates cover every
  // wrap the material can reach before the roll closes on itself.
  let s = asin(clamp(q, -1.0, 1.0));
  var cands = array<f32, 4>(s, PI - s, TAU + s, 3.0 * PI - s);

  var bestPhi = -1.0;
  var bestH = -1.0;
  for (var i = 0; i < 4; i = i + 1) {
    let phi = cands[i];
    if (phi >= 0.0 && phi <= phiEdge) {
      let h = radius * (1.0 - cos(phi));
      if (h > bestH) {
        bestH = h;
        bestPhi = phi;
      }
    }
  }

  if (bestPhi < 0.0) {
    return hit;
  }

  hit.valid = true;
  hit.phi = bestPhi;
  hit.h = bestH;
  // Arc length from the contact line gives the material coordinate; only the
  // along-axis component moves, so the point slides straight back along it.
  let d = fv + radius * bestPhi;
  hit.mat = p + (d - x) * r.along * r.axis;
  return hit;
}

// --------------------------------------------------------------- the artwork

fn toTexUv(p: vec2<f32>, aspect: f32) -> vec2<f32> {
  let centre = vec2<f32>(aspect * 0.5, 0.5);
  let scaled = (p - centre) / max(u.params1.w, 0.05) + centre;
  return vec2<f32>(scaled.x / aspect, scaled.y);
}

fn artAlpha(p: vec2<f32>, aspect: f32, lod: f32) -> f32 {
  let uv = toTexUv(p, aspect);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 0.0;
  }
  // textureSampleLevel, not textureSample: every one of these runs inside
  // non-uniform control flow, where implicit derivatives are invalid — which is
  // also why the level has to be worked out by hand, see rollLod.
  return textureSampleLevel(image, imageSampler, vec2<f32>(uv.x, 1.0 - uv.y), lod).a;
}

fn artColor(p: vec2<f32>, aspect: f32, lod: f32) -> vec3<f32> {
  let uv = clamp(toTexUv(p, aspect), vec2<f32>(0.0), vec2<f32>(1.0));
  return textureSampleLevel(image, imageSampler, vec2<f32>(uv.x, 1.0 - uv.y), lod).rgb;
}

/** The vinyl body: the artwork's alpha grown outward by the die-cut border. */
fn dieCut(p: vec2<f32>, aspect: f32, lod: f32) -> f32 {
  let border = u.params0.z;
  var m = artAlpha(p, aspect, lod);
  if (border <= 0.0) {
    return m;
  }
  for (var i = 0; i < 8; i = i + 1) {
    let a = (f32(i) + 0.5) * (TAU / 8.0);
    m = max(m, artAlpha(p + vec2<f32>(cos(a), sin(a)) * border, aspect, lod));
  }
  for (var i = 0; i < 4; i = i + 1) {
    let a = (f32(i) + 0.25) * (TAU / 4.0);
    m = max(m, artAlpha(p + vec2<f32>(cos(a), sin(a)) * border * 0.55, aspect, lod));
  }
  return m;
}

/**
 * One screen pixel expressed in square space, so filter widths can be set in
 * units the sampler actually cares about.
 */
fn pixelSize() -> f32 {
  return 1.0 / max(u.resolution.y * (1.0 - 2.0 * u.params0.y), 1.0);
}

/**
 * Mip level to sample the artwork at, given how much the roll squeezes it here.
 *
 * A material point at wrap angle phi is foreshortened by cos(phi), so as the
 * sheet turns edge-on at the crest a single screen pixel comes to cover an
 * unbounded stretch of artwork. Sampling level 0 there is pure undersampling —
 * the die-cut edge shatters into a sawtooth and the star's points smear into
 * slivers — so the level is chosen to match the span that pixel actually
 * covers, in texels.
 *
 * The bias matters. The squeeze is anisotropic — only the peel axis is
 * compressed — but a mip chain blurs both axes equally, so taking the level
 * straight from the worst axis softens the whole sheet whenever it is even
 * mildly foreshortened. That is invisible in the thin band at the crest, but a
 * carried sticker sits at a moderate angle all over and washes out to a pale
 * smear. Backing off a full level keeps gentle curves crisp while leaving
 * plenty of blur where the sheet actually goes edge-on.
 */
fn rollLod(phi: f32) -> f32 {
  let dim = textureDimensions(image);
  let squeeze = max(abs(cos(phi)), 0.003);
  let spanTexels =
    (pixelSize() / squeeze) * f32(dim.y) / max(u.params1.w, 0.05);
  return clamp(log2(max(spanTexels, 1.0)) - 1.0, 0.0, 12.0);
}

/**
 * Shades one face of the sticker at material point mat, wrapped to angle phi.
 * Returns straight-alpha colour; alpha is the die-cut body.
 */
fn faceColor(r: Roll, mat: vec2<f32>, phi: f32, aspect: f32) -> vec4<f32> {
  let lod = rollLod(phi);
  let body = dieCut(mat, aspect, lod);
  if (body <= 0.002) {
    return vec4<f32>(0.0);
  }

  let ink = artAlpha(mat, aspect, lod);
  let art = artColor(mat, aspect, lod);

  // The sheet's frame rotates with the wrap: the front normal starts pointing
  // straight up and has flipped over by the time phi passes PI/2.
  let nAlong = -sin(phi);
  let nUp = cos(phi);
  let n = vec3<f32>(nAlong * r.axis.x, nAlong * r.axis.y, nUp);

  let diffuse = clamp(dot(n, LIGHT), 0.0, 1.0);
  // halfway, not half — half is a reserved word in WGSL.
  let halfway = normalize(LIGHT + vec3<f32>(0.0, 0.0, 1.0));
  // Clamped base and a finite exponent — an unbounded pow here goes to inf and
  // poisons the mix below with NaN.
  let spec = pow(clamp(dot(n, halfway), 0.0, 1.0), 42.0);

  // Grazing-angle sheen. A pure Blinn lobe only fires when the crest happens to
  // face the key light, and the crest faces wherever the peel axis points — so
  // the highlight that actually travels along the roll is this one, the sky
  // reflecting off vinyl at a glancing angle.
  let sheen = pow(1.0 - clamp(abs(nUp), 0.0, 1.0), 3.5);

  let gloss = u.params0.w;
  var col: vec3<f32>;
  if (nUp >= 0.0) {
    let base = mix(u.color0.rgb, art, ink);
    // A high ambient floor on purpose. A carried sticker holds a standing curl,
    // so most of its face is tilted somewhat away from the key light — with a
    // low floor the whole sheet goes muddy olive the moment you pick it up,
    // which reads as a rendering fault rather than as shading. The remaining
    // range is still enough to model the curl.
    col = base * (0.84 + 0.26 * diffuse) + vec3<f32>(spec * gloss * 0.4);
  } else {
    // The backing: uncoated paper, with a little of the art bleeding through.
    let lum = dot(art, vec3<f32>(0.299, 0.587, 0.114));
    let bleed = mix(1.0, 0.72 + 0.30 * lum, u.params1.y * ink);
    col = u.color1.rgb * bleed * (0.60 + 0.42 * diffuse)
        + vec3<f32>(spec * gloss * 0.30);
  }
  // Additive highlights stay modest. A carried sticker is one big smooth curve,
  // so some band of it always satisfies the specular lobe — at full strength
  // that band blows out to white and the sticker reads as washed out rather
  // than glossy.
  col = col + vec3<f32>(sheen * gloss * 0.30 * (0.40 + 0.60 * diffuse));

  // A dark seam right where the sheet turns edge-on, standing in for its
  // thickness. Kept narrow so it reads as an edge under the sheen, not a smudge.
  col = col * (1.0 - u.params1.z * smoothstep(0.14, 0.0, abs(nUp)));
  // Ambient occlusion deep inside the fold.
  col = col * (1.0 - 0.30 * smoothstep(PI * 0.75, PI * 1.6, phi));

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(2.0)), body);
}

// ---------------------------------------------------------------- the shadow

/** Height of whatever material sits above p, in square-space units. */
fn occluderHeight(r: Roll, p: vec2<f32>, aspect: f32) -> f32 {
  let hit = solve(r, p);
  if (hit.valid) {
    // Mip-matched, not a raw tap: the same squeeze that shatters the die-cut
    // edge would comb the shadow's outline too.
    if (artAlpha(hit.mat, aspect, rollLod(hit.phi)) < 0.3) {
      return -1.0;
    }
    return hit.h * r.along + THICKNESS + r.lift;
  }
  let x = alongOf(r, p);
  if (x >= 0.0 && x <= hit.fv && artAlpha(p, aspect, rollLod(0.0)) >= 0.3) {
    return THICKNESS + r.lift;
  }
  return -1.0;
}

/**
 * Mip level whose footprint matches a blur of the given square-space radius.
 * Each level up the chain is an average over twice the area, so the chain is
 * already a blur pyramid — picking the level IS the blur.
 */
fn blurLod(radius: f32) -> f32 {
  let dim = textureDimensions(image);
  let texels = radius * f32(dim.y) / max(u.params1.w, 0.05);
  return clamp(log2(max(texels, 1.0)), 0.0, 12.0);
}

/**
 * How much material stands above receiverH at q, 0..1, softened by lod. Only
 * occluders strictly higher than the receiver count, so the sheet never shadows
 * itself while still catching the raised part of a curl over the flat part.
 *
 * The remap is deliberately wide and low: a blurred alpha never reaches 1 near
 * a thin feature, and a tight threshold would eat the shadow of anything
 * narrow — a star's points, say — instead of softening it.
 */
fn occluderAt(
  r: Roll, q: vec2<f32>, receiverH: f32, aspect: f32, lod: f32
) -> f32 {
  let hit = solve(r, q);
  if (hit.valid) {
    if (hit.h * r.along + THICKNESS + r.lift <= receiverH + 0.004) {
      return 0.0;
    }
    return smoothstep(0.06, 0.45, artAlpha(hit.mat, aspect, max(lod, rollLod(hit.phi))));
  }
  let x = alongOf(r, q);
  if (x < 0.0 || x > hit.fv || THICKNESS + r.lift <= receiverH + 0.004) {
    return 0.0;
  }
  return smoothstep(0.06, 0.45, artAlpha(q, aspect, max(lod, rollLod(0.0))));
}

/**
 * The cast shadow: the sticker's own silhouette, thrown once along the light
 * and softened by how far it had to travel.
 *
 * Two obvious implementations are both wrong here, and visibly so. Marching the
 * light ray and taking the furthest occluder makes every step a hard in-or-out
 * silhouette test at its own offset, so the result is a union of hard-edged
 * copies, stepped like a bad drop shadow. Offsetting once and ring-blurring is
 * no better — every tap in the ring is another hard copy, so a handful of them
 * reads as several disconnected shadows thrown from several directions at once.
 *
 * A shadow has ONE direction and ONE silhouette. So: offset once, and get the
 * softness from a single sample up the mip chain, which is already a blur
 * pyramid of exactly this silhouette. One tap, no copies, and the penumbra
 * widens with distance for free — a flat sheet throws a tight contact shadow
 * because its only height is the vinyl's own thickness, a held one throws a far
 * softer one, and the gap under a lifted curl closes as the roll flattens.
 */
fn shadowAt(r: Roll, p: vec2<f32>, receiverH: f32, aspect: f32) -> f32 {
  let ldir = normalize(LIGHT.xy);
  let slope = LIGHT.z / max(length(LIGHT.xy), 1e-3);

  // Where the shadow of material lying flat would land.
  let restingH = THICKNESS + r.lift;
  var offset = max(restingH - receiverH, 0.0) / slope;

  // Refine once against the real height field, so a raised curl throws its
  // shadow further than the part still stuck down.
  let probe = occluderHeight(r, p + ldir * offset, aspect);
  if (probe > restingH) {
    offset = max(probe - receiverH, 0.0) / slope;
  }

  let radius = 0.008 + offset * 0.5;
  return occluderAt(r, p + ldir * offset, receiverH, aspect, blurLod(radius));
}

fn over(dst: vec4<f32>, src: vec4<f32>) -> vec4<f32> {
  let a = src.a + dst.a * (1.0 - src.a);
  if (a <= 1e-5) {
    return vec4<f32>(0.0);
  }
  let c = (src.rgb * src.a + dst.rgb * dst.a * (1.0 - src.a)) / a;
  return vec4<f32>(c, a);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;

  let dim = textureDimensions(image);
  let aspect = f32(dim.x) / max(f32(dim.y), 1.0);

  // Canvas UV -> sticker rect -> square space, where one unit is the sticker's
  // height on both axes so radii and offsets stay isotropic.
  let pad = vec2<f32>(u.params0.x, u.params0.y);
  let local = (uv - pad) / max(vec2<f32>(1.0) - pad * 2.0, vec2<f32>(1e-4));
  let p = vec2<f32>(local.x * aspect, local.y);

  let r = makeRoll(aspect);

  let hit = solve(r, p);
  let x = alongOf(r, p);

  // Bottom layer: the part still lying flat, everything behind the contact
  // line. Its own shadow receiver height is the vinyl thickness.
  var flatLayer = vec4<f32>(0.0);
  if (x >= 0.0 && x <= hit.fv) {
    flatLayer = faceColor(r, p, 0.0, aspect);
  }

  // What is catching the shadow here, and how high it sits. Getting this wrong
  // for the lifted sheet is what made a carried sticker wear its own shadow: if
  // the receiver is reported as the ground while the sheet is right there, the
  // sheet counts as an occluder above it and paints a blurred copy of itself
  // over its own face and out into a halo.
  var receiverH = 0.0;
  if (hit.valid) {
    receiverH = hit.h * r.along + THICKNESS + r.lift;
  } else if (flatLayer.a > 0.002) {
    receiverH = THICKNESS + r.lift;
  }
  let shade = shadowAt(r, p, receiverH, aspect) * u.params1.x;

  var out = vec4<f32>(SHADOW_TINT, shade);
  out = over(out, vec4<f32>(flatLayer.rgb * (1.0 - shade * 0.75), flatLayer.a));

  // Top layer: the lifted flap. It is above everything, so it is never shaded
  // by the march.
  if (hit.valid) {
    out = over(out, faceColor(r, hit.mat, hit.phi, aspect));
  }

  // Premultiply — the canvas is transparent, and straight alpha would wash the
  // shadow and the die-cut edge out to grey.
  let a = clamp(out.a, 0.0, 1.0) * clamp(u.liveData[0].z, 0.0, 1.0);
  return vec4<f32>(out.rgb * a, a);
}
`;
