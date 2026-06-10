import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Small caption line. */
  caption?: string;
  /** Large title line. */
  title?: string;
};

/**
 * The iOS birthday-notification banner: glitter-dust fireworks popping at
 * random spots in the dark, behind the notification text. Each burst is an
 * expanding sphere of twinkling sparkle cells — no particles, just a hashed
 * glitter field gated by the shell's radius — with a brief white flash at
 * ignition, a slow downward drift, and a dusty palette (olive, mauve, pink,
 * silver, gold) picked per burst.
 */
export default function BirthdayFireworks({
  caption = 'Birthday · Found in Contacts',
  title = 'Today, Jun 9',
  style,
  ...rest
}: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <ShaderView
        fragmentShader={FIREWORKS_SHADER}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.textWrap} pointerEvents="none">
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const FIREWORKS_SHADER = /* wgsl */ `
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
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  // x in [0, aspect], y in [0, 1] — square units so bursts stay round.
  let p = vec2<f32>(uv.x * aspect, uv.y);

  // Near-black notification glass.
  var col = vec3<f32>(0.027, 0.027, 0.031);

  // Vivid party palette: lime, violet, hot pink, gold, cyan, silver.
  var palette = array<vec3<f32>, 6>(
    vec3<f32>(0.55, 0.95, 0.35),
    vec3<f32>(0.72, 0.42, 1.00),
    vec3<f32>(1.00, 0.40, 0.65),
    vec3<f32>(1.00, 0.80, 0.30),
    vec3<f32>(0.40, 0.85, 1.00),
    vec3<f32>(0.88, 0.88, 0.95)
  );

  // Six launchers on offset clocks → a few distinct balls in flight, with
  // black space between them like the real notification.
  for (var i = 0; i < 6; i = i + 1) {
    let fi = f32(i);
    let period = 2.9 + 1.7 * fract(fi * 0.6180339);
    let clock = t / period + fract(fi * 0.7548776);
    let prog = fract(clock);
    let gen = floor(clock);

    // Fresh randomness every cycle of every launcher.
    let seed = vec2<f32>(gen * 1.93 + fi * 17.0, fi * 7.31 - gen * 0.71);

    // Some cycles stay dark so the rhythm never feels mechanical.
    if (hash21(seed + 9.9) > 0.78) {
      continue;
    }

    // Anywhere on the card, edges included — offscreen clipping looks natural.
    let center = vec2<f32>(
      hash21(seed + 1.1) * aspect,
      mix(0.10, 0.90, hash21(seed + 2.2))
    );

    // Fast pop, then coast — most of the expansion lands in the first third.
    let ease = 1.0 - pow(1.0 - prog, 4.5);
    let maxR = 0.36 + 0.34 * hash21(seed + 3.3);
    let radius = maxR * (0.10 + 0.90 * ease);
    let fade = smoothstep(1.0, 0.5, prog);

    let rel = p - center;
    let d = length(rel);

    // Ignition flash at the heart of the burst.
    let flash = exp(-d * d / (maxR * maxR * 0.012)) * smoothstep(0.14, 0.0, prog);
    col = col + vec3<f32>(1.0, 0.97, 0.9) * flash * 0.6;

    if (d > radius * 1.05) {
      continue;
    }

    // Real fireworks are hollow shells: stars fly out along fixed directions,
    // so we grid POLAR space (spokes x radial layers). Each cell owns one
    // star at a fixed fraction of the shell radius — as the shell grows the
    // star travels outward along its spoke, and existence probability rises
    // toward the rim so the outskirts are densest.
    let SPOKES = 56.0;
    let LAYERS = 11.0;
    let a01 = fract(atan2(rel.y, rel.x) * 0.15915494 + 1.0);
    let q = d / max(radius, 1e-4);

    let cellA = floor(a01 * SPOKES);
    let cellQ = floor(q * LAYERS);
    let cellId = vec2<f32>(cellA + fi * 61.0, cellQ + gen * 13.0);
    let rnd = hash21(cellId);

    // Rim-heavy existence: sparse core trail, dense shell edge.
    let qc = (cellQ + 0.5) / LAYERS;
    let exists = step(rnd, 0.12 + 0.88 * smoothstep(0.35, 0.95, qc));

    if (exists > 0.5) {
      // The star's own position: jittered inside its polar cell, drooping
      // under gravity as the burst ages.
      let ja = (hash21(cellId + 5.5) - 0.5) * 0.8;
      let jq = (hash21(cellId + 8.8) - 0.5) * 0.8;
      let starAng = ((cellA + 0.5 + ja) / SPOKES) * 6.2831853;
      let starQ = (cellQ + 0.5 + jq) / LAYERS;
      var starPos = center + vec2<f32>(cos(starAng), sin(starAng)) * starQ * radius;
      starPos.y = starPos.y - prog * prog * 0.07 * (0.5 + rnd);

      let toStar = p - starPos;
      let size = 16000.0 + 26000.0 * hash21(cellId + 2.7);
      let spark = exp(-dot(toStar, toStar) * size);

      // Hard twinkle — glitter, not haze.
      let rnd2 = hash21(cellId + 47.0);
      let twinkle = 0.2 + 0.8 *
        pow(0.5 + 0.5 * sin(t * (3.0 + 6.0 * rnd2) + rnd2 * 40.0), 3.0);

      // One dominant color per burst, with a second accent color sprinkled in.
      let pickA = i32(hash21(seed + 4.4) * 5.999);
      let pickB = i32(hash21(seed + 6.6) * 5.999);
      var sparkCol = palette[select(pickA, pickB, rnd2 > 0.72)];
      // The very brightest grains glint white.
      sparkCol = mix(sparkCol, vec3<f32>(1.0), step(0.95, rnd2) * 0.7);

      // Rim stars burn brightest.
      let rimBoost = 0.45 + 0.85 * smoothstep(0.4, 1.0, starQ);
      col = col + sparkCol * spark * twinkle * fade * rimBoost * 2.4;
    }
  }

  // Keep the banner glassy: gentle ceiling so text always wins.
  col = col / (1.0 + col * 0.45);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

const styles = StyleSheet.create({
  card: {
    height: 122,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#070708',
    justifyContent: 'center',
  },
  textWrap: {
    paddingHorizontal: 26,
  },
  caption: {
    color: 'rgba(235, 235, 245, 0.72)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
