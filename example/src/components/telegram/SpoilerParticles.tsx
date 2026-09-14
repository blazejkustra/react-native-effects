import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';
import { useMemo } from 'react';
import type { SpoilerRect } from '../../hooks/useSpoiler';

type SpoilerParticlesProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'params'
> & {
  /** `u.live = (cover 0..1, burst 0..1, tapX, tapY)`, tap in canvas px. */
  paramsSynchronizable: ParamsSynchronizable;
  /**
   * Where the mask snapshot sits inside this canvas, logical px, y-down. The
   * mask is a view-shot of the bubble with only the hidden span painted, so
   * its alpha is the exact per-line band the cloud has to cover.
   */
  maskRect: SpoilerRect;
  /** Particle colour; near-white on Telegram's dark theme. */
  color?: ColorInput;
};

/**
 * Telegram's hidden-text cloud: a dense field of tiny sparks drifting over the
 * lines of a spoiler span, blown outward from the tap when it is revealed.
 *
 * One particle per ~1.9 pt cell; each wanders on two slow sines and pulses in
 * and out on its own phase, all with periods that divide the loop, so the
 * field repeats with no seam. The burst blows every spark a short, bounded
 * distance straight away from the tap; that field is undone per fragment by a
 * few fixed-point steps and the rest is covered by the gather window, so no
 * spark is ever lost. Fragment shaders cannot scatter; see ParticleDissolve.
 */
export default function SpoilerParticles({
  paramsSynchronizable,
  maskRect,
  color = '#ffffff',
  ...rest
}: SpoilerParticlesProps) {
  const colors = useMemo(() => [color], [color]);
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[maskRect.x, maskRect.y, maskRect.w, maskRect.h]}
      colors={colors}
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

const CELL: f32 = 1.9;          // one particle per cell, logical px
const GATHER: i32 = 4;          // 9x9 neighbourhood: covers wander + burst push
const LOOP: f32 = 6.0;          // seconds; every period below divides it
const WANDER: f32 = 2.2;        // slow drift amplitude, logical px
const SPREAD: f32 = 0.8;        // fixed per-particle offset from the cell centre
const DENSITY: f32 = 0.9;       // share of cells that carry a particle
const DOT: f32 = 0.62;          // particle radius, logical px
const EDGE: f32 = 1.6;          // how far the cloud spills past the band, px
const BURST_PUSH: f32 = 14.0;   // how far the tap blows a spark, logical px
const BURST_VARY: f32 = 8.0;    // per-spark extra flight, logical px
const CLEAR_R: f32 = 260.0;     // the reveal circle's radius at full burst
const CLEAR_SOFT: f32 = 48.0;   // width of the circle's edge
const TWO_PI: f32 = 6.2831853;

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

// Alpha of the mask snapshot at a canvas position: 1 inside the span's band.
fn maskAt(pos: vec2<f32>) -> f32 {
  let t = (pos - u.params0.xy) / u.params0.zw;
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) {
    return 0.0;
  }
  return textureSampleLevel(tex, samp, t, 0.0).a;
}

// Where a particle rests at time t: its cell centre, a fixed offset, and a
// slow wander on two sines whose whole-cycle counts make the field loop.
fn restPos(c: vec2<f32>, k: vec2<f32>, t: f32) -> vec2<f32> {
  let h = hash22(k + 11.7);
  let g = hash22(k + 29.3);
  let n1 = 1.0 + floor(g.x * 2.0); // 1 or 2 cycles per loop
  let n2 = 1.0 + floor(g.y * 2.0);
  let ph = t / LOOP * TWO_PI;
  let wander = vec2<f32>(
    sin(ph * n1 + h.x * TWO_PI),
    sin(ph * n2 + h.y * TWO_PI)
  ) * WANDER;
  return c + (hash22(k + 3.1) - 0.5) * 2.0 * SPREAD + wander;
}

// Each spark fades in and out on its own phase; two lifetimes, both dividing
// the loop, so neighbours never breathe in step.
fn pulse(k: vec2<f32>, t: f32) -> f32 {
  let h = hash21(k + 5.9);
  let life = select(1.5, 2.0, h > 0.5);
  let s = sin((t / life + hash21(k + 8.2)) * TWO_PI);
  return smoothstep(-0.35, 0.75, s);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let cover = u.live.x;
  let burst = u.live.y;
  let tap = u.live.zw;
  if (cover <= 0.002) {
    return vec4<f32>(0.0);
  }
  let t = u.time.x;

  // Logical px, y-down, origin at the canvas' top-left: the mask rect's space.
  let uv = ndc * 0.5 + 0.5;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * u.resolution.xy / u.resolution.w;

  // Undo the burst to find the resting neighbourhood whose sparks can reach
  // this fragment. Away from the tap the flight direction barely changes over
  // a flight's length, so a few fixed-point steps land on it; right at the tap
  // it cannot be undone, but those sparks are the first the reveal clears.
  let flight = burst * (BURST_PUSH + BURST_VARY);
  var o = q;
  for (var i = 0; i < 3; i = i + 1) {
    let away = o - tap;
    o = q - away / max(length(away), 1.0) * flight;
  }

  // Skip the gather where the band is nowhere near.
  let reach = f32(GATHER) * CELL + flight + EDGE;
  let near = max(
    max(maskAt(o), maskAt(o + vec2<f32>(reach, 0.0))),
    max(maskAt(o - vec2<f32>(reach, 0.0)),
        max(maskAt(o + vec2<f32>(0.0, reach)), maskAt(o - vec2<f32>(0.0, reach))))
  );
  if (near <= 0.0) {
    return vec4<f32>(0.0);
  }

  let k0 = floor(o / CELL);
  let clearR = burst * CLEAR_R - CLEAR_SOFT;
  var rgb = vec3<f32>(0.0);
  var a = 0.0;

  for (var dy = -GATHER; dy <= GATHER; dy = dy + 1) {
    for (var dx = -GATHER; dx <= GATHER; dx = dx + 1) {
      let k = k0 + vec2<f32>(f32(dx), f32(dy));
      let h = hash22(k);
      if (h.x > DENSITY) {
        continue;
      }
      let c = (k + 0.5) * CELL;
      // The cloud follows the span's band: particles exist where the mask is,
      // with a soft spill past its edge so the rectangle does not read hard.
      let band = max(maskAt(c), maskAt(c + (h - 0.5) * 2.0 * EDGE));
      if (band <= 0.0) {
        continue;
      }
      let rest = restPos(c, k, t);
      let away = rest - tap;
      let dir = away / max(length(away), 1.0);
      let pos = rest + dir * burst * (BURST_PUSH + BURST_VARY * hash21(k + 1.3));

      let bright = select(0.5 + 0.4 * h.y, 1.0, h.y > 0.86);
      let r = DOT * select(0.85 + 0.35 * h.y, 1.35, h.y > 0.86);
      let d = length(q - pos);
      let cov = 1.0 - smoothstep(r - 0.55, r + 0.55, d);
      if (cov <= 0.0) {
        continue;
      }
      // The reveal opens as a circle from the tap: sparks inside it are gone.
      let clearing = smoothstep(clearR, clearR + CLEAR_SOFT, length(rest - tap));
      let w = cover * band * pulse(k, t) * bright * clearing * cov;
      rgb = rgb + u.color0.rgb * w;
      a = a + w;
    }
  }

  a = min(a, 1.0);
  return vec4<f32>(min(rgb, vec3<f32>(1.0)), a);
}
`;
