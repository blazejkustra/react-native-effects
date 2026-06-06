import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
} from 'react-native-effects';

type Props = ViewProps & {
  /**
   * Live scroll channel written into `u.params1` every frame: `x` = progress
   * (0..1), `y` = rubber-band overscroll. Drive it with `setParamsSynchronizable` from a scroll
   * handler (see `useParamsSynchronizable`) so scrolling never re-renders React.
   */
  paramsSynchronizable?: ParamsSynchronizable;
  /** Contour line color (and the index lines). */
  colorA?: ColorInput;
  /** Secondary tone for the index lines and the low-ground wash. */
  colorB?: ColorInput;
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
};

/**
 * An animated topographic contour map. A noise elevation field is sliced into
 * thin survey-map contour lines (every 5th an "index" line) drawn in `colorA`
 * over black. `progress` (typically a normalized scroll offset) pans the terrain
 * and tightens the contours, so the background drifts as the user scrolls.
 *
 * Lives in the example app rather than the library — it is a demo of what you
 * can build on top of `ShaderView`, not a general-purpose library primitive.
 */
export default function ScrollReactive({
  paramsSynchronizable,
  colorA = '#3457ff',
  colorB = '#c026d3',
  speed = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [colorA, colorB], [colorA, colorB]);

  return (
    <ShaderView
      fragmentShader={SCROLL_REACTIVE_SHADER}
      colors={colors}
      paramsSynchronizable={paramsSynchronizable}
      speed={speed}
      {...viewProps}
    />
  );
}

const SCROLL_REACTIVE_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
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
  let u2 = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u2.x), mix(c, d, u2.x), u2.y);
}

fn fbm(p0: vec2<f32>) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.5;
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 5; i = i + 1) {
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
  var p = (uv - 0.5) * vec2<f32>(aspect, 1.0);

  // Live scroll channel (u.params1): x = progress 0..1, y = overscroll.
  let prog = clamp(u.params1.x, 0.0, 1.0);
  // Rubber-band overscroll (screen-heights): negative at the top, positive at
  // the bottom. Lets the terrain keep reacting past either end of the list.
  let over = u.params1.y;

  // A slowly evolving elevation field. Scrolling pans the terrain upward and
  // lifts the relief, so the contour map drifts and tightens as you read.
  p = p * 1.7;
  // Scroll gently pans the terrain — keep this small or a flick of the
  // scrollview rockets the whole field across the screen. Overscroll adds an
  // extra springy pan at both ends.
  p.y = p.y + prog * 0.3 + over * 1.6;
  var h = fbm(p + vec2<f32>(t * 0.012, t * 0.008));
  h = fbm(p + vec2<f32>(h, h) * (0.5 + prog * 0.15 + abs(over) * 0.5) + vec2<f32>(0.0, t * 0.01));

  // Slice the field into topographic contour lines — density barely shifts
  // with scroll so the map stays calm.
  let bands = 25.0 + prog * 2.0;
  let f = h * bands;
  let d = abs(fract(f) - 0.5);              // 0 exactly on a contour line
  let aa = fwidth(f) * 1.1;                 // screen-space anti-aliased thickness
  let lineMask = 1.0 - smoothstep(0.0, aa, d);

  // Every 5th line is a brighter "index" contour, like a real survey map.
  let idx = floor(f);
  let isMajor = select(0.0, 1.0, (idx - 5.0 * floor(idx / 5.0)) < 0.5);

  let lineCol = mix(u.color0.rgb, u.color1.rgb, isMajor * 0.5);
  var col = lineCol * lineMask * (0.5 + isMajor * 0.5);

  // A faint warm wash pooling in the low ground gives quiet depth between lines.
  col = col + u.color1.rgb * smoothstep(0.55, 0.0, h) * 0.04;

  // Vignette to settle the edges into black.
  let vd = uv - vec2<f32>(0.5, 0.5);
  col = col * clamp(1.0 - dot(vd, vd) * 0.8, 0.4, 1.0);

  // A whisper of grain so the darks never band on real displays.
  let grain = hash21(uv * u.resolution.xy + fract(t) * 311.0) - 0.5;
  col = col + grain * 0.01;

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
