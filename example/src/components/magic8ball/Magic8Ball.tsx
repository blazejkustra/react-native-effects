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
 * One opaque full-screen pass: the shelf it sits on, the glossy black sphere
 * with its foreshortened white 8 near the top, the white plastic bezel, and
 * the window — murky blue fluid, bubbles, and the answer die floating up
 * through it.
 *
 * The die is drawn in the GRAVITY frame: it rises along whichever way is
 * really up, so tipping the phone changes the corner of the window the answer
 * arrives from. It is blurred and lost in the ink while it is deep (the
 * triangle's edge softness IS the focus cue) and snaps sharp as it presses
 * against the glass. The answer text itself is a React Native `Text` laid over
 * the window, since a fragment shader is the wrong tool for a glyph.
 *
 * Bubbles are one cell grid gathered over its 3x3 neighbourhood rather than a
 * particle loop, and only exist while the fluid is churning.
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

/** Circle outline, signed. Positive outside the stroke. */
fn ringField(q: vec2<f32>, rad: f32, th: f32) -> f32 {
  return abs(length(q) - rad) - th;
}

/**
 * A triangle hanging point-down: q is relative to the middle of its wide top
 * edge, w the top half-width, h the drop to the apex. Positive outside.
 *
 * Point-down is not arbitrary — it puts the widest part of the die where the
 * answer text goes, which is the only way a phrase like ASK AGAIN LATER fits.
 */
fn triDown(q: vec2<f32>, w: f32, h: f32) -> f32 {
  let t = clamp(-q.y / h, 0.0, 1.0);
  let ww = w * (1.0 - t * 0.93);
  return max(abs(q.x) - ww, max(q.y, -q.y - h));
}

/**
 * Bubbles in the fluid, in the gravity frame.
 *
 * Laid out in ORIGIN space (al - phase) so a cell id names the same bubble for
 * its whole climb and the sideways waver can be a smooth function of time
 * without ever moving a bubble between cells. One rise speed for the layer: a
 * per-bubble speed grows without bound against the phase and tears the gather.
 */
fn bubbles(ax: f32, al: f32, ph: f32, amt: f32) -> f32 {
  let cs = 0.46;
  let o = vec2<f32>(ax, al - ph) / cs;
  let cell = floor(o);
  var acc = 0.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let cid = cell + vec2<f32>(f32(i), f32(j));
      let h1 = hash21(cid + vec2<f32>(7.31, 2.19));
      // Cells fade in as the churn passes their own hash, so bubbles appear
      // out of the fluid rather than popping into it. Edge order matters: amt
      // BELOW the cell's hash means nothing there, above it means a bubble.
      let vis = smoothstep(h1 - 0.3, h1, amt);
      if (vis > 0.004) {
        let h2 = hash21(cid + vec2<f32>(41.7, 13.3));
        let h3 = hash21(cid + vec2<f32>(91.1, 64.9));
        let k = h1 * 6.28318;
        var c = (cid + vec2<f32>(0.15 + 0.7 * h2, 0.15 + 0.7 * h3)) * cs;
        c.x = c.x + sin(ph * 2.1 + k) * cs * 0.16;
        let d = vec2<f32>(ax - c.x, al - (c.y + ph));
        let rr = 0.036 * (0.6 + 0.85 * h3);
        let q2 = dot(d, d) / (rr * rr);
        // Super-gaussian: a flat-ish core with a quick soft edge reads as a
        // bubble, where a plain gaussian reads as bokeh.
        acc = acc + exp(-q2 * q2 * 1.4) * vis;
      }
    }
  }
  return acc;
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
  let bubblePhase = u.liveData[0].x;
  let sway = u.liveData[0].y;

  // ---- The shelf it sits on. ----
  var col = vec3<f32>(0.038, 0.040, 0.048);
  col = col + vec3<f32>(0.10, 0.11, 0.16) * exp(-max(r - 1.0, 0.0) * 2.1) * 0.36;
  let shd = exp(-pow((p.y + 1.02) / 0.16, 2.0))
          * exp(-pow(p.x / 1.15, 2.0) * 1.6);
  col = col * (1.0 - shd * 0.6);

  let bm = 1.0 - smoothstep(-e, e, r - 1.0);
  if (bm > 0.001) {
    // ---- Glossy black plastic. ----
    let rc = min(r, 1.0);
    let nz = sqrt(max(1.0 - rc * rc, 0.0));
    let n = normalize(vec3<f32>(p.x, p.y, max(nz, 0.03)));
    let lgt = normalize(vec3<f32>(-0.44, 0.66, 0.61));
    let halfway = normalize(lgt + vec3<f32>(0.0, 0.0, 1.0));
    let ndl = max(dot(n, lgt), 0.0);
    // Clamped: outside the ball the pseudo-normal is huge, and an unclamped
    // pow overflows to inf, which turns the composite below into NaN.
    let sd = clamp(dot(n, halfway), 0.0, 1.0);

    var bc = vec3<f32>(0.026, 0.028, 0.034);
    bc = bc + vec3<f32>(0.085, 0.090, 0.105) * ndl * 0.5;
    bc = bc + vec3<f32>(0.34, 0.38, 0.48) * pow(sd, 12.0) * 0.1;
    bc = bc + vec3<f32>(1.0, 0.99, 0.97) * pow(sd, 110.0) * 0.95;
    // Fresnel: a glancing edge on a dielectric goes bright, which is what
    // makes the silhouette read as round rather than as a flat disc.
    let fres = pow(clamp(1.0 - nz, 0.0, 1.0), 2.6);
    bc = bc + vec3<f32>(0.16, 0.19, 0.28) * fres * 1.05;
    // And a thin bright line right at the silhouette, so the ball has an
    // edge against the background rather than fading into it.
    bc = bc + vec3<f32>(0.34, 0.4, 0.55)
       * exp(-pow((rc - 0.988) / 0.016, 2.0)) * 0.4;
    // Bounce off the shelf, and the shadowed underside.
    bc = bc + vec3<f32>(0.08, 0.08, 0.09)
       * smoothstep(-0.55, -1.0, p.y) * 0.5;
    bc = bc * (0.7 + 0.3 * smoothstep(-1.0, 0.35, p.y));

    // ---- The white 8, on the pole turned away from us. ----
    // Glyph space: y squashed, so a round glyph lands as the ellipse a circle
    // on a sphere's far pole actually projects to.
    let gp = vec2<f32>(p.x + 0.015, (p.y - 0.7) / 0.3);
    let eg = e / 0.3;
    let disc = 1.0 - smoothstep(-eg * 1.5, eg * 1.5, length(gp) - 0.28);
    if (disc > 0.001) {
      bc = mix(bc, vec3<f32>(0.86, 0.87, 0.89) * (0.55 + 0.45 * ndl), disc);
      let top = ringField(gp - vec2<f32>(0.0, 0.075), 0.072, 0.026);
      let bot = ringField(gp - vec2<f32>(0.0, -0.082), 0.088, 0.028);
      let glyph = (1.0 - smoothstep(-eg, eg, min(top, bot))) * disc;
      bc = mix(bc, vec3<f32>(0.06, 0.06, 0.07), glyph);
    }

    // ---- The window. ----
    let wp = p - vec2<f32>(0.0, wy);
    let wd = length(wp);
    // White plastic insert, then the clear window sunk into it.
    let insert = 1.0 - smoothstep(-e, e, wd - wr * 1.17);
    if (insert > 0.001) {
      var ic = vec3<f32>(0.88, 0.89, 0.91) * (0.5 + 0.5 * ndl);
      // A dark crease where the insert meets the black plastic.
      ic = ic * (1.0 - (1.0 - smoothstep(0.0, wr * 0.06, wr * 1.17 - wd)) * 0.45);
      bc = mix(bc, ic, insert);
    }

    let wm = 1.0 - smoothstep(-e, e, wd - wr);
    if (wm > 0.001) {
      // Window space, normalized so the rim is at |q| = 1.
      let q = wp / wr;
      // Gravity frame: dn points downhill, ax runs across it.
      let dn = vec2<f32>(sin(tilt), -cos(tilt));
      let up = -dn;
      let across = vec2<f32>(-up.y, up.x);
      let al = dot(q, up);
      let axx = dot(q, across);

      // ---- Murky fluid: fbm, domain-warped, swirling harder when churned. ----
      let w1 = fbm(q * 1.9 + vec2<f32>(swirl * 0.13, 1.7)) - 0.5;
      let w2 = fbm(q * 1.9 + vec2<f32>(5.2, swirl * 0.11 + 9.1)) - 0.5;
      let qq = q + vec2<f32>(w1, w2) * (0.15 + 0.4 * churn);
      let ink = fbm(qq * 2.7 + vec2<f32>(0.0, swirl * 0.07));
      var mc = mix(vec3<f32>(0.008, 0.017, 0.062),
                   vec3<f32>(0.055, 0.082, 0.25), ink);
      // The mix alone is too even to read as moving fluid; a steep power of
      // the same field picks out tendrils where the ink has piled up. Gated on
      // churn, because agitated fluid is what catches the light — at rest this
      // has to stay near black or the die has nothing to read against.
      mc = mc + vec3<f32>(0.11, 0.15, 0.33)
         * pow(clamp(ink, 0.0, 1.0), 2.4) * (0.16 + 0.84 * churn);
      // Deep in the middle, and the ink pools downhill.
      mc = mc * (0.74 + 0.4 * (1.0 - dot(q, q)));
      mc = mc * (0.9 + 0.2 * smoothstep(1.0, -1.0, al));

      // ---- The answer die, floating up the world-up axis. ----
      let depth = 0.55 * (1.0 - rise);
      let fc = up * -depth + across * sway * 0.1;
      let scl = mix(0.62, 0.92, rise);
      let fq = (q - fc) / scl;
      let td = triDown(fq - vec2<f32>(0.0, 0.44), 0.84, 1.2);
      // The edge softness IS the focus cue: metres of ink in front of it when
      // it is deep, pressed against the glass when it is up.
      let te = mix(0.34, 0.016, rise);
      let tm = 1.0 - smoothstep(-te, te, td);
      if (tm > 0.002) {
        var fcol = mix(vec3<f32>(0.085, 0.125, 0.335),
                       vec3<f32>(0.165, 0.235, 0.55),
                       smoothstep(0.5, -0.9, fq.y));
        // A bevel catching the light along the top edge.
        let bev = (1.0 - smoothstep(0.0, 0.075, abs(td)))
                * smoothstep(-0.2, 0.5, fq.y);
        fcol = fcol + vec3<f32>(0.3, 0.36, 0.5) * bev * 0.5;
        // Ink in front of it while it is still deep.
        fcol = mix(mc * 0.72, fcol, smoothstep(0.02, 0.7, rise));
        mc = mix(mc, fcol, tm * mix(0.55, 1.0, rise));
      }

      // ---- Bubbles, only while the fluid is moving. ----
      let amt = churn * 0.85;
      if (amt > 0.012) {
        let bb = bubbles(axx, al, bubblePhase, amt);
        mc = mc + vec3<f32>(0.5, 0.62, 0.8) * clamp(bb, 0.0, 1.0) * 0.22;
      }

      // ---- The glass over the window. ----
      // Thickness darkens the rim, and a soft inner shadow seats it.
      mc = mc * (1.0 - smoothstep(0.68, 1.0, length(q)) * 0.55);
      let g1 = (q - vec2<f32>(-0.4, 0.46)) * vec2<f32>(1.0, 1.5);
      mc = mc + vec3<f32>(1.0, 1.0, 1.0) * exp(-dot(g1, g1) / 0.1) * 0.26;
      let g2 = q - vec2<f32>(0.42, -0.36);
      mc = mc + vec3<f32>(0.7, 0.8, 1.0) * exp(-dot(g2, g2) / 0.05) * 0.09;

      bc = mix(bc, mc, wm);
    }

    col = mix(col, bc, bm);
  }

  // ---- Room vignette, then dither so the dark background does not band. ----
  let vc = uv - vec2<f32>(0.5, 0.5);
  col = col * (1.0 - dot(vc, vc) * 0.5);
  let dth = (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);
  return vec4<f32>(clamp(col + vec3<f32>(dth), vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
