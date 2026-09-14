import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import { useEffectProgress } from './useEffectProgress';

export const LASERS_MS = 3200;

type Props = {
  onDone: () => void;
};

/**
 * iMessage's Lasers: coloured beams fan up from below the screen and sweep
 * across the chat through a thin haze. Each beam is a soft line with a wide
 * glow; the fan breathes rather than strobes, and the whole thing fades in
 * and out so it reads as a light show, not a flicker.
 */
export default function LasersEffect({ onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(LASERS_MS, onDone);
  return (
    <ShaderView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
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

const BEAMS: i32 = 8;
const CORE: f32 = 1.6;         // beam half-width at full brightness, px
const GLOW: f32 = 34.0;        // e-fold width of the haze around a beam, px
const SPREAD: f32 = 0.62;      // half fan angle, radians
const SWEEP: f32 = 0.16;       // how far each beam swings, radians
const PI: f32 = 3.14159265;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Saturated stage-light colours around the hue wheel.
fn beamColour(h: f32) -> vec3<f32> {
  return 0.55 + 0.45 * cos(6.2831853 * (h + vec3<f32>(0.0, 0.33, 0.67)));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let p = u.live.x;
  if (p <= 0.0 || p >= 1.0) {
    return vec4<f32>(0.0);
  }
  let t = u.time.x;
  let uv = ndc * 0.5 + 0.5;
  let res = u.resolution.xy / u.resolution.w;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * res;

  let env = smoothstep(0.0, 0.14, p) * (1.0 - smoothstep(0.78, 1.0, p));
  // The whole fan breathes slowly; no beam ever cuts out.
  let breathe = 0.82 + 0.18 * sin(t * 4.2);

  // Beams come from a point just under the bottom edge, mid-screen.
  let origin = vec2<f32>(res.x * 0.5, res.y + 30.0);
  let v = q - origin;

  var rgb = vec3<f32>(0.0);
  var lum = 0.0;
  for (var i = 0; i < BEAMS; i = i + 1) {
    let fi = f32(i);
    let h = hash21(vec2<f32>(fi, 3.7));
    let g = hash21(vec2<f32>(fi, 9.1));
    // Fan spread evenly, each beam swinging on its own slow clock; the
    // whole fan also leans with the play so it reads as a sweep, not a hold.
    let base = -PI * 0.5 + SPREAD * ((fi + 0.5) / f32(BEAMS) * 2.0 - 1.0);
    let ang = base
      + SWEEP * sin(t * (0.7 + 0.5 * h) + h * 6.2831853)
      + 0.22 * sin(p * PI * 2.0 + g * 3.0);
    let dir = vec2<f32>(cos(ang), sin(ang));
    let along = dot(v, dir);
    if (along <= 0.0) {
      continue;
    }
    let perp = abs(v.x * dir.y - v.y * dir.x);
    // Beams thin out as they travel, like light through haze.
    let travel = exp(-along / (res.y * 1.6));
    let core = exp(-perp * perp / (2.0 * CORE * CORE));
    let glow = exp(-perp / GLOW) * 0.16;
    let inten = (core + glow) * travel * (0.75 + 0.25 * g);
    let col = beamColour(fi / f32(BEAMS) + t * 0.03);
    rgb = rgb + col * inten;
    lum = lum + inten;
  }

  // A faint warm haze where the beams are densest, near their source.
  let fog = exp(-length(v) / (res.y * 0.45)) * 0.10;
  rgb = rgb + vec3<f32>(0.9, 0.7, 1.0) * fog;
  lum = lum + fog;

  let gain = env * breathe;
  let a = clamp(lum * 0.9 * gain, 0.0, 1.0);
  return vec4<f32>(min(rgb * gain, vec3<f32>(1.0)), a);
}
`;
