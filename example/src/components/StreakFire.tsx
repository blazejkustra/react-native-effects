import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Small caption line. */
  caption?: string;
  /** Large title line. */
  title?: string;
};

/**
 * A streak notification on fire. Flames lick up from the banner's bottom
 * edge — domain-warped noise scrolled upward and shaped by height, ramped
 * black → ember → orange → yellow-white — while spark motes break off and
 * climb. The blaze stays bottom-weighted so the title keeps its contrast.
 */
export default function StreakFire({
  caption = 'Duolingo · Don’t lose your streak',
  title = '365 day streak 🔥',
  style,
  ...rest
}: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <ShaderView
        fragmentShader={FIRE_SHADER}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.textWrap} pointerEvents="none">
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const FIRE_SHADER = /* wgsl */ `
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

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let p = vec2<f32>(uv.x * aspect, uv.y);

  // Near-black notification glass.
  var col = vec3<f32>(0.027, 0.027, 0.031);

  // Flame body: noise rushing upward, warped by a second slower field so the
  // tongues bend and split instead of just scrolling.
  let warp = fbm(vec2<f32>(p.x * 2.2, p.y * 2.6 - t * 0.7));
  var n = fbm(vec2<f32>(
    p.x * 3.1 + (warp - 0.5) * 1.1,
    p.y * 4.0 - t * 2.3
  ));

  // Shape: roaring at the bottom edge, dying out by mid-card. The tongues'
  // tips flicker because the noise itself crosses the threshold.
  let shape = n * (1.45 - p.y * 2.1) + 0.12 * sin(p.x * 7.0 + t * 3.0);

  let body = smoothstep(0.30, 0.62, shape);
  let hot = smoothstep(0.55, 0.85, shape);
  let core = smoothstep(0.74, 1.0, shape);

  // Ember → orange → yellow → near-white ramp.
  var fire = vec3<f32>(0.45, 0.05, 0.0) * smoothstep(0.12, 0.35, shape);
  fire = mix(fire, vec3<f32>(0.95, 0.32, 0.02), body);
  fire = mix(fire, vec3<f32>(1.0, 0.72, 0.10), hot);
  fire = mix(fire, vec3<f32>(1.0, 0.94, 0.65), core);

  // Global flicker so the whole blaze breathes.
  fire = fire * (0.9 + 0.1 * sin(t * 9.0 + sin(t * 13.7) * 2.0));
  col = col + fire;

  // A warm glow hugging the bottom edge, under the flames.
  col = col + vec3<f32>(0.45, 0.10, 0.01) * exp(-p.y * 5.5) * 0.8;

  // Sparks: two layers of rising motes that sway and burn out near the top.
  for (var l = 0; l < 2; l = l + 1) {
    let fl = f32(l);
    let scale = 11.0 - fl * 4.0;
    let rise = 0.55 + fl * 0.30;
    let q = vec2<f32>(p.x, p.y - t * rise) * scale;
    let cell = floor(q) + fl * 71.0;
    let rnd = hash21(cell);
    if (rnd < 0.18) {
      let sway = sin(t * (2.0 + rnd * 3.0) + rnd * 30.0) * 0.25;
      let center = vec2<f32>(
        hash21(cell + 7.7) - 0.5 + sway,
        hash21(cell + 3.3) - 0.5
      ) * 0.6;
      let f = fract(q) - 0.5 - center;
      let spark = exp(-dot(f, f) * 90.0);
      // Sparks fade as they climb and flicker on their own clocks.
      let life = (1.0 - smoothstep(0.25, 0.95, uv.y))
               * (0.4 + 0.6 * sin(t * (6.0 + rnd * 8.0) + rnd * 40.0));
      col = col + vec3<f32>(1.0, 0.55, 0.12) * spark * max(life, 0.0) * 1.3;
    }
  }

  // Keep the glass dark up top so the title pops.
  col = col / (1.0 + col * 0.35);

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
