import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Small caption line. */
  caption?: string;
  /** Large title line. */
  title?: string;
};

/**
 * A notification banner raining confetti. Three parallax layers of paper
 * pieces fall continuously — each piece lives in a scrolling grid cell, sways
 * sideways, spins, and tumbles (its height squashes on a sine, the way paper
 * flips through air and catches the light). Opaque vivid colors composited
 * back-to-front, so it reads as paper, not glow.
 */
export default function PartyConfetti({
  caption = 'Party · Tonight at 7 PM',
  title = "You're invited 🎉",
  style,
  ...rest
}: Props) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <ShaderView
        fragmentShader={CONFETTI_SHADER}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.textWrap} pointerEvents="none">
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const CONFETTI_SHADER = /* wgsl */ `
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

// Coverage (0..1) and color of one confetti layer at point p.
fn confettiLayer(p: vec2<f32>, t: f32, layer: f32, scale: f32, fall: f32)
    -> vec4<f32> {
  // Scroll the grid downward over time (y is up, so add t to sample "above").
  let q = vec2<f32>(p.x, p.y + t * fall) * scale;
  let cell = floor(q) + layer * 53.0;
  let rnd = hash21(cell);

  // Not every cell holds a piece — keeps the rain airy.
  if (rnd > 0.42) {
    return vec4<f32>(0.0);
  }

  // Piece center: jittered in the cell, swaying sideways as it falls.
  let sway = sin(t * (1.2 + rnd * 1.6) + rnd * 40.0) * 0.22;
  let center = vec2<f32>(
    hash21(cell + 7.7) - 0.5 + sway,
    hash21(cell + 3.3) - 0.5
  ) * 0.6;
  var f = fract(q) - 0.5 - center;

  // Spin in the screen plane…
  let ang = t * (1.5 + rnd * 3.5) + rnd * 6.2831853;
  let ca = cos(ang);
  let sa = sin(ang);
  f = vec2<f32>(ca * f.x - sa * f.y, sa * f.x + ca * f.y);

  // …and tumble around the horizontal axis: the paper's height collapses and
  // recovers, and the face catches more light when it's flat to the screen.
  let tumble = sin(t * (2.0 + rnd * 4.0) + rnd * 17.0);
  let hw = 0.16;
  let hh = 0.11 * (0.18 + 0.82 * abs(tumble));

  let edge = 0.025;
  let cover = smoothstep(hw, hw - edge, abs(f.x))
            * smoothstep(hh, hh - edge, abs(f.y));
  if (cover < 0.001) {
    return vec4<f32>(0.0);
  }

  // Vivid paper palette.
  var palette = array<vec3<f32>, 8>(
    vec3<f32>(1.00, 0.30, 0.30),
    vec3<f32>(1.00, 0.60, 0.15),
    vec3<f32>(1.00, 0.85, 0.25),
    vec3<f32>(0.35, 0.85, 0.40),
    vec3<f32>(0.30, 0.65, 1.00),
    vec3<f32>(0.65, 0.45, 1.00),
    vec3<f32>(1.00, 0.45, 0.75),
    vec3<f32>(0.92, 0.92, 0.95)
  );
  var pieceCol = palette[i32(hash21(cell + 11.0) * 7.999)];

  // Lighting from the tumble + a darker back face.
  let face = 0.55 + 0.45 * abs(tumble);
  pieceCol = pieceCol * face * select(1.0, 0.72, tumble < 0.0);

  return vec4<f32>(pieceCol, cover);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let p = vec2<f32>(uv.x * aspect, uv.y);

  // Near-black notification glass.
  var col = vec3<f32>(0.027, 0.027, 0.031);

  // Back → front: smaller, dimmer, slower behind; big and punchy in front.
  let back = confettiLayer(p, t, 1.0, 9.0, 0.16);
  col = mix(col, back.rgb * 0.55, back.a);

  let mid = confettiLayer(p, t, 2.0, 6.5, 0.26);
  col = mix(col, mid.rgb * 0.8, mid.a);

  let front = confettiLayer(p, t, 3.0, 4.6, 0.38);
  col = mix(col, front.rgb, front.a);

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
