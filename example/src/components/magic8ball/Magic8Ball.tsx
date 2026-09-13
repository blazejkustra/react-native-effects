import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * `[centerX, centerY, radius, windowRadius, windowY, 0, 0, 0]`. The centre
   * is in screen uv (y-up) and `radius` is a fraction of the screen HEIGHT;
   * `windowRadius` and `windowY` are in ball radii, so the whole object keeps
   * its proportions on any display.
   */
  params: number[];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A Magic 8-ball you shake for an answer.
 *
 * One opaque full-screen pass: a studio backdrop, the glossy black sphere with
 * its printed 8, the moulded bezel, the domed glass, and the window — murky
 * blue fluid and the answer die floating up through it.
 *
 * Everything shiny is lit by ONE environment (`envColor`): a rectangular
 * softbox up and to the left, a wide dim fill on the right, and a studio sweep
 * behind. The sphere, the bezel and the glass all reflect that same room, so
 * their highlights agree — which is the difference between a photographed
 * object and a pile of `pow(dot(n, h), k)` blobs.
 *
 * The die is drawn in the GRAVITY frame: it rises along whichever way is
 * really up, so tipping the phone changes the corner of the window the answer
 * arrives from. It is blurred and lost in the ink while it is deep (the
 * triangle's edge softness IS the focus cue) and snaps sharp as it presses
 * against the glass. The answer text itself is a React Native `Text` laid over
 * the window, since a fragment shader is the wrong tool for a glyph.
 *
 */
export default function Magic8Ball({
  params,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={MAGIC_8_BALL_SHADER}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const MAGIC_8_BALL_SHADER = /* wgsl */ `
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

/** Three octaves is enough for ink: any more and the murk turns to gravel. */
fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var amp = 0.5;
  var acc = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    acc = acc + amp * vnoise(p);
    p = p * 2.07;
    amp = amp * 0.5;
  }
  return acc;
}

/** The one key light in the room: a softbox up and to the left, in front. */
fn keyDir() -> vec3<f32> {
  return normalize(vec3<f32>(-0.67, 0.70, 0.26));
}

/**
 * The room, as a function of direction — the only light source in this shader.
 *
 * A glossy black sphere has almost no diffuse of its own: what you read as its
 * shape is entirely the room reflected in it. So the key is modelled as an
 * actual RECTANGLE, not a phong lobe. A softbox has straight edges and a hard
 * corner, and that straight-edged reflection sliding over a curve is most of
 * what says "photographed plastic".
 *
 * \`rough\` widens the box edges and dims it to match, so the same room can be
 * sampled by a mirror sphere, a satin bezel and a glass dome and still look
 * like one room at three gloss levels.
 */
fn envColor(d: vec3<f32>, rough: f32) -> vec3<f32> {
  // The sweep behind: dim and cool up high, falling to near black at the floor.
  var c = mix(vec3<f32>(0.013, 0.015, 0.021),
              vec3<f32>(0.085, 0.100, 0.140),
              smoothstep(-0.55, 0.85, d.y));
  c = mix(vec3<f32>(0.006, 0.006, 0.009), c, smoothstep(-0.95, -0.30, d.y));

  let k = keyDir();
  let tx = normalize(cross(k, vec3<f32>(0.0, 1.0, 0.0)));
  let ty = cross(tx, k);
  let ck = dot(d, k);
  if (ck > 0.02) {
    // Project onto the plane facing the light, then a soft-edged rectangle.
    let pd = d - k * ck;
    let ax = abs(dot(pd, tx));
    let ay = abs(dot(pd, ty));
    // A rounded box, not two crossed smoothsteps: a softbox has a diffuser
    // and a frame, so its corners are round, and a sphere stretches whatever
    // shape you give it. Square corners come back as a strip of tape.
    let soft = 0.026 + rough * 0.55;
    let crn = 0.075;
    let bd = vec2<f32>(ax, ay) - vec2<f32>(0.125, 0.195) + crn;
    let sdf = length(max(bd, vec2<f32>(0.0)))
            + min(max(bd.x, bd.y), 0.0) - crn;
    let box = 1.0 - smoothstep(-soft, soft, sdf);
    // A real softbox is orders of magnitude over mid grey, which is why its
    // reflection clips to white through a 4% Fresnel. Dim with roughness so
    // spreading it over a wider lobe does not also brighten it.
    c = c + vec3<f32>(1.0, 0.98, 0.95) * box * (26.0 / (1.0 + rough * 7.0));
  }

  // A broad, dim fill panel on the other side, so the shadow half of anything
  // round keeps some shape instead of going flat black.
  let fl = normalize(vec3<f32>(0.80, -0.10, 0.58));
  let cf = max(dot(d, fl), 0.0);
  c = c + vec3<f32>(0.20, 0.25, 0.36) * cf * cf * cf * 0.55;

  // Two wall washes BEHIND the ball. A sphere mirrors everything in front of
  // it into the inner half of its disc, which on this object is covered by the
  // window — so the only thing that can shape the black ring around the bezel
  // is light from behind. These two draw the crescents down its silhouette.
  let bkl = normalize(vec3<f32>(-0.66, 0.46, -0.60));
  let cl = max(dot(d, bkl), 0.0);
  c = c + vec3<f32>(0.62, 0.70, 0.92) * cl * cl * cl * cl * 1.75;
  let bkr = normalize(vec3<f32>(0.78, 0.10, -0.62));
  let cr = max(dot(d, bkr), 0.0);
  c = c + vec3<f32>(0.30, 0.35, 0.48) * cr * cr * cr * cr * cr * cr * 0.85;
  return c;
}

/** Schlick, for a dielectric. \`ct\` is cos(view, normal). */
fn fres(ct: f32) -> f32 {
  let m = clamp(1.0 - ct, 0.0, 1.0);
  let m2 = m * m;
  return 0.04 + 0.96 * m2 * m2 * m;
}

/** Mirror the view direction (0,0,1) about a normal. */
fn mirror(n: vec3<f32>) -> vec3<f32> {
  return 2.0 * n.z * n - vec3<f32>(0.0, 0.0, 1.0);
}

/** Circle outline, signed. Positive outside the stroke. */
fn ringField(q: vec2<f32>, rad: f32, th: f32) -> f32 {
  return abs(length(q) - rad) - th;
}

/**
 * Signed distance to the line through p and q, positive on the side away from
 * the interior point g. The building block for every part of the die.
 */
fn edgeHp(x: vec2<f32>, p: vec2<f32>, q: vec2<f32>, g: vec2<f32>) -> f32 {
  let e = q - p;
  var n = normalize(vec2<f32>(e.y, -e.x));
  if (dot(p - g, n) < 0.0) {
    n = -n;
  }
  return dot(x - p, n);
}

/** Distance from x to the segment a-b. */
fn segD(x: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let xa = x - a;
  let ba = b - a;
  let h = clamp(dot(xa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(xa - ba * h);
}

/**
 * True signed distance to convex triangle a-b-c. Negative inside.
 *
 * A max of the three edge half-planes would be cheaper and is exact inside —
 * but outside a corner it reads the distance to the nearer EDGE LINE, not to
 * the corner, so subtracting a radius from it mitres the corner instead of
 * rounding it. Rounded corners are the whole reason this is here.
 */
fn sdTri(x: vec2<f32>, a: vec2<f32>, b: vec2<f32>, c: vec2<f32>) -> f32 {
  let g = (a + b + c) / 3.0;
  let d = min(min(segD(x, a, b), segD(x, b, c)), segD(x, c, a));
  var s = edgeHp(x, a, b, g);
  s = max(s, edgeHp(x, b, c, g));
  s = max(s, edgeHp(x, c, a, g));
  return select(d, -d, s < 0.0);
}

/** True signed distance to convex quad a-b-c-d, wound in order. */
fn sdQuad(x: vec2<f32>, a: vec2<f32>, b: vec2<f32>,
          c: vec2<f32>, d: vec2<f32>, g: vec2<f32>) -> f32 {
  let dd = min(min(segD(x, a, b), segD(x, b, c)),
               min(segD(x, c, d), segD(x, d, a)));
  var s = edgeHp(x, a, b, g);
  s = max(s, edgeHp(x, b, c, g));
  s = max(s, edgeHp(x, c, d, g));
  s = max(s, edgeHp(x, d, a, g));
  return select(dd, -dd, s < 0.0);
}

/**
 * A neighbouring face of the die, hinged back along the edge p-q.
 *
 * It is a TRAPEZOID, not a triangle: the shared edge is its long side, and
 * because the face is tipped away from the glass its far side lands shorter
 * and closer than a flat triangle's would. That is the shape the real object
 * shows on all three sides of the answer, and it is the whole reason the die
 * reads as a solid twenty-sider — a triangle behind a triangle reads as a
 * hexagram, which is the thing this replaced.
 *
 * \`reach\` is how far it leans out, \`taper\` how much of p-q its far side keeps.
 */
fn flapQuad(x: vec2<f32>, p: vec2<f32>, q: vec2<f32>, g: vec2<f32>,
            reach: f32, taper: f32) -> f32 {
  let m = (p + q) * 0.5;
  let e = q - p;
  var n = normalize(vec2<f32>(e.y, -e.x));
  if (dot(m - g, n) < 0.0) {
    n = -n;
  }
  let p2 = m + (p - m) * taper + n * reach;
  let q2 = m + (q - m) * taper + n * reach;
  // Halfway out along the middle is inside the trapezoid for any taper > 0.
  return sdQuad(x, p, q, q2, p2, m + n * reach * 0.5);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let ctr = u.params0.xy;
  let rad = max(u.params0.z, 0.001);
  let wr = max(u.params0.w, 0.001);
  let wy = u.params1.x;

  // Ball space: origin at the sphere's centre, ONE unit = its radius.
  let p = vec2<f32>((uv.x - ctr.x) * aspect, uv.y - ctr.y) / rad;
  let r = length(p);
  // One pixel, in ball units — every edge below is antialiased with it.
  let e = 1.5 / (u.resolution.y * rad);

  let tilt = u.live.x;
  let churn = clamp(u.live.y, 0.0, 1.0);
  let rise = clamp(u.live.z, 0.0, 1.0);
  let swirl = u.live.w;
  let sway = u.liveData[0].x;
  let turn = u.liveData[0].y;

  let key = keyDir();

  // ---- The backdrop: a studio sweep, and the ball's shadow on the floor. ----
  // The sweep is the same room the ball reflects, seen directly: brightest
  // just behind and above it, falling off to black at the frame.
  let bgSweep = exp(-pow((p.y - 0.35) / 2.3, 2.0))
              * exp(-pow(p.x / 2.6, 2.0));
  var col = mix(vec3<f32>(0.009, 0.010, 0.014),
                vec3<f32>(0.058, 0.063, 0.079), bgSweep);

  // Contact shadow. Two lobes: a wide soft pool thrown away from the key, and
  // a tight dark core right where the ball meets the floor. The core is what
  // makes it sit on something instead of hovering over a smudge.
  let sh = p - vec2<f32>(-key.x * 0.55, -1.0);
  let pool = exp(-dot(vec2<f32>(sh.x / 1.45, sh.y / 0.30),
                      vec2<f32>(sh.x / 1.45, sh.y / 0.30)));
  let core = exp(-dot(vec2<f32>(p.x / 0.62, (p.y + 1.01) / 0.10),
                      vec2<f32>(p.x / 0.62, (p.y + 1.01) / 0.10)));
  col = col * (1.0 - clamp(pool * 0.7 + core * 0.85, 0.0, 0.97));

  let bm = 1.0 - smoothstep(-e, e, r - 1.0);
  if (bm > 0.001) {
    // ---- Glossy black plastic. ----
    let rc = min(r, 1.0);
    let nz = sqrt(max(1.0 - rc * rc, 0.0));
    let n = normalize(vec3<f32>(p.x, p.y, max(nz, 0.02)));
    let ndl = max(dot(n, key), 0.0);

    // Black plastic is almost all reflection: a near-black body, the room
    // mirrored in it, weighted by Fresnel. No hand-placed rim line and no
    // additive Fresnel glow — the horizon of the reflected room lights the
    // silhouette on its own, and it does it in the right places.
    var bc = vec3<f32>(0.021, 0.022, 0.027);
    bc = bc + vec3<f32>(0.030, 0.032, 0.040) * ndl;
    let m = mirror(n);
    bc = bc + (envColor(m, 0.022) * 0.72 + envColor(m, 0.34) * 0.42)
       * fres(n.z);
    // Bounce off the floor into the shaded underside.
    bc = bc + vec3<f32>(0.030, 0.031, 0.036) * smoothstep(-0.45, -1.0, p.y);

    // ---- The white 8, printed on the pole turned away from us. ----
    // Done on the SPHERE, not as a squashed ellipse in screen space: the decal
    // is a cap of directions around a pole, and its coordinates are the
    // normal's components in that pole's tangent frame. Foreshortening then
    // falls out of the geometry, including the way the glyph leans.
    let pole = normalize(vec3<f32>(-0.045, 0.720, 0.693));
    let gt = normalize(cross(pole, vec3<f32>(0.0, 0.0, 1.0)));
    let gb = cross(pole, gt);
    let capCos = 0.9703;
    let capSin = sqrt(1.0 - capCos * capCos);
    let gp = vec2<f32>(dot(n, gt), dot(n, gb)) / capSin;
    // Edge softness in decal units: one pixel of p, opened up by the grazing
    // angle, over the cap's radius.
    let ge = e / (capSin * max(n.z, 0.18));
    let disc = smoothstep(-ge, ge, 1.0 - length(gp)) * step(0.0, dot(n, pole));
    if (disc > 0.001) {
      // The decal is printed, not emissive: same key, same room, just a white
      // body under it — and a touch less gloss than the surrounding plastic.
      var dc = vec3<f32>(0.78, 0.785, 0.80) * (0.26 + 0.74 * ndl);
      dc = dc + envColor(mirror(n), 0.16) * fres(n.z) * 0.55;
      bc = mix(bc, dc, disc);
      let top = ringField(gp - vec2<f32>(0.0, 0.255), 0.215, 0.080);
      let bot = ringField(gp - vec2<f32>(0.0, -0.275), 0.265, 0.088);
      let glyph = smoothstep(-ge, ge, -min(top, bot)) * disc;
      bc = mix(bc, vec3<f32>(0.055, 0.055, 0.065) * (0.4 + 0.6 * ndl), glyph);
    }

    // ---- The moulded bezel and the window sunk into it. ----
    let wp = p - vec2<f32>(0.0, wy);
    let wd = length(wp);
    let wdir = wp / max(wd, 1e-4);
    let outer = wr * 1.125;

    let insert = 1.0 - smoothstep(-e, e, wd - outer);
    if (insert > 0.001 && wd > wr * 0.999) {
      // A bead, not an annulus: the ring rolls up out of the black plastic,
      // crests, and rolls back down into the window. Tilting the normal along
      // that profile gives it a highlight arc that tracks the key, which is
      // the whole difference between a moulded part and a pasted-on disc.
      let t = clamp((wd - wr) / (outer - wr), 0.0, 1.0);
      let slope = cos(t * 3.14159265) * 0.62;
      let nb = normalize(n + vec3<f32>(wdir * slope, 0.0));
      let bl = max(dot(nb, key), 0.0);
      var ic = vec3<f32>(0.905, 0.910, 0.925) * (0.30 + 0.70 * bl);
      // The lower half of the rim sees no key at all — only the floor bounce.
      // Without this it lights up as brightly as the top and the ring flattens.
      ic = ic * (0.56 + 0.44 * smoothstep(-0.85, 0.35,
                                          dot(wdir, vec2<f32>(key.x, key.y))));
      ic = ic + envColor(mirror(nb), 0.46) * fres(nb.z) * 0.55;
      // Occlusion in the two creases: against the black plastic outside, and
      // down the throat into the window.
      ic = ic * (0.55 + 0.45 * smoothstep(0.0, 0.14, t));
      ic = ic * (0.62 + 0.38 * smoothstep(1.0, 0.80, t));
      bc = mix(bc, ic, insert);
    }

    let wm = 1.0 - smoothstep(-e, e, wd - wr);
    if (wm > 0.001) {
      // Window space, normalized so the rim is at |q| = 1.
      let q = wp / wr;
      let wdn = min(length(q), 1.0);

      // The cover is a shallow dome, so its normal bends outward toward the
      // rim: that bend both bulges the fluid behind it and carries the room's
      // reflection across the glass.
      let ng = normalize(n + vec3<f32>(wdir * pow(wdn, 2.2) * 0.62, 0.0));
      // Refraction through that dome: sampling nearer the centre at the rim
      // magnifies what is behind it, the way a watch crystal does.
      let qr = q * (1.0 - 0.12 * wdn * wdn);

      // Gravity frame: dn points downhill, ax runs across it.
      let dn = vec2<f32>(sin(tilt), -cos(tilt));
      let up = -dn;
      let across = vec2<f32>(-up.y, up.x);
      let al = dot(qr, up);

      // ---- Murky fluid: fbm, domain-warped, swirling harder when churned. ----
      let w1 = fbm(qr * 1.9 + vec2<f32>(swirl * 0.13, 1.7)) - 0.5;
      let w2 = fbm(qr * 1.9 + vec2<f32>(5.2, swirl * 0.11 + 9.1)) - 0.5;
      let qq = qr + vec2<f32>(w1, w2) * (0.15 + 0.4 * churn);
      let ink = fbm(qq * 2.7 + vec2<f32>(0.0, swirl * 0.07));
      var mc = mix(vec3<f32>(0.003, 0.005, 0.017),
                   vec3<f32>(0.018, 0.028, 0.080), ink);
      // The mix alone is too even to read as moving fluid; a steep power of
      // the same field picks out tendrils where the ink has piled up. Gated on
      // churn, because agitated fluid is what catches the light — at rest this
      // has to stay near black or the die has nothing to read against.
      mc = mc + vec3<f32>(0.07, 0.10, 0.24)
         * pow(clamp(ink, 0.0, 1.0), 2.4) * (0.10 + 0.90 * churn);
      // The key reaches into the fluid from its own side, and the ink pools
      // downhill away from it.
      mc = mc * (0.72 + 0.55 * clamp(dot(qr, vec2<f32>(key.x, key.y)) * -0.5
                                     + 0.5 - dot(qr, qr) * 0.35, 0.0, 1.0));
      mc = mc * (0.9 + 0.2 * smoothstep(1.0, -1.0, al));

      // ---- The answer die, floating up the world-up axis. ----
      // How far below the window the die sits when it is lost in the murk.
      // Must match SUBMERGED_DEPTH in useMagic8BallPhysics, which places the
      // answer text on the same die. Far enough that the answer RISES INTO the
      // window: parked inside it, the die can only fade up in place, and a
      // fade is what makes the whole thing look like an animation.
      let depth = 1.2 * (1.0 - rise);
      let fc = up * -depth + across * sway * 0.1;
      let scl = mix(0.71, 0.84, rise);
      let fq0 = (qr - fc) / scl;
      // The die is a free object in a fluid, so its ORIENTATION belongs to the
      // world, not to the phone: its top edge stays level however the phone is
      // held, and a die that comes up already square to the window is the
      // giveaway, so it also arrives turned and rotates into place as it
      // settles. Both are one angle, summed on the JS side. Rotating the
      // SAMPLE point by -turn turns the shape by +turn.
      let cw = cos(turn);
      let sw = sin(turn);
      let fq = vec2<f32>(fq0.x * cw + fq0.y * sw, -fq0.x * sw + fq0.y * cw);
      // The edge softness IS the focus cue: metres of ink in front of it when
      // it is deep, pressed against the glass when it is up.
      // Deliberately not linear in rise: the die has to stay lost in the ink
      // through the first half of the climb and only pull into focus as it
      // comes up against the glass. Softness fading evenly with height reads
      // as a cross-fade, which is the thing this is trying not to look like.
      let te = mix(0.42, 0.014, smoothstep(0.22, 1.0, rise));

      // The answer face: an EQUILATERAL triangle with its three corners cut
      // flat. Both halves of that matter. The real die's face is a regular
      // triangle, not the squat one this started with; and its corners end in
      // a short straight edge of their own, so the outline is really a hexagon
      // with three long sides and three short ones — neither the sharp points
      // it had nor a rounded-off version of them.
      //
      // Cutting all three corners of an equilateral triangle by the same
      // amount is exactly intersecting it with its own 180-degree rotation,
      // scaled up: the inverted triangle's three edges face the original's
      // three corners and slice them off square. So the face is one max() of
      // two triangles rather than a six-sided polygon test.
      let ea = vec2<f32>(-0.8000, 0.4400);
      let eb = vec2<f32>(0.8000, 0.4400);
      let ec = vec2<f32>(0.0, -0.9456);
      let ia = vec2<f32>(1.4501, -0.8593);
      let ib = vec2<f32>(-1.4501, -0.8593);
      let ic = vec2<f32>(0.0, 1.6528);
      let fg = vec2<f32>(0.0, -0.0219);
      // Where the cut corners leave the three LONG sides, which is what the
      // hinged faces attach to.
      let h1 = vec2<f32>(-0.7000, 0.4400);
      let h2 = vec2<f32>(0.7000, 0.4400);
      let h3 = vec2<f32>(0.7500, 0.3534);
      let h4 = vec2<f32>(0.0500, -0.8590);
      let h5 = vec2<f32>(-0.0500, -0.8590);
      let h6 = vec2<f32>(-0.7500, 0.3534);

      // The three faces hinged back off its edges — a trapezoid on every side,
      // which is what the real object shows and what makes this a solid rather
      // than a triangle floating in ink.
      // Tight against the edges on purpose. Hinged faces that reach far
      // enough to stick out past the corners stop reading as the body behind
      // the answer and start reading as facets of a cut gem — the silhouette
      // has to stay a triangle, with these just thickening its outline.
      let flapSd = min(min(flapQuad(fq, h1, h2, fg, 0.085, 0.70),
                           flapQuad(fq, h3, h4, fg, 0.080, 0.68)),
                       flapQuad(fq, h5, h6, fg, 0.080, 0.68));
      // Softer than the front face however close the die gets: these are
      // hinged back behind it, so they never reach the glass and never come
      // fully into focus.
      let fe = te * 1.25 + 0.010;
      let sm = (1.0 - smoothstep(-fe, fe, flapSd))
             * smoothstep(0.18, 0.72, rise);
      if (sm > 0.002) {
        // Tipped away from both the key and the glass, so a fraction of the
        // face's blue — but nowhere near the ink, or the body stops reading.
        let bodyLit = 0.66 + 0.34 * smoothstep(-0.8, 0.9, fq.y);
        mc = mix(mc, vec3<f32>(0.034, 0.060, 0.205) * bodyLit, sm);
      }

      let td = max(sdTri(fq, ea, eb, ec), sdTri(fq, ia, ib, ic));
      // Dye that bright in fluid that dark spills a little light into the ink
      // around it. Without it the die looks pasted onto the window rather than
      // suspended behind it.
      mc = mc + vec3<f32>(0.05, 0.10, 0.30)
         * exp(-max(min(td, flapSd), 0.0) * 21.0)
         * smoothstep(0.15, 0.8, rise) * 0.38;

      let tm = 1.0 - smoothstep(-te, te, td);
      if (tm > 0.002) {
        // Lit from the key like everything else: the face is brightest at the
        // top-left corner the light comes from and falls off toward the apex.
        let lit = clamp(0.5 - dot(normalize(vec2<f32>(fq.x, fq.y - 0.1)
                                            + vec2<f32>(0.001, 0.0)),
                                  normalize(vec2<f32>(key.x, key.y))) * 0.5,
                        0.0, 1.0);
        var fcol = mix(vec3<f32>(0.095, 0.185, 0.660),
                       vec3<f32>(0.150, 0.300, 0.930),
                       (0.34 + 0.66 * smoothstep(0.5, -1.0, fq.y))
                       * (0.55 + 0.45 * lit));
        // The moulded bevel around the face, brighter on the edges turned
        // toward the key and darker on the ones turned away.
        let bev = 1.0 - smoothstep(0.0, 0.045, abs(td));
        let edgeLit = clamp(dot(normalize(vec2<f32>(fq.x, fq.y + 0.18)
                                          + vec2<f32>(0.0, 0.001)),
                                normalize(vec2<f32>(key.x, key.y))), -1.0, 1.0);
        fcol = fcol + vec3<f32>(0.30, 0.42, 0.70) * bev
             * (0.08 + 0.32 * max(edgeLit, 0.0));
        fcol = fcol * (1.0 - bev * 0.35 * max(-edgeLit, 0.0));
        // Ink in front of it while it is still deep.
        fcol = mix(mc * 0.30, fcol, smoothstep(0.05, 0.78, rise));
        mc = mix(mc, fcol, tm * mix(0.78, 1.0, rise));
      }

      // ---- The glass over the window. ----
      // The bezel throws a shadow down the inside of the rim, heaviest on the
      // side away from the key; that shadow is what seats the window INTO the
      // ball instead of on it.
      let rimShade = smoothstep(0.55, 1.0, wdn);
      let awayFromKey = clamp(0.5 - dot(q, vec2<f32>(key.x, key.y)) * 0.6,
                              0.0, 1.0);
      mc = mc * (1.0 - rimShade * (0.28 + 0.52 * awayFromKey));
      // Glass is thicker at the rim, so it drinks more of what is behind it.
      mc = mc * (1.0 - smoothstep(0.80, 1.0, wdn) * 0.35);
      // And the room, reflected off the dome — the same softbox that lit the
      // bezel, continuing across the glass.
      mc = mc + envColor(mirror(ng), 0.30) * fres(ng.z) * 0.40;

      bc = mix(bc, mc, wm);
    }

    col = mix(col, bc, bm);
  }

  // ---- Dither, so the near-black backdrop does not band. ----
  let dth = (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);
  return vec4<f32>(clamp(col + vec3<f32>(dth), vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
