import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import { useEffectProgress } from './useEffectProgress';

export const CONFETTI_MS = 4200;

type Props = {
  onDone: () => void;
};

/**
 * iMessage's Confetti: a shower of paper pieces dropped from above the
 * screen that fall through the chat in front of the bubbles, tumbling and
 * swaying, and are gone once they clear the bottom. Every piece is a cell
 * in a column grid with its own drop time, so the first second is a dense
 * front and the rest a thinning trail; a fragment gathers the columns that
 * can reach it and tests each piece's rotated, flipping rectangle.
 */
export default function ConfettiEffect({ onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(CONFETTI_MS, onDone);
  return (
    <ShaderView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[CONFETTI_MS / 1000]}
      transparent
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

const COL: f32 = 26.0;         // column width, logical px
const PER_COL: i32 = 9;        // pieces per column per layer
const SPAWN: f32 = 1.7;        // seconds over which a column's pieces drop
const SWAY: f32 = 15.0;        // sideways drift amplitude, px
const PIECE: vec2<f32> = vec2<f32>(5.6, 3.3); // half size of a front piece, px

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn paper(i: f32) -> vec3<f32> {
  // Bright party paper: red, orange, yellow, green, blue, violet, pink, white.
  var palette = array<vec3<f32>, 8>(
    vec3<f32>(1.00, 0.27, 0.27),
    vec3<f32>(1.00, 0.58, 0.15),
    vec3<f32>(1.00, 0.86, 0.22),
    vec3<f32>(0.30, 0.85, 0.40),
    vec3<f32>(0.25, 0.60, 1.00),
    vec3<f32>(0.62, 0.42, 1.00),
    vec3<f32>(1.00, 0.45, 0.75),
    vec3<f32>(0.95, 0.95, 0.97)
  );
  return palette[i32(i * 7.999)];
}

// Colour and coverage of the pieces of one layer at q, at effect time t.
fn layer(q: vec2<f32>, t: f32, res: vec2<f32>, scale: f32, seed: f32)
    -> vec4<f32> {
  var rgb = vec3<f32>(0.0);
  var a = 0.0;
  let c0 = floor(q.x / COL);
  for (var dc = -1; dc <= 1; dc = dc + 1) {
    let col = c0 + f32(dc);
    for (var k = 0; k < PER_COL; k = k + 1) {
      let id = vec2<f32>(col * 3.1 + seed, f32(k) * 7.7 + seed);
      let h1 = hash21(id);
      let h2 = hash21(id + 1.7);
      let h3 = hash21(id + 4.3);
      let h4 = hash21(id + 9.1);
      // Most pieces drop in the first half second (a dense front), the rest
      // trail out over the spawn window.
      let tt = t - pow(h1, 2.2) * SPAWN;
      if (tt <= 0.0) {
        continue;
      }
      // Drop with a touch of acceleration and a slow terminal drift; big
      // pieces fall faster than small ones.
      let fall = res.y * (0.30 + 0.06 * h2) * scale;
      let y = -12.0 + fall * tt + 0.09 * res.y * tt * tt * scale;
      let x = (col + 0.2 + 0.6 * h3) * COL
        + SWAY * sin(tt * (1.6 + h4 * 1.4) + h2 * 6.2831853);
      let d = q - vec2<f32>(x, y);
      // Spin in the plane and tumble about the long axis.
      let ang = tt * (2.5 + 3.5 * h4) + h3 * 6.2831853;
      let ca = cos(ang);
      let sa = sin(ang);
      let r = vec2<f32>(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
      let tumble = sin(tt * (3.0 + 3.0 * h2) + h1 * 6.2831853);
      let ext = PIECE * scale * vec2<f32>(1.0, 0.25 + 0.75 * abs(tumble));
      let edge = 0.7;
      let cov = (1.0 - smoothstep(ext.x - edge, ext.x + edge, abs(r.x)))
              * (1.0 - smoothstep(ext.y - edge, ext.y + edge, abs(r.y)));
      if (cov <= 0.0) {
        continue;
      }
      let shade = 0.62 + 0.38 * abs(tumble);
      let col3 = paper(h2) * shade;
      let w = cov * (1.0 - a);
      rgb = rgb + col3 * w;
      a = a + w;
    }
  }
  return vec4<f32>(rgb, a);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  if (p <= 0.0 || p >= 1.0) {
    return vec4<f32>(0.0);
  }
  let t = p * u.params0.x;
  let uv = ndc * 0.5 + 0.5;
  let res = u.resolution.xy / u.resolution.w;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * res;

  // Small, dimmer pieces behind; full-size ones in front.
  let back = layer(q, t, res, 0.7, 11.0);
  let front = layer(q, t, res, 1.0, 37.0);
  var rgb = back.rgb * 0.75 * (1.0 - front.a) + front.rgb;
  var a = back.a * (1.0 - front.a) + front.a;

  // Whatever is still on screen at the end fades rather than vanishing.
  let out = 1.0 - smoothstep(0.84, 1.0, p);
  return vec4<f32>(rgb * out, a * out);
}
`;
