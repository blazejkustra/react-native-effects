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
  /** `u.live = (damage 0..4, flex 0..1, 0, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The iPhone Duo "crackgate" failure as a transparent layer over the live
 * screen, matched to the owner photos: a hairline crack on the crease, then a
 * row of stuck white pixels from the hinge to the right edge, a magenta row
 * under it and a faint green column running down the hinge, and finally a
 * slight backlight flicker around the damage. The hinge is the vertical
 * centre line of the view. `damage` walks through the four stages; `flex`
 * deepens the crease while the panel is being flexed.
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
const CREASE: f32 = 9.0;        // crease half-width, logical px
const HAIRLINE: f32 = 70.0;     // crack length along the crease, logical px
const WHITE_ROWS: f32 = 7.0;    // stuck rows, device px
const MAGENTA_GAP: f32 = 4.0;   // device px between the white and magenta rows
const MAGENTA_ROWS: f32 = 3.0;
const GREEN_COLS: f32 = 2.0;

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 12.9898) * 43758.5453);
}

// Premultiplied "over": paints a layer of colour rgb and coverage a on top.
fn over(dst: vec4<f32>, rgb: vec3<f32>, a: f32) -> vec4<f32> {
  let k = clamp(a, 0.0, 1.0);
  return vec4<f32>(rgb * k + dst.rgb * (1.0 - k), k + dst.a * (1.0 - k));
}

// The crack wanders a pixel or so around the crease line.
fn crackX(y: f32, hx: f32) -> f32 {
  return hx + 0.6 * sin(y * 0.08) + 0.35 * sin(y * 0.29 + 1.7);
}

fn segDist(q: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let t = clamp(dot(q - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return length(q - (a + ab * t));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let dpr = u.resolution.w;
  let size = u.resolution.xy / dpr;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * size;
  let damage = u.live.x;
  let flex = u.live.y;
  let t = u.time.x;

  let hx = floor(size.x * 0.5 * dpr) / dpr;
  let y0 = floor(size.y * CRACK_Y * dpr) / dpr;
  let dx = q.x - hx;
  let black = vec3<f32>(0.0);
  let white = vec3<f32>(1.0);
  var o = vec4<f32>(0.0);

  // Crease: a faint dip with soft shoulders, deeper while flexed.
  let crease = exp(-(dx * dx) / (CREASE * CREASE));
  let shoulder = exp(-pow((abs(dx) - CREASE * 0.9) / 3.0, 2.0));
  o = over(o, black, crease * (0.035 + 0.11 * flex));
  o = over(o, white, shoulder * (0.012 + 0.05 * flex));

  let s1 = clamp(damage, 0.0, 1.0);
  let s2 = clamp(damage - 1.0, 0.0, 1.0);
  let s3 = clamp(damage - 2.0, 0.0, 1.0);
  let s4 = clamp(damage - 3.0, 0.0, 1.0);

  // Backlight flicker around the damage: a slow uneven wobble plus rare,
  // shallow dips, a few percent at most.
  let slot = floor(t * 7.0);
  let dip = step(0.93, hash11(slot)) * 0.08;
  let wobble = max(0.03 * sin(t * 11.0) * sin(t * 2.3 + 1.0) + dip, 0.0);
  let near = exp(-length(vec2<f32>(dx * 0.5, q.y - y0)) / 140.0);
  o = over(o, black, s4 * wobble * near);

  // Stage 1: hairline crack up and down the crease from the failure point.
  if (s1 > 0.0) {
    let up = y0 - HAIRLINE * 0.45 * s1;
    let down = y0 + HAIRLINE * s1;
    if (q.y > up && q.y < down) {
      let d = abs(q.x - crackX(q.y, hx)) * dpr;
      let along = 1.0 - smoothstep(0.6, 1.0, abs(q.y - y0) / max(down - y0, 1.0));
      let shadow = 1.0 - smoothstep(0.8, 2.2, abs(d - 1.4));
      o = over(o, black, shadow * 0.18 * along);
      let line = 1.0 - smoothstep(0.2, 0.9, d);
      o = over(o, vec3<f32>(0.8, 0.82, 0.84), line * 0.4 * along);
    }
    let c = vec2<f32>(crackX(y0, hx), y0);
    let chipA = segDist(q, c, c + vec2<f32>(9.0, -6.0) * s1) * dpr;
    let chipB = segDist(q, c + vec2<f32>(0.0, 12.0), c + vec2<f32>(-7.0, 21.0) * s1) * dpr;
    let chips = 1.0 - smoothstep(0.2, 0.9, min(chipA, chipB));
    o = over(o, vec3<f32>(0.72, 0.74, 0.76), chips * 0.25);
  }

  let row = floor(q.y * dpr) - floor(y0 * dpr);
  let column = floor(q.x * dpr) - floor(hx * dpr);

  // Stage 2: a row of stuck white pixels shooting from the hinge to the
  // right edge.
  if (s2 > 0.0) {
    let reach = hx + (size.x - hx) * smoothstep(0.0, 0.85, s2);
    let lit = min(s2 * 3.0, 1.0) * (0.97 - 0.06 * s4 * wobble);
    let lineSpan = select(0.0, 1.0, column >= 0.0 && q.x < reach);
    let rowMid = floor(y0 * dpr) + WHITE_ROWS * 0.5;
    let glowDist = max(abs(q.y * dpr - rowMid) - WHITE_ROWS * 0.5, 0.0);
    o = over(o, white, exp(-glowDist / (2.5 * dpr)) * 0.1 * lit * lineSpan);
    if (row >= 0.0 && row < WHITE_ROWS) {
      o = over(o, vec3<f32>(0.98, 0.99, 1.0), lit * lineSpan);
    }
  }

  // Stage 3: a magenta row under the white one and a green column running
  // down the hinge to the bottom edge.
  if (s3 > 0.0) {
    let m0 = WHITE_ROWS + MAGENTA_GAP;
    if (row >= m0 && row < m0 + MAGENTA_ROWS && column >= 0.0) {
      o = over(o, vec3<f32>(0.66, 0.27, 0.95), s3 * 0.85);
    }
    let bottom = y0 + (size.y - y0) * smoothstep(0.0, 0.7, s3);
    if (column >= 1.0 && column < 1.0 + GREEN_COLS && row > 0.0 && q.y < bottom) {
      o = over(o, vec3<f32>(0.66, 0.82, 0.42), s3 * 0.6);
    }
  }

  return o;
}
`;
