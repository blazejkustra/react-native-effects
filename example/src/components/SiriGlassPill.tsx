import { useMemo } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from '@callstack/liquid-glass';

type Props = ViewProps & {
  /** Pill width in points. Default: 174 */
  width?: number;
  /** Pill height in points. Default: 118 */
  height?: number;
  /** Idle wave energy 0..1 used when no audio is flowing. Default: 0.3 */
  activity?: number;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /**
   * Live audio from `useAudioReactive` — (level, bass, treble, listening).
   * When listening, the wave height/brightness follows your voice.
   */
  paramsSynchronizable?: ParamsSynchronizable;
};

/**
 * The iOS 26 Siri "glow" — a liquid-glass capsule hanging from the Dynamic
 * Island. Glossy black dome on top, refractive glass below, and the Siri
 * spectrum wave — an eye-shaped band of rainbow light that bulges up in the
 * middle as Siri talks — flowing between them.
 *
 * The capsule is a real `LiquidGlassView` (UIGlassEffect, iOS 26+) so the
 * wallpaper genuinely refracts behind it; the black dome, spectrum band,
 * island-reflection window and rim speculars are drawn by a transparent
 * ShaderView layered inside it. Modeled frame-by-frame on a capture of the
 * real animation.
 */
export default function SiriGlassPill({
  width = 174,
  height = 118,
  activity = 0.3,
  speed = 1.0,
  paramsSynchronizable,
  style,
  ...viewProps
}: Props) {
  const radius = height * 0.48;
  const params = useMemo(
    () => [radius / height, activity],
    [radius, height, activity]
  );

  return (
    <View
      style={[styles.shadow, { width, height, borderRadius: radius }, style]}
      {...viewProps}
    >
      <LiquidGlassView
        style={[
          styles.glass,
          { borderRadius: radius },
          !isLiquidGlassSupported && styles.fallback,
        ]}
        effect="clear"
        colorScheme="dark"
      >
        <ShaderView
          fragmentShader={SIRI_GLASS_SHADER}
          params={params}
          speed={speed}
          paramsSynchronizable={paramsSynchronizable}
          transparent
          style={StyleSheet.absoluteFill}
        />
      </LiquidGlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
    marginTop: 8,
  },
  glass: {
    flex: 1,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  fallback: {
    backgroundColor: 'rgba(20, 20, 24, 0.30)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});

const SIRI_GLASS_SHADER = /* wgsl */ `
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
  let dd = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, dd, w.x), w.y);
}

fn fbm(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  var acc = 0.0;
  var amp = 0.5;
  for (var i = 0; i < 3; i++) {
    acc += amp * vnoise(p);
    p = p * 2.03 + vec2<f32>(1.7, 9.2);
    amp *= 0.5;
  }
  return acc;
}

fn sdRoundedBox(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let q = abs(p) - b + vec2<f32>(r);
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// Rainbow spectrum palette (used for the chromatic edge tips).
fn pal(h: f32) -> vec3<f32> {
  return 0.5 + 0.5 * cos(6.28318 * (h + vec3<f32>(0.00, 0.33, 0.67)));
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let rFrac = u.params0.x;
  let idle = clamp(u.params0.y, 0.0, 1.0);

  // Live audio: (level, bass, treble, listening).
  let level = u.live.x;
  let bass = u.live.y;
  let treble = u.live.z;
  let listening = u.live.w;

  let uv = ndc * 0.5 + 0.5;
  // Height-normalized coords: x centered, v = distance from the TOP (0..1).
  let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);
  let x = p.x;
  let v = 1.0 - uv.y;
  let halfW = aspect * 0.5;
  let xn = x / halfW; // -1 .. 1 across the pill

  // Capsule mask matching the view's rounded corners.
  let d = sdRoundedBox(p, vec2<f32>(halfW, 0.5), rFrac);
  let px = 1.0 / u.resolution.y;
  let mask = 1.0 - smoothstep(-1.5 * px, 1.5 * px, d);

  // ---- Energy: voice-driven when listening, gentle shimmer when idle ----
  let idleE = idle * (0.55 + 0.18 * sin(t * 1.4) + 0.12 * sin(t * 2.3 + 1.7));
  let voiceE = 0.10 + 1.25 * level + 0.30 * bass;
  let e = clamp(mix(idleE, voiceE, listening), 0.04, 1.3);

  // ---- Base glass darkening (alpha field, color stays black) ----
  // Solid black on top, dissolving in one long blurred gradient down the
  // lower half of the capsule — no hard edge, brightest at the bottom rim.
  let baseA = mix(1.0, 0.18, smoothstep(0.42, 0.95, v));

  // ---- The Siri wave ----
  // One coherent lens ("eye" of light): pinched to sharp points at the left
  // and right glass edges, fat in the middle, bowing with the voice. The hue
  // sweeps spectrally along x — cyan on the left through green and yellow to
  // red on the right — with a creamy white mass swelling in the center as
  // Siri talks, the way the capture reads frame by frame.
  let envTip = 0.06 + 0.94 * pow(max(1.0 - xn * xn, 0.0), 2.2);

  // Two shared noise fields warp every layer's phase — organic, unpredictable.
  let nA = fbm(vec2<f32>(xn * 0.9 + t * 0.20, t * 0.28));
  let nB = fbm(vec2<f32>(xn * 1.7 - t * 0.24, 7.3 + t * 0.33));

  // Lens boundary.
  let vMid = 0.55;
  let upA = (0.10 + 0.34 * e) * (0.70 + 0.30 * (fbm(vec2<f32>(xn * 1.2 + t * 0.5, 3.7 + t * 0.2)) * 2.0 - 0.6));
  let dnA = (0.08 + 0.20 * e) * (0.78 + 0.22 * sin(xn * 1.5 - t * 0.9 + (nB - 0.5) * 3.0));
  let yT = max(vMid - upA * envTip, 0.28);
  let yB = min(vMid + dnA * envTip, 0.74);
  let thick = max(yB - yT, 0.001);
  let eyeMask = smoothstep(yT - 0.012, yT + 0.022, v)
              * (1.0 - smoothstep(yB - 0.006, yB + 0.022, v));

  var glow = vec3<f32>(0.0);
  let brightAll = 0.62 + 0.55 * e;

  // s: 0 at the band's top edge, 1 at its bottom.
  let s = clamp((v - yT) / thick, 0.0, 1.0);

  // Creamy white mass swelling in the center.
  let bulge = exp(-xn * xn * 2.6) * exp(-pow((s - 0.55) / 0.42, 2.0));
  glow += vec3<f32>(1.00, 0.98, 0.92) * bulge * (0.10 + 0.85 * e);

  // Distinct waves — each a filled body of its own color: a bright crest
  // line with a translucent fill sinking below it toward the lens baseline,
  // fading with depth so stacked waves stay readable instead of washing out.
  // Each rides its own noise-warped oscillation. Stacked top to bottom.

  // white — caps the figure
  var o = sin(3.4 * xn + 2.8 * t + 0.3 + (nA - 0.5) * 5.0)
        * (0.60 + 0.40 * sin(2.1 * xn - 2.4 * t + (nB - 0.5) * 4.0));
  var q = clamp(0.74 + 0.28 * o, 0.0, 1.05);
  var yC = yB - thick * q;
  var cr = exp(-pow((v - yC) / 0.024, 2.0));
  var fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(1.00, 1.00, 1.00) * (fill * 0.22 + cr * 0.45) * brightAll;

  // cyan
  o = sin(4.5 * xn + 3.6 * t + 1.9 + (nA - 0.5) * 4.4)
    * (0.60 + 0.40 * sin(2.7 * xn - 2.9 * t + 2.9 + (nB - 0.5) * 4.5));
  q = clamp(0.60 + 0.32 * o, 0.0, 1.0);
  yC = yB - thick * q;
  cr = exp(-pow((v - yC) / 0.020, 2.0));
  fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(0.15, 0.75, 1.00) * (fill * 0.40 + cr * 0.60) * brightAll;

  // violet
  o = sin(5.3 * xn + 2.7 * t + 3.7 + (nB - 0.5) * 5.0)
    * (0.60 + 0.40 * sin(3.2 * xn - 2.2 * t + 1.1 + (nA - 0.5) * 4.0));
  q = clamp(0.48 + 0.30 * o, 0.0, 1.0);
  yC = yB - thick * q;
  cr = exp(-pow((v - yC) / 0.020, 2.0));
  fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(0.55, 0.30, 1.00) * (fill * 0.40 + cr * 0.60) * brightAll;

  // green — livens with treble
  o = sin(6.1 * xn + 4.2 * t + 4.5 + (nA - 0.5) * 4.8)
    * (0.60 + 0.40 * sin(3.7 * xn - 3.4 * t + 0.5 + (nB - 0.5) * 4.2));
  q = clamp(0.38 + (0.26 + 0.18 * treble) * o, 0.0, 1.0);
  yC = yB - thick * q;
  cr = exp(-pow((v - yC) / 0.019, 2.0));
  fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(0.25, 0.95, 0.35) * (fill * 0.38 + cr * 0.58) * brightAll;

  // magenta
  o = sin(4.2 * xn + 2.0 * t + 2.7 + (nB - 0.5) * 4.6)
    * (0.60 + 0.40 * sin(2.4 * xn - 1.7 * t + 4.2 + (nA - 0.5) * 4.4));
  q = clamp(0.28 + 0.26 * o, 0.0, 1.0);
  yC = yB - thick * q;
  cr = exp(-pow((v - yC) / 0.020, 2.0));
  fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(1.00, 0.25, 0.65) * (fill * 0.38 + cr * 0.58) * brightAll;

  // amber
  o = sin(4.8 * xn + 3.3 * t + 0.9 + (nA - 0.5) * 4.2)
    * (0.60 + 0.40 * sin(3.0 * xn - 2.6 * t + 3.4 + (nB - 0.5) * 4.7));
  q = clamp(0.20 + 0.22 * o, 0.0, 1.0);
  yC = yB - thick * q;
  cr = exp(-pow((v - yC) / 0.019, 2.0));
  fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(1.00, 0.70, 0.15) * (fill * 0.36 + cr * 0.55) * brightAll;

  // red — swells with bass, hugs the baseline
  o = sin(3.7 * xn + 2.4 * t + 5.6 + (nB - 0.5) * 4.4)
    * (0.60 + 0.40 * sin(2.2 * xn - 1.9 * t + 1.8 + (nA - 0.5) * 4.6));
  q = clamp(0.10 + (0.18 + 0.16 * bass) * o, 0.0, 1.0);
  yC = yB - thick * q;
  cr = exp(-pow((v - yC) / 0.020, 2.0));
  fill = smoothstep(yC - 0.015, yC + 0.015, v) * exp(-max(v - yC, 0.0) * 6.5);
  glow += vec3<f32>(1.00, 0.20, 0.12) * (fill * 0.38 + cr * 0.58) * brightAll;

  // Confine the ribbons to the lens and give it a soft inner ambience.
  glow *= eyeMask;
  glow += vec3<f32>(0.85, 0.90, 1.00) * eyeMask * 0.03 * brightAll;

  // Hot lick of light spilling just below the band's center.
  let lick = exp(-pow((v - (yB + 0.02)) / 0.05, 2.0)) * exp(-xn * xn * 2.0);
  glow += vec3<f32>(1.00, 0.95, 0.85) * lick * 0.20 * e;

  // Vertical caustic seam wobbling from the band down to the bottom rim.
  let seamX = 0.07 + 0.10 * (nB - 0.5) + 0.04 * sin(t * 0.6);
  let seam = exp(-pow((xn - seamX) / 0.035, 2.0))
           * smoothstep(0.60, 0.74, v) * (1.0 - smoothstep(0.90, 1.0, v));
  glow += vec3<f32>(0.95, 0.97, 1.00) * seam * 0.09;

  // Chromatic rainbow tips where the lens pinches into the glass edge.
  let hue = 0.5 * xn + 0.06 * t;
  let tip = smoothstep(0.74, 0.97, abs(xn));
  let nearBand = smoothstep(yT - 0.05, yT + 0.10, v)
               * (1.0 - smoothstep(yB, yB + 0.05, v));
  glow += pal(hue) * tip * nearBand * 0.50 * (0.3 + e);

  // ---- Speculars ----
  // Outer rim: bright stroke inside the glass edge, strongest on the lower
  // arc, with faint chromatic streaks curling along the dome's upper corners.
  let rd = (d + 0.018) / 0.010;
  let rimBand = exp(-rd * rd);
  let rimW = smoothstep(0.30, 0.80, v) * (0.35 + 0.65 * smoothstep(0.10, 0.60, abs(xn)));
  let rimTop = (1.0 - smoothstep(0.12, 0.42, v)) * smoothstep(0.25, 0.80, abs(xn)) * 0.4;
  let rim = rimBand * (rimW + rimTop + 0.9 * tip * nearBand);
  let rimCol = mix(vec3<f32>(1.0), pal(hue + 0.25 * v), 0.35 * tip + 0.5 * rimTop) * rim * 0.9;

  // Gloss sheen on the very top of the black dome.
  let sheen = exp(-pow((v - 0.05) / 0.10, 2.0)) * smoothstep(0.40, 0.95, abs(xn)) * 0.05;

  // ---- Compose (premultiplied alpha) ----
  var col = glow + rimCol + vec3<f32>(sheen);
  let lum = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  var alpha = clamp(baseA + lum * 0.75 + rim * 0.5, 0.0, 1.0);

  col = min(col, vec3<f32>(1.0)) * mask;
  alpha = alpha * mask;

  return vec4<f32>(col, alpha);
}
`;
