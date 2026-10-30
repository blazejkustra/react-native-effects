import { useEffect } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

const GLYPH = require('../../../assets/flashlight/torch-glyph.png');

/** The hardware Dynamic Island cut-out, measured on the iPhone 18 Pro Max. */
export const ISLAND = { width: 95, height: 37, top: 14 };
/** The expanded torch control, scaled from the iOS 18 screenshots. */
export const PANEL = { width: 220, height: 318, top: 8, radius: 48 };
const COMPACT_WIDTH = ISLAND.width + 74;
const APEX_Y = 226;
const GLYPH_SIZE = { width: 26, height: 46 };

export type IslandMode = 'idle' | 'compact' | 'expanded';

const SPRING = { damping: 17, stiffness: 190, mass: 0.9 };

function layoutFor(mode: IslandMode) {
  if (mode === 'expanded') {
    return { ...PANEL };
  }
  return {
    width: mode === 'compact' ? COMPACT_WIDTH : ISLAND.width,
    height: ISLAND.height,
    top: ISLAND.top,
    radius: ISLAND.height / 2,
  };
}

type TorchIslandProps = {
  mode: IslandMode;
  isOn: boolean;
  /** `u.live = (beam 0..1, intensity 0..1, power 0..1, 0)`. */
  paramsSynchronizable: ParamsSynchronizable;
  onExpand: () => void;
  onToggle: () => void;
  /** Drag deltas in pt since the last call. */
  onAdjust: (dx: number, dy: number) => void;
};

/**
 * The iOS 18 flashlight Dynamic Island: a plain island while the torch is
 * off, a compact pill with the torch glyph once it is on, and the expanded
 * control (a top-down torch whose beam, solid arc and sun mark follow the
 * beam width and intensity). Drag across it to shape the beam, tap it to
 * switch the light.
 */
export default function TorchIsland({
  mode,
  isOn,
  paramsSynchronizable,
  onExpand,
  onToggle,
  onAdjust,
}: TorchIslandProps) {
  const start = layoutFor(mode);
  const width = useSharedValue(start.width);
  const height = useSharedValue(start.height);
  const top = useSharedValue(start.top);
  const radius = useSharedValue(start.radius);
  const panelContent = useSharedValue(mode === 'expanded' ? 1 : 0);
  const compactContent = useSharedValue(mode === 'compact' ? 1 : 0);

  useEffect(() => {
    const next = layoutFor(mode);
    width.value = withSpring(next.width, SPRING);
    height.value = withSpring(next.height, SPRING);
    top.value = withSpring(next.top, SPRING);
    radius.value = withSpring(next.radius, SPRING);
    panelContent.value =
      mode === 'expanded'
        ? withDelay(90, withTiming(1, { duration: 220 }))
        : withTiming(0, { duration: 90 });
    compactContent.value =
      mode === 'compact'
        ? withDelay(160, withTiming(1, { duration: 180 }))
        : withTiming(0, { duration: 80 });
  }, [mode, width, height, top, radius, panelContent, compactContent]);

  const shellStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: height.value,
    top: top.value,
    borderRadius: radius.value,
    marginLeft: -width.value / 2,
  }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelContent.value,
    transform: [{ scale: 0.85 + 0.15 * panelContent.value }],
  }));
  const compactStyle = useAnimatedStyle(() => ({
    opacity: compactContent.value,
  }));

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      if (mode === 'expanded') {
        onToggle();
      } else if (mode === 'compact') {
        onExpand();
      }
    });
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(3)
    .onChange((e) => {
      if (mode === 'expanded') onAdjust(e.changeX, e.changeY);
    });
  const gesture = Gesture.Race(pan, tap);

  return (
    <>
      {mode === 'compact' && (
        <Pressable style={styles.compactReach} onPress={onExpand} />
      )}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.shell, shellStyle]}>
          <Animated.View
            style={[styles.panel, panelStyle]}
            pointerEvents="none"
          >
            <ShaderView
              style={StyleSheet.absoluteFill}
              fragmentShader={SHADER}
              paramsSynchronizable={paramsSynchronizable}
              params={[PANEL.width, PANEL.height, APEX_Y]}
              transparent
            />
            <Image
              source={GLYPH}
              style={[styles.glyph, isOn ? styles.glyphOn : styles.glyphOff]}
            />
          </Animated.View>
          <Animated.View
            style={[styles.compactGlyphWrap, compactStyle]}
            pointerEvents="none"
          >
            <Image source={GLYPH} style={styles.compactGlyph} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  // Touches on the status bar strip can be claimed by the system, so the
  // compact pill also answers taps just below the hardware island.
  compactReach: {
    position: 'absolute',
    top: ISLAND.top + ISLAND.height - 6,
    left: '50%',
    marginLeft: -COMPACT_WIDTH / 2,
    width: COMPACT_WIDTH,
    height: 34,
    zIndex: 49,
  },
  shell: {
    position: 'absolute',
    left: '50%',
    backgroundColor: '#000',
    overflow: 'hidden',
    zIndex: 50,
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -PANEL.width / 2,
    width: PANEL.width,
    height: PANEL.height,
  },
  glyph: {
    position: 'absolute',
    left: (PANEL.width - GLYPH_SIZE.width) / 2,
    top: APEX_Y + 2,
    width: GLYPH_SIZE.width,
    height: GLYPH_SIZE.height,
  },
  glyphOn: {
    tintColor: '#e6e4f7',
  },
  glyphOff: {
    tintColor: '#5d5d66',
  },
  compactGlyphWrap: {
    position: 'absolute',
    left: 15,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  compactGlyph: {
    width: 11,
    height: 20,
    tintColor: '#e6e4f7',
  },
});

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

const MAX_HALF: f32 = 0.74;
const MIN_HALF: f32 = 0.05;
const DOT_GAP: f32 = 5.2;

fn spectrum(x: f32) -> vec3<f32> {
  return 0.5 + 0.5 * cos(6.2831 * (vec3<f32>(x) + vec3<f32>(0.0, 0.33, 0.67)));
}

// Point on the arc of radius r at angle a from straight up, panel pt y-down.
fn onArc(apex: vec2<f32>, r: f32, a: f32) -> vec2<f32> {
  return apex + vec2<f32>(sin(a), -cos(a)) * r;
}

fn sunMark(q: vec2<f32>, c: vec2<f32>) -> f32 {
  let v = q - c;
  let d = length(v);
  let disc = 1.0 - smoothstep(2.3, 3.0, d);
  let a = atan2(v.y, v.x);
  let spoke = smoothstep(0.75, 0.95, cos(a * 8.0));
  let ray = spoke * smoothstep(3.9, 4.4, d) * (1.0 - smoothstep(5.6, 6.2, d));
  return max(disc, ray);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let size = u.params0.xy;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * size;
  let apex = vec2<f32>(size.x * 0.5, u.params0.z);

  let beam = clamp(u.live.x, 0.0, 1.0);
  let level = clamp(u.live.y, 0.0, 1.0);
  let power = clamp(u.live.z, 0.0, 1.0);

  let v = vec2<f32>(q.x - apex.x, apex.y - q.y);
  let dist = length(v);
  let ang = atan2(v.x, v.y);
  let a = abs(ang);
  let halfA = mix(MIN_HALF, MAX_HALF, beam);
  let reach = mix(72.0, 128.0, level) * mix(1.08, 0.94, beam);
  let gain = (0.3 + 0.7 * level) * mix(1.5, 1.0, beam);

  let cone = smoothstep(halfA + 0.05, halfA * 0.6, a) * step(0.0, v.y);
  let along = pow(smoothstep(reach * 1.04, reach * 0.05, dist), 0.8);
  let core = exp(-dist * dist / 180.0);
  let body = cone * along * 0.85 + core * 0.95;
  let edge = exp(-pow((a - halfA * 0.86) / (0.03 + 0.12 * halfA), 2.0))
    * along * step(0.0, v.y) * 0.22;
  let tint = spectrum(a / max(halfA, 0.01) * 0.55 + dist / 150.0);

  var rgb = vec3<f32>(0.96, 0.96, 1.0) * body * gain + tint * edge * gain;
  var alpha = clamp((body + edge * 0.5) * gain, 0.0, 1.0);
  rgb = rgb * power;
  alpha = alpha * power;

  let ring = 1.0 - smoothstep(0.55, 1.35, abs(dist - reach));
  let solid = ring * (1.0 - smoothstep(halfA, halfA + 0.02, a)) * step(0.0, v.y);
  let s = ang * reach;
  let sc = (floor(s / DOT_GAP) + 0.5) * DOT_GAP;
  let dotC = onArc(apex, reach, sc / reach);
  let dotted = (1.0 - smoothstep(0.55, 1.15, length(q - dotC)))
    * step(halfA + 0.03, a) * step(a, MAX_HALF + 0.06);
  let sun = sunMark(q, onArc(apex, reach, max(halfA, 0.1) + 0.17));
  let marks = solid * 0.85 + dotted * 0.4 + sun * 0.75;
  let markAlpha = marks * mix(0.35, 1.0, power);

  rgb = rgb + vec3<f32>(1.0) * markAlpha * (1.0 - alpha);
  alpha = alpha + markAlpha * (1.0 - alpha);
  return vec4<f32>(min(rgb, vec3<f32>(1.0)), clamp(alpha, 0.0, 1.0));
}
`;
