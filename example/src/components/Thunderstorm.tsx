import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Small caption line. */
  caption?: string;
  /** Large title line. */
  title?: string;
};

/**
 * A severe-weather banner with a live storm inside. A brooding fbm cloud deck
 * hangs across the top; every couple of seconds a branching lightning bolt
 * tears a noise-driven path from the clouds to the bottom edge, strobing
 * 2–3 times and flash-lighting the whole card (clouds included) while faint
 * rain streaks fall through the glow.
 */
export default function Thunderstorm({
  caption = 'Weather Alert · Severe',
  title = 'Storm until 9 PM',
  style,
  ...rest
}: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <ShaderView
        fragmentShader={STORM_SHADER}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.textWrap} pointerEvents="none">
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const STORM_SHADER = /* wgsl */ `
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
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// The bolt's x position at height y, for one strike's seed. Wander grows as
// it descends from the cloud base, with a fine jitter octave for the jags.
fn boltX(y: f32, seed: f32, aspect: f32) -> f32 {
  let x0 = mix(0.12, 0.88, hash21(vec2<f32>(seed, 1.7))) * aspect;
  let drop = max(0.66 - y, 0.0);
  let wander = (vnoise(vec2<f32>(drop * 7.0, seed * 7.3)) - 0.5) * 0.9 * (drop + 0.08);
  let jag = (vnoise(vec2<f32>(drop * 26.0, seed * 13.1)) - 0.5) * 0.12;
  return x0 + wander + jag;
}

// Light contribution of one strike clock (bolt core + glow + branch + flash).
// Returns (bolt r, g, b, ambientFlash).
fn strike(p: vec2<f32>, uvy: f32, t: f32, clockOffset: f32, period: f32,
          aspect: f32) -> vec4<f32> {
  let clock = t / period + clockOffset;
  let prog = fract(clock);
  let gen = floor(clock);
  let seed = gen * 3.77 + clockOffset * 19.0;

  // Some cycles stay quiet; tension is part of a storm.
  if (hash21(vec2<f32>(seed, 0.3)) > 0.82) {
    return vec4<f32>(0.0);
  }

  // The strike lives in the first ~15% of the cycle, strobing 3 times.
  let vis = smoothstep(0.0, 0.01, prog) * smoothstep(0.15, 0.05, prog);
  if (vis < 0.001) {
    return vec4<f32>(0.0);
  }
  let strobe = 0.55 + 0.45 * sin(prog * 110.0 + seed);
  let power = vis * strobe;

  // Main channel.
  let bx = boltX(uvy, seed, aspect);
  let d = abs(p.x - bx);
  var bolt = exp(-d * 90.0) * 1.6 + exp(-d * 14.0) * 0.35;

  // One branch that splits off partway down and angles away.
  let splitY = mix(0.18, 0.45, hash21(vec2<f32>(seed, 5.1)));
  if (uvy < splitY) {
    let dir = sign(hash21(vec2<f32>(seed, 6.9)) - 0.5);
    let bxBranch = bx + dir * (splitY - uvy) * 0.9
                 + (vnoise(vec2<f32>((splitY - uvy) * 20.0, seed * 3.3)) - 0.5) * 0.1;
    let db = abs(p.x - bxBranch);
    bolt = bolt + (exp(-db * 110.0) * 1.1 + exp(-db * 20.0) * 0.2) * 0.7;
  }

  // Below the cloud deck only.
  bolt = bolt * smoothstep(0.72, 0.6, uvy);

  let boltCol = vec3<f32>(0.75, 0.82, 1.0) * bolt * power;
  // Ambient flash, strongest near the strike column.
  let ambient = power * (0.16 + 0.22 * exp(-d * 2.0));
  return vec4<f32>(boltCol, ambient);
}

// One layer of fine slanted rain. Returns streak intensity.
fn rain(p: vec2<f32>, uvy: f32, t: f32, layer: f32, cols: f32, speed: f32)
    -> f32 {
  let slant = p.x + uvy * (0.22 + layer * 0.1);
  let colId = floor(slant * cols) + layer * 91.0;
  let colRnd = hash21(vec2<f32>(colId, 9.1));
  if (colRnd > 0.45) {
    return 0.0;
  }
  let drop = fract(uvy * 1.9 + t * speed * (0.8 + colRnd * 0.5)
                   + hash21(vec2<f32>(colId, 3.3)) * 7.0);
  let dx = abs(fract(slant * cols) - 0.5);
  // Thin crisp streak with a falling head and a fading tail.
  return smoothstep(0.10, 0.0, dx)
       * smoothstep(1.0, 0.82, drop) * smoothstep(0.30, 0.7, drop);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let p = vec2<f32>(uv.x * aspect, uv.y);

  // Two strike clocks so lightning lands at irregular spots and times.
  let s1 = strike(p, uv.y, t, 0.0, 2.6, aspect);
  let s2 = strike(p, uv.y, t, 0.47, 3.9, aspect);
  let flash = s1.w + s2.w;

  // Sheet lightning: a distant glow that blooms inside the cloud deck every
  // second or two, somewhere new each time — the storm breathing between
  // strikes.
  let shClock = t * 0.7;
  let shGen = floor(shClock);
  let shProg = fract(shClock);
  let shPos = vec2<f32>(hash21(vec2<f32>(shGen, 2.4)) * aspect,
                        mix(0.72, 0.95, hash21(vec2<f32>(shGen, 8.2))));
  let shWindow = sin(shProg * 3.14159);
  let shPower = shWindow * shWindow * step(hash21(vec2<f32>(shGen, 5.5)), 0.65);
  let shD = p - shPos;
  let sheet = exp(-dot(shD, shD) * 2.6) * shPower;

  // Night-storm glass: a cold blue gradient, deeper at the bottom, lifted by
  // every kind of light in the sky.
  var col = mix(vec3<f32>(0.016, 0.020, 0.034), vec3<f32>(0.045, 0.055, 0.085),
                uv.y);
  col = col * (1.0 + flash * 2.2 + sheet * 1.2);

  // Two depths of fine rain, caught by the light.
  let rFar = rain(p, uv.y, t, 1.0, 110.0, 1.5);
  let rNear = rain(p, uv.y, t, 2.0, 70.0, 2.2);
  let rainLight = 0.14 + flash * 1.4 + sheet * 0.5;
  col = col + vec3<f32>(0.36, 0.44, 0.62) * (rFar * 0.6 + rNear) * rainLight;

  // Cloud deck: two churning fbm layers with a ragged underbelly. Sheet
  // lightning and strikes light it from within; its base stays ink-dark so
  // the bolts tear out of something solid.
  let churn = fbm(vec2<f32>(p.x * 1.7 + t * 0.045, uv.y * 3.4));
  let detail = fbm(vec2<f32>(p.x * 4.6 - t * 0.03, uv.y * 8.0) + churn * 1.5);
  let belly = 0.58 + (churn - 0.5) * 0.22;
  let cloudMask = smoothstep(belly, belly + 0.22, uv.y);

  var cloudCol = mix(vec3<f32>(0.060, 0.068, 0.095),
                     vec3<f32>(0.195, 0.210, 0.270),
                     churn * 0.55 + detail * 0.45);
  // Darker, heavier wisps along the underbelly.
  cloudCol = cloudCol * (0.55 + 0.45 * smoothstep(belly, 1.0, uv.y));
  // Light from within: sheet glow + strike flash, shaped by the billows.
  let innerLight = min(sheet * 2.6 + flash * 2.4, 1.4);
  cloudCol = cloudCol + vec3<f32>(0.42, 0.46, 0.66) * innerLight
           * (0.25 + 0.75 * detail);
  col = mix(col, cloudCol, cloudMask);

  // The bolts burn over everything, and their light pools on the ground.
  col = col + s1.rgb + s2.rgb;
  col = col + vec3<f32>(0.45, 0.50, 0.75) * exp(-uv.y * 4.5) * flash * 0.5;

  // Keep the glass dark overall so the title pops.
  col = col / (1.0 + col * 0.30);

  // Grain keeps the gradients from banding.
  let noise = hash21(uv * u.resolution.xy + fract(t) * 331.0) - 0.5;
  col = col + noise * 0.010;

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
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
