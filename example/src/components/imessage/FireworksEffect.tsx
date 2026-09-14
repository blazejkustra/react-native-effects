import { StyleSheet } from 'react-native';
import { ShaderView } from 'react-native-effects';
import { useEffectProgress } from './useEffectProgress';

export const FIREWORKS_MS = 4000;
// The birthday banner these bursts were tuned for is this tall; measuring
// the full screen in banner heights keeps every burst the size it is there.
const BANNER_HEIGHT = 122;
const LAUNCHERS = 20;

type Props = {
  onDone: () => void;
};

/**
 * iMessage's Fireworks: glitter-dust shells popping over the chat. The
 * bursts are the birthday banner's (components/BirthdayFireworks.tsx) —
 * hollow polar shells of twinkling stars with an ignition flash — drawn as
 * a transparent overlay in front of the bubbles instead of on the banner's
 * black glass, with launchers spread across the whole screen.
 */
export default function FireworksEffect({ onDone }: Props) {
  const paramsSynchronizable = useEffectProgress(FIREWORKS_MS, onDone);
  return (
    <ShaderView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      params={[BANNER_HEIGHT, LAUNCHERS]}
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

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let prog = u.live.x;
  if (prog <= 0.0 || prog >= 1.0) {
    return vec4<f32>(0.0);
  }
  let t = u.time.x;
  let uv = ndc * 0.5 + 0.5;
  // Square units of one banner height, so bursts stay round and banner-sized.
  let unitPx = u.params0.x * u.resolution.w;
  let extent = u.resolution.xy / unitPx;
  let p = uv * extent;
  let launchers = i32(max(u.params0.y, 1.0));

  // Vivid party palette: lime, violet, hot pink, gold, cyan, silver.
  var palette = array<vec3<f32>, 6>(
    vec3<f32>(0.55, 0.95, 0.35),
    vec3<f32>(0.72, 0.42, 1.00),
    vec3<f32>(1.00, 0.40, 0.65),
    vec3<f32>(1.00, 0.80, 0.30),
    vec3<f32>(0.40, 0.85, 1.00),
    vec3<f32>(0.88, 0.88, 0.95)
  );

  var col = vec3<f32>(0.0);
  for (var i = 0; i < launchers; i = i + 1) {
    let fi = f32(i);
    let period = 2.9 + 1.7 * fract(fi * 0.6180339);
    let clock = t / period + fract(fi * 0.7548776);
    let phase = fract(clock);
    let gen = floor(clock);

    let seed = vec2<f32>(gen * 1.93 + fi * 17.0, fi * 7.31 - gen * 0.71);
    if (hash21(seed + 9.9) > 0.78) {
      continue;
    }

    let center = vec2<f32>(
      hash21(seed + 1.1) * extent.x,
      mix(0.10, extent.y - 0.10, hash21(seed + 2.2))
    );

    let ease = 1.0 - pow(1.0 - phase, 4.5);
    let maxR = 0.36 + 0.34 * hash21(seed + 3.3);
    let radius = maxR * (0.10 + 0.90 * ease);
    let fade = smoothstep(1.0, 0.5, phase);

    let rel = p - center;
    let d = length(rel);

    let flash = exp(-d * d / (maxR * maxR * 0.012)) * smoothstep(0.14, 0.0, phase);
    col = col + vec3<f32>(1.0, 0.97, 0.9) * flash * 0.6;

    if (d > radius * 1.05) {
      continue;
    }

    let SPOKES = 56.0;
    let LAYERS = 11.0;
    let a01 = fract(atan2(rel.y, rel.x) * 0.15915494 + 1.0);
    let q = d / max(radius, 1e-4);

    let cellA = floor(a01 * SPOKES);
    let cellQ = floor(q * LAYERS);
    let cellId = vec2<f32>(cellA + fi * 61.0, cellQ + gen * 13.0);
    let rnd = hash21(cellId);

    let qc = (cellQ + 0.5) / LAYERS;
    let exists = step(rnd, 0.12 + 0.88 * smoothstep(0.35, 0.95, qc));

    if (exists > 0.5) {
      let ja = (hash21(cellId + 5.5) - 0.5) * 0.8;
      let jq = (hash21(cellId + 8.8) - 0.5) * 0.8;
      let starAng = ((cellA + 0.5 + ja) / SPOKES) * 6.2831853;
      let starQ = (cellQ + 0.5 + jq) / LAYERS;
      var starPos = center + vec2<f32>(cos(starAng), sin(starAng)) * starQ * radius;
      starPos.y = starPos.y - phase * phase * 0.07 * (0.5 + rnd);

      let toStar = p - starPos;
      let size = 16000.0 + 26000.0 * hash21(cellId + 2.7);
      let spark = exp(-dot(toStar, toStar) * size);

      let rnd2 = hash21(cellId + 47.0);
      let twinkle = 0.2 + 0.8 *
        pow(0.5 + 0.5 * sin(t * (3.0 + 6.0 * rnd2) + rnd2 * 40.0), 3.0);

      let pickA = i32(hash21(seed + 4.4) * 5.999);
      let pickB = i32(hash21(seed + 6.6) * 5.999);
      var sparkCol = palette[select(pickA, pickB, rnd2 > 0.72)];
      sparkCol = mix(sparkCol, vec3<f32>(1.0), step(0.95, rnd2) * 0.7);

      let rimBoost = 0.45 + 0.85 * smoothstep(0.4, 1.0, starQ);
      col = col + sparkCol * spark * twinkle * fade * rimBoost * 2.4;
    }
  }

  col = col / (1.0 + col * 0.45);
  // In and out with the play; the glitter is additive over whatever is
  // under it, so its alpha follows its brightness.
  let env = smoothstep(0.0, 0.1, prog) * (1.0 - smoothstep(0.8, 1.0, prog));
  let rgb = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)) * env;
  let a = clamp(max(max(rgb.r, rgb.g), rgb.b), 0.0, 1.0);
  return vec4<f32>(rgb, a);
}
`;
