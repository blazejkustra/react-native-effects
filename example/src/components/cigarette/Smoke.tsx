import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * `[tipX, tipY, cigWidth, tobaccoLength]`. The unburnt tobacco tip is in
   * screen uv (y-up); the two sizes are fractions of the screen HEIGHT.
   */
  params: number[];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The room and the smoke in it.
 *
 * One opaque full-screen pass: the black room, the faint warmth the coal
 * throws, the sidestream plume climbing off the ash, and the crumbs that
 * come away with a knocked-off piece of ash. The cigarette is composited on
 * top by its own view.
 *
 * The plume is built the way a real one is shaped. It leaves the tip as a
 * LAMINAR ribbon: a thin, sharp-edged sheet that rises straight and only
 * waves a little. Some way up it goes turbulent: the sheet folds over on
 * itself into curls, spreads and thins out. In the shader that is one thin
 * Gaussian ribbon evaluated in DOMAIN-WARPED coordinates — the warp is near
 * zero at the tip and grows with height, so the same ribbon is a clean
 * thread low down and a tangle of folded veils higher up, and the veils are
 * bright where the fold compresses the sheet, exactly like edge-on smoke.
 * The whole frame is rotated by the phone's tilt, so "up" is the real up.
 *
 * Budget: two 3-octave fbm samples for the warp field, reused by every
 * layer, and everything is skipped outside the plume's bounding box.
 */
export default function Smoke({
  params,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={SMOKE_SHADER}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const SMOKE_SHADER = /* wgsl */ `
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

// Keep in step with the hook.
const CHUNK_DURATION = 1.6;

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
  for (var i = 0; i < 3; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// The ash crust, shared by the column on the cigarette and the piece that
// falls off it. cp is the crust-space coordinate (~14 units across the
// paper), h the height above the coal (lengths), heat how hard the coal is
// burning, shade the cylinder's shading across it.
//
// Not tiles: a real coal is open glowing tobacco with soft-edged flakes of
// grey ash lying over it, and the flakes take over as it cools further up.
fn crust(cp: vec2<f32>, h: f32, heat: f32, shade: f32, emberCol: vec3<f32>) -> vec3<f32> {
  // Three scales of flake, none finer than a few pixels — the finest layer
  // is what read as pixel grit on a phone.
  let n1 = vnoise(cp * 0.55);
  let n2 = vnoise(cp * 1.3 + 7.0);
  let n3 = vnoise(cp * 2.6 + 3.0);
  let flakeN = n1 * 0.50 + n2 * 0.35 + n3 * 0.15;
  let glow = exp(-max(h, 0.0) * 30.0) * clamp(heat * 1.6, 0.0, 1.2);
  let g = clamp(glow, 0.0, 1.0);

  // What shows between the flakes: dark ash seams when cold, coal when hot,
  // with brighter grains where the tobacco is burning hardest.
  let seam = vec3<f32>(0.36, 0.34, 0.32) * shade * (0.8 + 0.4 * n2);
  var coal = emberCol * (0.70 + 0.55 * n2) * (0.85 + 0.15 * shade);
  coal = coal + vec3<f32>(0.35, 0.18, 0.02) * smoothstep(0.62, 0.90, n3) * g;
  let open = mix(seam, coal, g);

  // The flakes: pale grey, lit from below where they lie on the coal, and a
  // few of them charred black right at the fire.
  var flake = vec3<f32>(0.74, 0.72, 0.69) * (0.82 + 0.18 * n2) * (0.92 + 0.08 * n3) * shade;
  flake = mix(flake, emberCol * 0.95, g * 0.40 * (1.0 - n1));
  let charred = smoothstep(0.40, 0.22, n2) * g;
  flake = mix(flake, vec3<f32>(0.14, 0.11, 0.10), charred * 0.85);

  // More of the surface is bare coal the hotter it is; soft edges, always.
  let th = 0.62 - 0.32 * g;
  let cover = smoothstep(th - 0.13, th + 0.13, flakeN);
  return mix(open, flake, cover);
}

// One ribbon of smoke: a thin Gaussian around a centreline that waves more
// the higher it goes. q is the (warped) plume-space point, w the
// ribbon's half-width there.
fn ribbon(q: vec2<f32>, w: f32, phase: f32, seed: f32) -> f32 {
  let h = max(q.y, 0.0);
  // Sinuous instability: a small wave at the tip that grows with height,
  // travelling upward with the smoke.
  let amp = 0.002 + 0.035 * smoothstep(0.04, 0.45, h);
  let wave = sin(h * 17.0 - phase * 3.4 + seed) * amp;
  // A slow meander on top, so the column drifts as a whole.
  let meander = (vnoise(vec2<f32>(h * 1.6 - phase * 0.35, 5.0 + seed)) - 0.5) * 0.14 * h;
  let dx = (q.x - wave - meander) / w;
  // A sheet seen side-on is brighter at its rims than through its middle.
  return exp(-dx * dx) * (0.45 + 1.0 * dx * dx);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;

  let tip = u.params0.xy;
  let cigW = max(u.params0.z, 0.001);
  let tobacco = max(u.params0.w, 0.001);

  let ember = clamp(u.live.x, 0.0, 1.0);
  let draw = clamp(u.live.y, 0.0, 1.0);
  let puff = clamp(u.live.z, 0.0, 1.0);
  let tilt = u.live.w;
  let phase = u.liveData[0].x;
  let burn = clamp(u.liveData[0].y, 0.0, 1.0);
  let ash = clamp(u.liveData[0].z, 0.0, 1.0);
  let puffAge = clamp(u.liveData[0].w, 0.0, 1.0);
  let chunkAge = clamp(u.liveData[1].y, 0.0, 1.0);
  let flare = clamp(u.liveData[1].z, 0.0, 1.0);
  let vis = clamp(u.liveData[1].w, 0.0, 1.0);
  let chunkLen = clamp(u.liveData[2].x, 0.0, 1.0);
  let chunkKick = clamp(u.liveData[2].y, -1.0, 1.0);

  // Where the coal is now, and where the ash ends above it: that is where
  // the smoke comes off.
  let burnY = tip.y - burn * tobacco;
  let ashTopY = burnY + max(ash * tobacco, 0.014 * tobacco);

  // Plume space: origin on top of the ash, ONE unit = the screen's height,
  // rotated so y runs along the real up.
  let p0 = vec2<f32>((uv.x - tip.x) * aspect, uv.y - ashTopY);
  let up = vec2<f32>(-sin(tilt), cos(tilt));
  let right = vec2<f32>(cos(tilt), sin(tilt));
  let p = vec2<f32>(dot(p0, right), dot(p0, up));

  let breath = 0.70 + 0.30 * vnoise(vec2<f32>(phase * 1.8, 2.0));
  let heat = (ember * breath * (0.42 + 0.58 * draw) + flare * 0.9) * vis;

  // ---- The room: black. The coal warms the wall a little, nothing more. ----
  var col = vec3<f32>(0.006, 0.006, 0.008);
  let lp = p0 - vec2<f32>(0.0, burnY - ashTopY);
  let ld2 = dot(lp, lp);
  col = col + vec3<f32>(1.00, 0.40, 0.10) * heat * 0.10 / (1.0 + ld2 * 420.0);

  // ---- The plume. ----
  let source = (ember * (0.65 + 0.35 * breath) * (1.0 - 0.75 * draw)) * vis;
  let puffPos = 0.02 + puffAge * 0.9;
  let puffBand = exp(-pow((p.y - puffPos) / (0.06 + 0.20 * puffAge), 2.0)) * puff;
  if ((source > 0.003 || puffBand > 0.003) && p.y > -0.03 && p.y < 1.05 && abs(p.x) < 0.55) {
    let h = max(p.y, 0.0);

    // Laminar at the tip, turbulent above: the warp's amplitude is what
    // makes the difference, and an exhale surge kicks it up early.
    let turb = smoothstep(0.05, 0.35, h) + puffBand * 0.6;
    let wAmp = 0.005 + 0.075 * turb;

    // The warp field, scrolled upward with the smoke. Two fbm samples make
    // a vector field; a second, finer warp of that field adds the small
    // curls inside the big folds.
    let rise = phase * 0.5;
    let q0 = vec2<f32>(p.x, h - rise) * 7.0;
    let d1 = vec2<f32>(fbm(q0 + vec2<f32>(3.1, 7.3)), fbm(q0 + vec2<f32>(9.7, 1.3))) - 0.5;
    let q1 = q0 * 2.5 + d1 * 1.5;
    let d2 = vec2<f32>(vnoise(q1 + vec2<f32>(11.0, 4.0)), vnoise(q1 + vec2<f32>(2.0, 17.0))) - 0.5;
    let warp = d1 * wAmp * 2.0 + d2 * wAmp * 0.9 * smoothstep(0.10, 0.5, h);
    let q = vec2<f32>(p.x + warp.x, h + warp.y * 0.8);

    // Two ribbons out of phase — a real plume is a few sheets, not one —
    // their width opening slowly with height and fattening in a surge.
    let w = cigW * 0.15 * (1.0 + 2.2 * q.y) + puffBand * 0.015;
    let r1 = ribbon(q, w, phase, 0.0);
    let r2 = ribbon(q + vec2<f32>(cigW * 0.08, 0.0), w * 0.7, phase, 2.1) * 0.6;
    // A soft body of diffuse smoke around the sheets once it has mixed.
    let body = exp(-pow(q.x / (w * 4.0), 2.0)) * 0.08 * smoothstep(0.12, 0.5, h);

    // Thins as it climbs and mixes into the room.
    let fade = smoothstep(-0.015, 0.008, p.y) * (1.0 - smoothstep(0.5, 0.95, h)) / (1.0 + 1.2 * h);
    var dens = (r1 + r2 + body) * fade;
    dens = dens * (source + puffBand * 1.4);

    // Sidestream smoke is BLUE: fine particles scatter the short wavelengths.
    // It goes white where sheets pile up, and warm right above the coal.
    let sa = clamp(dens * 0.75, 0.0, 0.88);
    var smokeCol = mix(vec3<f32>(0.45, 0.60, 0.90), vec3<f32>(0.93, 0.96, 1.0), smoothstep(0.15, 0.8, sa));
    smokeCol = mix(smokeCol, vec3<f32>(0.98, 0.78, 0.55), heat * exp(-h * 40.0) * 0.5);
    // Screen blend: lighter where sheets overlap, never past white.
    col = col + smokeCol * sa * (1.0 - col);
  }

  // ---- The knocked-off piece of ash, and the crumbs that come with it. ----
  // The cigarette pane draws the same piece in front of the paper; this copy
  // behind it is what keeps it in the picture once it has tumbled out of
  // that narrow pane.
  if (chunkAge < 1.0 && chunkLen > 0.0) {
    let t = chunkAge * CHUNK_DURATION;
    let origin = vec2<f32>(0.0, burnY - ashTopY);
    // Everything here is in screen-height units; the cigarette's length is
    // the yardstick the pane uses, so convert.
    let cigL = tobacco / 0.644;
    let hw = cigW * 0.5;
    let len = chunkLen * tobacco;
    let breathC = 0.70 + 0.30 * vnoise(vec2<f32>(phase * 1.8, 2.0));
    let heatC = ember * breathC * 0.62 + flare * 0.9;
    let emberCol = mix(vec3<f32>(0.80, 0.12, 0.01), vec3<f32>(1.0, 0.66, 0.20),
                       clamp(heatC - 0.30, 0.0, 1.0));
    let pos = origin + up * (0.008 * cigL + len * 0.5)
            - up * (0.5 * 5.0 * t * t * cigL) + right * (chunkKick * 0.6 * t * cigL)
            + up * (0.35 * abs(chunkKick) * t * cigL);
    let rot = chunkKick * 4.0 * t + 0.8 * t;
    let d = p0 - pos;
    // Into the piece's own frame: first undo the tilt, then its tumble.
    let dl = vec2<f32>(dot(d, right), dot(d, up));
    let cs = cos(rot);
    let sn = sin(rot);
    let c = vec2<f32>(dl.x * cs + dl.y * sn, -dl.x * sn + dl.y * cs);
    let cx = c.x / hw;
    let cyL = c.y / cigL;
    let edgeN = vnoise(vec2<f32>(5.0, cyL * 140.0 + 40.0)) - 0.5;
    let edgeR = 0.93 + edgeN * 0.09;
    let insideX = smoothstep(edgeR, edgeR - 0.06, abs(cx));
    let endRag = (vnoise(vec2<f32>(cx * 3.0 + 17.0, 1.0)) - 0.5) * 0.012 * cigL;
    let insideY = smoothstep(len * 0.5 + 0.004 * cigL, len * 0.5 - 0.004 * cigL, abs(c.y) + endRag);
    let cshade = 0.50 + 0.50 * sqrt(max(1.0 - cx * cx * 0.92, 0.0));
    let hc = (c.y + len * 0.5) / cigL;
    let chunkHeat = ember * 0.8 * exp(-t * 3.5);
    let ccol = crust(vec2<f32>(cx * 7.0, cyL * 84.0 + 300.0), hc, chunkHeat, cshade, emberCol);
    let ca = insideX * insideY * (1.0 - smoothstep(0.70, 1.0, chunkAge));
    col = mix(col, ccol, ca);
    for (var i = 0; i < 6; i = i + 1) {
      let fi = f32(i);
      let h1 = hash21(vec2<f32>(fi, 1.0));
      let h2 = hash21(vec2<f32>(fi, 2.0));
      let h3 = hash21(vec2<f32>(fi, 3.0));
      let side = select(-1.0, 1.0, h1 > 0.5);
      let vx = side * (0.03 + 0.08 * h2) + chunkKick * 0.10;
      let fpos = origin + right * (cigW * 0.35 * side + vx * t)
               + up * ((ashTopY - burnY) * h3 + 0.02 * h2 * t - (0.14 + 0.16 * h1) * t * t);
      let r = length(p0 - fpos);
      let sz = 0.0018 + 0.0022 * h3;
      let flake = smoothstep(sz, sz * 0.3, r) * (1.0 - smoothstep(0.6, 1.0, chunkAge));
      let glowF = smoothstep(0.35, 0.0, chunkAge) * ember;
      let fcol = mix(vec3<f32>(0.50, 0.48, 0.46), vec3<f32>(1.0, 0.45, 0.10), glowF * h2);
      col = mix(col, fcol, flake);
    }
  }

  // ---- Frame: the faintest vignette, and dither so the black stays clean. ----
  let vd = (uv - vec2<f32>(0.5, 0.45)) * vec2<f32>(1.10, 1.00);
  col = col * (1.0 - clamp(dot(vd, vd), 0.0, 1.0) * 0.5);
  col = col + (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
