import type { ImageSourcePropType, ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /** The lamp photo; the shader knows where its glass is. */
  photo: ImageSourcePropType;
  /** `[scaleX, scaleY]` mapping screen uv onto the photo, cover-fit. */
  coverScale: [number, number];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A photographed lava lamp with live wax.
 *
 * The cap and the base are the photo, the room around it dimmed to evening
 * and warmed by the lamp's own glow. The glass is drawn: a tapered column of
 * amber liquid lit by the bulb from below, the simulated wax blobs fused with
 * a smooth minimum (thin edges glow orange, thick cores go deep red), a pool
 * of wax on the floor, and the vertical reflections of a curved glass wall.
 */
export default function LavaLamp({
  photo,
  coverScale,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={LAVA_SHADER}
      texture={photo}
      params={[coverScale[0], coverScale[1]]}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const LAVA_SHADER = /* wgsl */ `
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

// Where the glass is in the photo, pixels.
const IMG = vec2<f32>(1280.0, 1795.0);
const GLASS_TOP = 394.0;
const GLASS_FLOOR = 1056.0;
const GLASS_H = 662.0;
const BLOBS = 7;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn glassHalfWidth(y: f32) -> f32 {
  let t = clamp(1.0 - y / GLASS_H, 0.0, 1.0);
  return 86.0 + 46.0 * (1.0 - (1.0 - t) * (1.0 - t));
}

fn glassCenterX(py: f32) -> f32 {
  return 632.0 + (py - GLASS_TOP) * (11.0 / GLASS_H);
}

fn sq(x: f32) -> f32 {
  return x * x;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Signed distance to the wax, photo pixels: blobs and the floor pool, fused
// with a smooth minimum so they only neck together when they nearly touch.
fn waxSd(p: vec2<f32>, phase: f32) -> f32 {
  let heave = 1.0 + 0.12 * sin(p.x * 0.045 + phase * 2.1) + 0.08 * sin(p.x * 0.09 - phase * 3.3);
  var d = p.y - 22.0 * heave;
  for (var i = 0; i < BLOBS; i = i + 1) {
    let b = u.liveData[i];
    let q = p - b.xy;
    let stretched = vec2<f32>(q.x * (1.0 + b.w * 0.3), q.y / (1.0 + b.w));
    d = smin(d, length(stretched) - b.z, 26.0);
  }
  return d;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let suv = vec2<f32>(uv.x, 1.0 - uv.y);
  let iuv = (suv - 0.5) * u.params0.xy + 0.5;
  let px = iuv * IMG;
  let pxPerDevice = u.params0.x * IMG.x / u.resolution.x;
  let phase = u.live.x;

  let y = GLASS_FLOOR - px.y;
  let x = px.x - glassCenterX(px.y);
  let hw = glassHalfWidth(y);
  let across = x / hw;
  let aa = 1.5 * pxPerDevice;
  let inGlass = smoothstep(hw + aa, hw - aa, abs(x))
    * smoothstep(-aa, aa, y) * smoothstep(GLASS_H + aa, GLASS_H - aa, y);

  // How much bulb light reaches this height, and how far off-axis.
  let h = clamp(y / GLASS_H, 0.0, 1.0);
  let bulb = (1.2 * exp(-h * 2.6) + 0.48) * (1.0 - 0.25 * across * across);

  // The room: the photo at dusk, warmed by the lamp.
  let photo = textureSampleLevel(tex, samp, iuv, 0.0).rgb;
  let lampMid = vec2<f32>(glassCenterX(GLASS_FLOOR - 240.0), GLASS_FLOOR - 240.0);
  let fromLamp = (px - lampMid) / vec2<f32>(420.0, 620.0);
  let spill = exp(-dot(fromLamp, fromLamp) * 1.6);
  var room = photo * vec3<f32>(0.24, 0.2, 0.17);
  room = room + photo * vec3<f32>(1.0, 0.55, 0.22) * spill * 0.75;
  room = room + vec3<f32>(0.32, 0.12, 0.03) * spill * 0.35;

  // The glass. The curved wall squeezes what is near its edges.
  let bend = across * (0.84 + 0.16 * across * across);
  let p = vec2<f32>(bend * hw, y);
  let sd = waxSd(p, phase);
  let wax = smoothstep(aa, -aa, sd);
  let up = waxSd(p + vec2<f32>(0.0, 6.0), phase);
  let down = waxSd(p - vec2<f32>(0.0, 6.0), phase);
  // How much this bit of wax faces the bulb (its surface normal points down).
  let facesBulb = clamp((up - down) / 12.0, 0.0, 1.0);

  // Translucent liquid: the bulb's light, tinted, strongest up the axis.
  let axis = exp(-across * across * 2.2);
  let liquid = vec3<f32>(1.0, 0.66, 0.2) * (0.16 + bulb * (0.32 + 0.22 * axis));

  // Translucent wax: light scatters through it, so thin edges and necks glow
  // bright orange while the thick core deepens to red; the side facing the
  // bulb burns hottest.
  let depth = clamp(-sd / 38.0, 0.0, 1.0);
  let edgeGlow = exp(min(sd, 0.0) / 9.0);
  let core = vec3<f32>(0.92, 0.16, 0.03);
  let thin = vec3<f32>(1.0, 0.42, 0.05);
  var waxCol = mix(thin, core, depth * (2.0 - depth) * 0.85) * (0.45 + bulb * 0.7);
  waxCol = waxCol + vec3<f32>(1.0, 0.55, 0.1) * edgeGlow * bulb * 0.35;
  waxCol = waxCol + vec3<f32>(1.0, 0.78, 0.32) * facesBulb * smoothstep(-22.0, 0.0, sd) * bulb * 0.75;
  var glass = mix(liquid, waxCol, wax);
  // Light leaking out of the wax tints the liquid around it.
  glass = glass + vec3<f32>(0.9, 0.3, 0.05) * smoothstep(34.0, 0.0, sd) * (1.0 - wax) * bulb * 0.22;
  // Wall: darker, richer toward the rim, with two tall window reflections.
  let rim = across * across;
  glass = glass * (1.0 - 0.45 * rim * rim * rim);
  let streakL = exp(-sq((across + 0.66) / 0.045)) * 0.38 + exp(-sq((across + 0.5) / 0.02)) * 0.12;
  let streakR = exp(-sq((across - 0.58) / 0.1)) * 0.12;
  glass = glass + vec3<f32>(1.0, 0.95, 0.88) * (streakL + streakR) * (0.6 + 0.4 * h);

  var col = mix(room, glass, inGlass);
  col = col / (1.0 + col * 0.25);
  col = col + (hash21(uv * u.resolution.xy) - 0.5) / 255.0;
  return vec4<f32>(col, 1.0);
}`;
