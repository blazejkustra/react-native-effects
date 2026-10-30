import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

/** Where the crack starts on the hinge, as a fraction of the panel height. */
export const CRACK_Y = 0.58;
export const FAILURE_STAGES = 4;

type HingeFailureProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'texture'
> & {
  /** `u.live = (damage 0..4, glitch 0..1, 0, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A foldable inner display dying along its crease, as a transparent layer
 * over the live screen, after the viral owner photos: a crack runs the length
 * of the hinge, stuck white, magenta, green and cyan pixel columns shoot out of
 * it, black ink bleeds out from the failure point, and finally the lines
 * spread across the panel and the damage flickers. The hinge is the vertical
 * centre line of the view. `damage` walks through the four stages, `glitch`
 * is a short tearing burst played as each stage lands.
 */
export default function HingeFailure({
  paramsSynchronizable,
  ...rest
}: HingeFailureProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      transparent
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
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const CRACK_Y: f32 = ${CRACK_Y};
const BLACK: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
const WHITE: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0);
const MAGENTA: vec3<f32> = vec3<f32>(1.0, 0.22, 0.88);
const GREEN: vec3<f32> = vec3<f32>(0.3, 1.0, 0.42);
const CYAN: vec3<f32> = vec3<f32>(0.25, 0.9, 1.0);
const YELLOW: vec3<f32> = vec3<f32>(1.0, 0.95, 0.35);

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 12.9898) * 43758.5453);
}

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fbm(p: vec2<f32>) -> f32 {
  return 0.55 * noise(p) + 0.3 * noise(p * 2.1 + 5.2) + 0.15 * noise(p * 4.3 + 1.7);
}

fn palette(k: f32) -> vec3<f32> {
  if (k < 0.3) { return WHITE; }
  if (k < 0.55) { return MAGENTA; }
  if (k < 0.75) { return GREEN; }
  if (k < 0.9) { return CYAN; }
  return YELLOW;
}

// Premultiplied "over": paints a layer of colour rgb and coverage a on top.
fn over(dst: vec4<f32>, rgb: vec3<f32>, a: f32) -> vec4<f32> {
  let k = clamp(a, 0.0, 1.0);
  return vec4<f32>(rgb * k + dst.rgb * (1.0 - k), k + dst.a * (1.0 - k));
}

fn segDist(q: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let t = clamp(dot(q - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return length(q - (a + ab * t));
}

// The crack wanders a couple of points around the crease line.
fn crackX(y: f32, hx: f32) -> f32 {
  return hx + 2.2 * (noise(vec2<f32>(y * 0.08, 3.1)) - 0.5)
            + 0.8 * (noise(vec2<f32>(y * 0.45, 7.3)) - 0.5);
}

// Signed distance to the ink: a blot at the failure point stretched along the
// hinge, a smaller one higher up, both with ragged noisy edges.
fn inkDist(q: vec2<f32>, hx: f32, y0: f32, size: vec2<f32>, s3: f32, s4: f32) -> f32 {
  let k = clamp(size.x / 900.0, 0.6, 1.0);
  let h = size.y;
  let warp = (fbm(q * 0.035) - 0.5) * k;
  let r1 = (30.0 * smoothstep(0.0, 1.0, s3) + 60.0 * s4) * k;
  let p1 = vec2<f32>(q.x - hx, (q.y - y0) * 0.33);
  let d1 = length(p1) + warp * (14.0 + r1 * 0.8) - r1;
  let r2 = 26.0 * s4 * k;
  let p2 = vec2<f32>(q.x - hx, (q.y - (y0 - h * 0.36)) * 0.45);
  let d2 = length(p2) + warp * (10.0 + r2 * 0.8) - r2;
  return min(d1, select(1000.0, d2, s4 > 0.0));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let dpr = u.resolution.w;
  let size = u.resolution.xy / dpr;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * size;
  let damage = u.live.x;
  let t = u.time.x;

  let hx = floor(size.x * 0.5 * dpr) / dpr;
  let y0 = floor(size.y * CRACK_Y * dpr) / dpr;
  let dx = q.x - hx;
  let vy = abs(q.y - y0);

  let s1 = clamp(damage, 0.0, 1.0);
  let s2 = clamp(damage - 1.0, 0.0, 1.0);
  let s3 = clamp(damage - 2.0, 0.0, 1.0);
  let s4 = clamp(damage - 3.0, 0.0, 1.0);

  // Glitch: the stage burst from JS plus rare short tears once fully broken.
  let slot = floor(t * 9.0);
  let rare = step(0.9, hash11(slot + 0.37)) * s4 * 0.7;
  let g = clamp(max(u.live.y, rare), 0.0, 1.0);
  let band = floor(q.y / 12.0);
  let torn = step(0.65, hash21(vec2<f32>(band + 3.0, slot)));
  let tear = (hash21(vec2<f32>(band, slot)) - 0.5) * 26.0 * g * torn;
  let qx = q.x + tear;

  var o = vec4<f32>(0.0);

  let crease = exp(-(dx * dx) / 100.0);
  o = over(o, BLACK, crease * 0.08);

  // Backlight flicker around the damage once it is fully broken.
  let wobble = max(0.06 * sin(t * 13.0) * sin(t * 2.9 + 1.0), 0.0);
  let near = exp(-length(vec2<f32>(dx * 0.4, q.y - y0)) / 160.0);
  o = over(o, BLACK, s4 * (wobble + 0.2 * g) * near);

  // Stage 3: black ink bleeding out of the failure point, a dead column down
  // the whole hinge, and a dithered fringe of dead pixels around the blot.
  if (s3 > 0.0) {
    let sd = inkDist(vec2<f32>(qx, q.y), hx, y0, size, s3, s4);
    let core = 1.0 - smoothstep(-1.0, 1.0, sd);
    let strip = (1.5 + 4.5 * s4) * s3 * (0.6 + 0.8 * noise(vec2<f32>(q.y * 0.04, 1.0)));
    let column = 1.0 - smoothstep(-0.5, 0.8, abs(qx - hx) - strip);
    let fringe = (1.0 - smoothstep(0.0, 12.0, sd)) * step(0.0, sd);
    let cell = floor(q * dpr / 2.0);
    let dead = step(1.0 - fringe * 0.75, hash21(cell));
    o = over(o, vec3<f32>(0.2, 0.02, 0.28), fringe * 0.4 * s3);
    o = over(o, BLACK, max(max(core, column), dead));
  }

  // Stage 2: stuck pixel columns shooting up and down from the failure point,
  // and a white row out to the right edge. Stage 4 spreads them sideways.
  if (s2 > 0.0) {
    let col = floor(qx * dpr) - floor(hx * dpr);
    let id = floor(col / 2.0);
    let spread = (24.0 + size.x * 0.17 * s4) * dpr;
    let lit = min(s2 * 2.5, 1.0);
    let reach = size.y * smoothstep(0.0, 0.9, s2);
    var rgb = BLACK;
    var a = 0.0;
    if (col >= 3.0 && col < 9.0) {
      rgb = WHITE;
      a = 1.0;
    } else if (col >= -7.0 && col < -3.0) {
      rgb = GREEN;
      a = 0.95;
    } else if (col >= 14.0 && col < 19.0) {
      rgb = MAGENTA;
      a = 0.95;
    } else if (col >= -20.0 && col < -16.0) {
      rgb = CYAN;
      a = 0.9;
    } else if (abs(col) < spread) {
      let shown = hash11(id + 9.1) < s2 * 0.6 + s4 * 0.9;
      if (hash11(id * 1.37 + 5.0) > 0.88 && shown) {
        rgb = palette(hash11(id + 2.3));
        a = 0.85;
        let partial = hash11(id + 4.2);
        if (partial > 0.55) {
          let mid = size.y * hash11(id + 6.6);
          a = a * step(abs(q.y - mid), size.y * 0.45 * partial);
        }
      }
    }
    let flicker = 0.88 + 0.12 * sin(t * 31.0 + id * 1.7);
    o = over(o, rgb, a * lit * flicker * step(vy, reach) * (1.0 - 0.4 * g));

    let row = floor(q.y * dpr) - floor(y0 * dpr);
    let rowReach = hx + (size.x - hx) * smoothstep(0.0, 0.8, s2);
    if (row >= -3.0 && row < 3.0 && qx > hx && qx < rowReach) {
      o = over(o, WHITE, lit);
    }
    if (row >= 6.0 && row < 9.0 && qx > hx && qx < rowReach) {
      o = over(o, MAGENTA, lit * 0.9);
    }
  }

  // Stage 1: the crease cracks open from the failure point to both edges,
  // with a few short fractures branching out where it started.
  if (s1 > 0.0) {
    if (vy < size.y * smoothstep(0.0, 1.0, s1)) {
      let d = q.x - crackX(q.y, hx);
      let shadow = 1.0 - smoothstep(1.0, 5.0, abs(d));
      let core = 1.0 - smoothstep(0.6, 1.4, abs(d));
      let glint = 1.0 - smoothstep(0.0, 0.7, abs(d - 1.7));
      o = over(o, BLACK, shadow * 0.35);
      o = over(o, BLACK, core * 0.95);
      o = over(o, vec3<f32>(0.92, 0.93, 0.95), glint * 0.6);
    }
    let c = vec2<f32>(crackX(y0, hx), y0);
    var bd = 1000.0;
    for (var i = 0; i < 6; i = i + 1) {
      let fi = f32(i);
      let ang = fi * 1.047 + 0.4 + (hash11(fi) - 0.5) * 0.7;
      let dir = vec2<f32>(cos(ang), sin(ang));
      let len = (14.0 + 30.0 * hash11(fi + 3.0)) * s1;
      let mid = c + dir * len * 0.5 + vec2<f32>(-dir.y, dir.x) * (hash11(fi + 7.0) - 0.5) * 6.0;
      bd = min(bd, min(segDist(q, c, mid), segDist(q, mid, c + dir * len)));
    }
    o = over(o, BLACK, (1.0 - smoothstep(0.4, 1.1, bd)) * 0.9);
    o = over(o, WHITE, (1.0 - smoothstep(0.0, 0.6, abs(bd - 1.3))) * 0.3);
    o = over(o, BLACK, 1.0 - smoothstep(3.0, 5.0, length(q - c)));
  }

  // Glitch bursts: a few torn rows of coloured garbage across the damage.
  if (g > 0.0 && damage > 0.0) {
    let pick = hash21(vec2<f32>(band, slot + 11.0));
    if (pick > 0.8 && abs(dx) < size.x * (0.08 + 0.3 * s4)) {
      let block = hash21(vec2<f32>(floor(q.x * dpr / 6.0), band));
      let on = step(0.5, hash21(vec2<f32>(floor(q.x * dpr / 3.0), band + slot)));
      o = over(o, palette(block), 0.6 * g * on);
    }
  }

  return o;
}
`;
