import { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type HourglassProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'params' | 'texture' | 'colors'
> & {
  /** See `useHourglassPhysics` for the channel layout. */
  paramsSynchronizable: ParamsSynchronizable;
  /**
   * One image, three panels of the same size side by side: the photo with the
   * sand painted out, the photo as shot, and a data panel with R = upper bulb
   * interior, G = lower bulb interior, B = distance to the nearest wall.
   */
  atlas: ImageSourcePropType;
  /** Size of ONE panel, in px. */
  panelWidth: number;
  panelHeight: number;
  /** The neck's centre in panel px — the origin the sand surfaces are built around. */
  neck: { x: number; y: number };
  /** A rectangle of sand in the as-shot panel, sampled as the grain texture. */
  grain: { x: number; y: number; w: number; h: number };
};

/**
 * A photographed hourglass with its sand replaced by ours.
 *
 * The photo supplies the glass, the frame and the light; its own sand is
 * painted out in the first panel. Inside the two bulb masks the fragment
 * decides, in the frame of real gravity, whether it is sand: the source bulb
 * holds a flat fill with a funnel dug out of it at the angle of repose, the
 * destination a cone at the same slope on a rising fill. Sand pixels are the
 * photo's own sand pile, tiled in a rigid gravity-aligned frame and shaded by
 * the slope they sit on; the glass's wall shading multiplies over them so
 * they stay behind the glass. A grain stream falls between the two while the
 * timer runs.
 */
export default function Hourglass({
  paramsSynchronizable,
  atlas,
  panelWidth,
  panelHeight,
  neck,
  grain,
  ...rest
}: HourglassProps) {
  const params = useMemo(
    () => [
      panelWidth,
      panelHeight,
      neck.x,
      neck.y,
      grain.x,
      grain.y,
      grain.w,
      grain.h,
    ],
    [
      panelWidth,
      panelHeight,
      neck.x,
      neck.y,
      grain.x,
      grain.y,
      grain.w,
      grain.h,
    ]
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

const TAN_REPOSE: f32 = 0.684;   // tan(34 deg): the slope dry sand holds
// The camera sat a little above the glass, so a level surface shows as an
// ellipse: its front rim this much lower than its back rim, per unit of
// half-width.
const ELLIPSE: f32 = 0.16;
const EDGE: f32 = 1.4;            // px of anti-aliasing on every sand edge
const STREAM_W: f32 = 4.5;        // half-width of the falling stream, px (the neck is 16)
// The cone's crease is not a knife edge: grains round it off over this many
// px of radius, so the lit and shadowed faces meet softly.
const CREASE: f32 = 14.0;
const LIGHT: vec2<f32> = vec2<f32>(-0.62, -0.78); // from the upper left, gravity frame

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Triangle wave: mirror-repeats a coordinate into 0..1.
fn tri(x: f32) -> f32 {
  return abs(fract(x * 0.5) * 2.0 - 1.0);
}

fn canvasSize() -> vec2<f32> {
  return u.resolution.xy / u.resolution.w;
}
fn coverScale() -> f32 {
  let cs = canvasSize();
  let pw = u.params0.xy;
  return max(cs.x / pw.x, cs.y / pw.y);
}
fn toPhoto(q: vec2<f32>) -> vec2<f32> {
  return (q - canvasSize() * 0.5) / coverScale() + u.params0.xy * 0.5;
}

// Three panels side by side; every lookup stays half a texel inside its panel
// so the linear sampler never blends neighbours across a seam.
fn panelAt(pp: vec2<f32>, panel: f32) -> vec3<f32> {
  let pw = u.params0.xy;
  let c = clamp(pp, vec2<f32>(0.5), pw - 0.5);
  let uv = vec2<f32>((pw.x * panel + c.x) / (pw.x * 3.0), c.y / pw.y);
  return textureSampleLevel(tex, samp, uv, 0.0).rgb;
}
fn emptyAt(pp: vec2<f32>) -> vec3<f32> { return panelAt(pp, 0.0); }
fn shotAt(pp: vec2<f32>) -> vec3<f32> { return panelAt(pp, 1.0); }
fn dataAt(pp: vec2<f32>) -> vec3<f32> { return panelAt(pp, 2.0); }

// The photo's own sand, tiled without a seam: the grain rectangle is walked
// with a triangle wave in each axis, so it mirrors at every edge. The tile
// frame is turned a little and shifted half a tile, or the mirror lines run
// straight down the glass's own axis of symmetry and read as a fold.
fn grainAt(g0: vec2<f32>) -> vec3<f32> {
  let r = u.params1;
  let g = vec2<f32>(g0.x * 0.94 - g0.y * 0.34, g0.x * 0.34 + g0.y * 0.94);
  let px = r.x + tri(g.x / r.z + 0.5) * r.z;
  let py = r.y + tri(g.y / r.w + 0.5) * r.w;
  return shotAt(vec2<f32>(px, py));
}

// The sand's top surface as a height field over the bulb's cross-section:
// x across (= t), z toward the camera, h up. A pile is a cone at the angle of
// repose rising from the flat level, a funnel the same cone dug into it. The
// camera sat a little above the glass, so a point at (t, z) lands on screen
// at s = -h + ELLIPSE * z: the near rim below the far rim, the level surface
// an ellipse. sgn = +1 for the pile (ridge up), -1 for the funnel.
// ek is the ellipse term as seen along the sand frame's "down": the camera's
// elevation is fixed to the photo, so when the sand frame is turned over the
// near rim ends up on the other side (ek = ELLIPSE * cos(psi)).
fn surfS(t: f32, z: f32, base: f32, k: f32, sgn: f32, ek: f32) -> f32 {
  let rho = sqrt(t * t + z * z);
  return base - sgn * max(0.0, k - rho * TAN_REPOSE) + ek * z;
}
// z on [z0, z1] where the surface passes through s. surfS is monotonic in z
// on each half of the disc, so a short bisection finds it.
fn solveZ(t: f32, s: f32, base: f32, k: f32, sgn: f32, ek: f32, z0: f32, z1: f32) -> f32 {
  var lo = z0;
  var hi = z1;
  let rising = surfS(t, z1, base, k, sgn, ek) > surfS(t, z0, base, k, sgn, ek);
  for (var i = 0; i < 9; i = i + 1) {
    let mid = 0.5 * (lo + hi);
    let above = surfS(t, mid, base, k, sgn, ek) > s;
    if (above == rising) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return 0.5 * (lo + hi);
}
// Lambert shading of the surface at (t, z): its normal leans along the cone.
fn surfShade(t: f32, z: f32, k: f32, sgn: f32) -> f32 {
  let rho = max(sqrt(t * t + z * z), 0.001);
  let onCone = 1.0 - smoothstep(-CREASE, CREASE, rho * TAN_REPOSE - k);
  let lean = sgn * onCone * TAN_REPOSE / rho;
  let n = normalize(vec3<f32>(lean * t, 1.0, lean * z));
  // Mostly from above, a little from the left and the camera: the photo's
  // pile shows its near and far flanks at almost the same tone.
  let l = normalize(vec3<f32>(-0.5, 0.85, 0.25));
  let diff = max(0.0, dot(n, l));
  // Dry sand scatters most of its light back, so a slope only shifts its
  // brightness a little: the photo's own pile is nearly flat in tone.
  return 0.74 + 0.40 * diff;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let psi = u.live.x;
  let lu = u.live.y;
  let depth = u.live.z;
  let ld = u.live.w;
  let peak = u.liveData[0].x;
  let streamOn = u.liveData[0].y;
  let streamPhase = u.liveData[0].z;
  let glow = u.liveData[0].w;
  let wu = u.liveData[1].x;
  let wl = u.liveData[1].y;
  let tilt = u.liveData[1].z;

  let uv = ndc * 0.5 + 0.5;
  let cs = canvasSize();
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * cs;   // logical px, y-down
  let pp = toPhoto(q);

  let empty = emptyAt(pp);
  let data = dataAt(pp);
  let inside = max(data.r, data.g);
  let wallD = data.z;

  // The sand's frame about the neck: s down its "gravity", t across. It lags
  // the phone by the slope sand can hold, so a small tilt leaves the fill
  // where it was against the glass.
  let g = vec2<f32>(sin(psi), cos(psi));
  let perp = vec2<f32>(cos(psi), -sin(psi));
  let d = pp - u.params0.zw;
  let s = dot(d, g);
  let t = dot(d, perp);
  // The stream, though, falls along real gravity.
  let sg = dot(d, vec2<f32>(sin(tilt), cos(tilt)));
  let tg = dot(d, vec2<f32>(cos(tilt), -sin(tilt)));

  // Whatever is above the neck along gravity is the source: a funnel dug into
  // its fill. Below is the pile. The masks keep both to the glass; near the
  // neck the stream covers the join.
  var base = ld;
  var k = peak;
  var sgn = 1.0;
  var halfW = wl;
  var hasSand = step(0.5, ld + peak - 0.5);
  if (s < 0.0) {
    base = -lu;
    k = depth;
    sgn = -1.0;
    halfW = wu;
    hasSand = step(0.5, lu);
  }
  let ek = ELLIPSE * cos(psi);
  let zmax = sqrt(max(0.0, halfW * halfW - t * t));
  let sBack = surfS(t, -zmax, base, k, sgn, ek);
  let sMid = surfS(t, 0.0, base, k, sgn, ek);
  let sFront = surfS(t, zmax, base, k, sgn, ek);
  let frontLo = min(sMid, sFront);
  let frontHi = max(sMid, sFront);
  let backLo = min(sBack, sMid);
  let backHi = max(sBack, sMid);
  let topEdge = min(frontLo, backLo);
  let bottomOfSurface = max(frontHi, backHi);

  // Which part of the sand this fragment shows: the near half of the surface
  // wins over the far half wherever both project here; below the near rim
  // it is the side of the fill, seen through the glass.
  var shade = 0.9;
  var disc = 0.0;
  if (s >= frontLo && s <= frontHi) {
    let z = solveZ(t, s, base, k, sgn, ek, 0.0, zmax);
    shade = surfShade(t, z, k, sgn);
    disc = 1.0;
  } else if (s >= backLo && s <= backHi) {
    let z = solveZ(t, s, base, k, sgn, ek, -zmax, 0.0);
    shade = surfShade(t, z, k, sgn) * 0.96;
    disc = 1.0;
  } else if (s > bottomOfSurface) {
    // The fill's side: darker toward the walls, where the glass thickens,
    // and a thin brighter line where the surface meets the glass in front.
    shade = 0.86 - 0.12 * (1.0 - smoothstep(0.0, 0.7, wallD))
          + 0.16 * exp(-((s - bottomOfSurface) * (s - bottomOfSurface)) / 5.0);
  }
  let sandMask = clamp(inside, 0.0, 1.0) * hasSand * smoothstep(-EDGE, EDGE, s - topEdge);

  // Grain: the photo's own pile in a rigid gravity-aligned frame.
  let grain = grainAt(vec2<f32>(t, s) * 1.15) * 1.06;
  var sand = grain * shade;
  sand = sand + vec3<f32>(0.10, 0.08, 0.05) * glow * disc;

  // Behind the glass: the wall's own shading from the empty panel multiplies
  // over the sand near the walls, where it is glass and not the rear post.
  let lum = dot(empty, vec3<f32>(0.3, 0.59, 0.11));
  let wallMul = mix(empty / max(lum, 0.05) * min(lum / 0.94, 1.0), vec3<f32>(1.0),
                    smoothstep(0.1, 0.55, wallD));
  sand = sand * clamp(wallMul, vec3<f32>(0.35), vec3<f32>(1.0));
  // The photo's highlight down the left of each bulb continues over the sand.
  let hx = (pp.x - u.params0.z) / max(halfW, 1.0);
  let hl = 0.16 * exp(-((hx + 0.52) * (hx + 0.52)) / 0.05) * smoothstep(0.05, 0.4, wallD);
  sand = sand + vec3<f32>(hl);

  var col = mix(empty, sand, sandMask);

  // The stream: a thin column of grain falling from the neck until it meets
  // sand, only while the sand runs. Seen from a phone's width away a sand
  // stream is a soft translucent thread, not separate grains: a gaussian
  // across, the glass showing through its edges, a few bright grains catching
  // the light, and a little wider just before it lands where the grains
  // scatter. Grain scrolls with the integrated phase, never time x speed.
  let inGlass = max(inside, smoothstep(0.0, 0.1, wallD));
  let landing = ld - peak;
  let w = STREAM_W * (1.0 + 0.5 * smoothstep(landing - 50.0, landing, sg));
  let across = exp(-(tg * tg) / (w * w));
  let inStream = across * smoothstep(-2.0, 4.0, sg) * inGlass * (1.0 - sandMask);
  if (inStream > 0.002 && streamOn > 0.001) {
    let fall = sg - streamPhase;
    let cell = vec2<f32>(floor(tg / 1.8), floor(fall / 2.4));
    let sparkle = smoothstep(0.94, 0.995, hash21(cell));
    // A falling column is denser than a lit surface, so a shade darker.
    let sCol = grainAt(vec2<f32>(tg * 2.0, fall * 0.6)) * 0.9 + vec3<f32>(0.22) * sparkle;
    col = mix(col, sCol, inStream * streamOn * 0.85);
  }

  return vec4<f32>(col, 1.0);
}
`;
