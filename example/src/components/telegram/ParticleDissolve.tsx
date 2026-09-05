import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

export type DissolveRect = { x: number; y: number; w: number; h: number };

type ParticleDissolveProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'params'
> & {
  /** `u.live = (progress 0→1, seed, 0, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
  /** Where the snapshot sits inside this canvas, in logical px, y-down. */
  textureRect: DissolveRect;
  /** The bubble behind the snapshot (source of the sparse tinted dust). */
  bubbleRect: DissolveRect;
};

/**
 * Telegram-style "message dissolve": the snapshot of a view is cut into a grid
 * of ~1.5pt cells, and a sweep running left→right turns each cell into a
 * particle that drifts up-left on a smooth wind field, jitters, twinkles and
 * fades. Cells the sweep has not reached yet are drawn from the snapshot
 * pixel-exact, so the hand-off from "view" to "dust" is seamless.
 *
 * Fragment shaders can't scatter, so the large drift is a smooth, invertible
 * field (undone per fragment with a short fixed-point iteration) and the
 * per-particle randomness is bounded to what a 7×7 cell gather can cover.
 */
export default function ParticleDissolve({
  paramsSynchronizable,
  textureRect,
  bubbleRect,
  ...rest
}: ParticleDissolveProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[
        textureRect.x,
        textureRect.y,
        textureRect.w,
        textureRect.h,
        bubbleRect.x,
        bubbleRect.y,
        bubbleRect.w,
        bubbleRect.h,
      ]}
      colors={['#7C40FB']}
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

// Timeline, in progress units (0..1 over the whole animation).
const SWEEP: f32 = 0.36;   // the front crosses the bubble left -> right
const JITTER: f32 = 0.06;  // per-cell start scatter
const LIFE: f32 = 0.58;    // a particle's life once released
const CELL: f32 = 1.5;     // particle grid, logical px
const GATHER: i32 = 3;     // neighbourhood half-width in cells
const SPREAD: f32 = 2.4;   // per-particle random offset, logical px (< GATHER*CELL)
const DRIFT: f32 = 140.0;  // wind travel over a life, logical px
const BODY_DROP: f32 = 0.72; // share of bubble-body cells that never become dust
const RADIUS: f32 = 17.0;  // bubble corner radius, logical px

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

fn sampleTex(pos: vec2<f32>) -> vec4<f32> {
  let t = (pos - u.params0.xy) / u.params0.zw;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) {
    return vec4<f32>(0.0);
  }
  return textureSampleLevel(tex, samp, t, 0.0);
}

// Rounded-rect membership for the bubble (its background dust).
fn inBubble(pos: vec2<f32>) -> bool {
  let r = RADIUS;
  let half = u.params1.zw * 0.5;
  let c = u.params1.xy + half;
  let d = abs(pos - c) - (half - vec2<f32>(r));
  let sd = length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
  return sd < 0.0;
}

// Ease of a particle's travel over its life: a fast push that coasts.
fn travel(tau: f32) -> f32 {
  return 1.0 - pow(1.0 - tau, 1.8);
}

// Smooth wind: a fixed up-left drift, a gentle expansion away from the
// bubble's centre and two layers of low-frequency swirl. Every term's spatial
// gradient is kept well under 1 so the field can be inverted by iteration.
fn wind(o: vec2<f32>, tau: f32, seed: f32) -> vec2<f32> {
  let e = travel(tau);
  let c = u.params1.xy + u.params1.zw * 0.5;
  let s = seed * 6.2831;
  let lowA = sin(o.x * 0.028 + s) * cos(o.y * 0.041 + s * 1.7);
  let lowB = sin(o.y * 0.033 - s) * cos(o.x * 0.024 + s * 0.6);
  let hiA = sin(o.x * 0.11 + o.y * 0.09 + s * 2.0);
  let hiB = cos(o.x * 0.08 - o.y * 0.13 + s * 3.0);
  var d = normalize(vec2<f32>(-1.0, -0.62)) * DRIFT * e;
  d = d + (o - c) * vec2<f32>(0.3, 0.6) * e;
  d = d + vec2<f32>(lowA, lowB) * 18.0 * e;
  d = d + vec2<f32>(hiA, hiB) * 3.5 * e;
  return d;
}

fn startAt(o: vec2<f32>, k: vec2<f32>) -> f32 {
  let x = clamp((o.x - u.params1.x) / u.params1.z, 0.0, 1.0);
  return SWEEP * x + JITTER * hash21(k + 7.3);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  let seed = u.live.y;
  if (p >= 0.999) {
    return vec4<f32>(0.0);
  }
  // Logical px, y-down, origin at the canvas' top-left — same space as the
  // rects passed in params.
  let uv = ndc * 0.5 + 0.5;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * u.resolution.xy / u.resolution.w;

  var rgb = vec3<f32>(0.0);
  var a = 0.0;

  // Intact part of the snapshot: the sweep has not reached this cell yet.
  let kq = floor(q / CELL);
  let cq = (kq + 0.5) * CELL;
  if (p < startAt(cq, kq)) {
    let t = sampleTex(q);
    rgb = t.rgb * t.a;
    a = t.a;
  }

  // Undo the wind to find which origin cells could have sent a particle here.
  var o = q;
  for (var i = 0; i < 4; i = i + 1) {
    let ko = floor(o / CELL);
    let tauO = clamp((p - startAt(o, ko)) / LIFE, 0.0, 1.0);
    o = q - wind(o, tauO, seed);
  }
  let k0 = floor(o / CELL);

  for (var dy = -GATHER; dy <= GATHER; dy = dy + 1) {
    for (var dx = -GATHER; dx <= GATHER; dx = dx + 1) {
      let k = k0 + vec2<f32>(f32(dx), f32(dy));
      let c = (k + 0.5) * CELL;
      let tau = (p - startAt(c, k)) / LIFE;
      if (tau <= 0.0 || tau >= 1.0) {
        continue;
      }
      let h = hash22(k);
      let src = sampleTex(c);
      if (src.a < 0.5) {
        continue;
      }
      var col = src.rgb;
      var alpha = src.a;
      // Bubble body (purple) vs text (near-white): thin the body out so the
      // cloud reads as text turning to dust with purple sparks, not a slab.
      let lum = dot(src.rgb, vec3<f32>(0.299, 0.587, 0.114));
      if (lum < 0.62) {
        if (h.x < BODY_DROP) {
          continue;
        }
        col = col * 1.35;
        alpha = 0.8;
      }
      let jit = (hash22(k + 3.1) - 0.5) * 2.0 * SPREAD * smoothstep(0.0, 1.0, tau);
      let pos = c + wind(c, tau, seed) + jit;
      let r = CELL * (0.85 - 0.35 * tau);
      let d = length(q - pos);
      let cov = 1.0 - smoothstep(r - 0.5, r + 0.5, d);
      if (cov <= 0.0) {
        continue;
      }
      let twinkle = 0.7 + 0.3 * sin(tau * 28.0 + h.y * 6.2831);
      let fade = (1.0 - smoothstep(0.55, 1.0, tau)) * twinkle;
      let w = alpha * cov * fade;
      rgb = rgb + col * w;
      a = a + w;
    }
  }

  a = min(a, 1.0);
  return vec4<f32>(min(rgb, vec3<f32>(1.0)), a);
}
`;
