import { useMemo } from 'react';
import {
  ShaderView,
  type ColorInput,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

export type DissolveProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'colors' | 'paramsSynchronizable'
> & {
  /** Dissolve progress channel: `u.params1.x` 0 (intact) → 1 (gone). */
  paramsSynchronizable: ParamsSynchronizable;
  /** Base card tone. */
  baseColor?: ColorInput;
  /** Accent tone for the holographic gradient + sheen. */
  accentColor?: ColorInput;
};

/**
 * Shared WGSL prelude for the dissolve variants: the Uniforms struct plus the
 * noise / voronoi helpers and the procedural holographic `cardSurface`. Each
 * variant appends its own `@fragment main` that reads `u.params1.x` as the
 * dissolve progress and erodes `cardSurface` in its own style. No texture
 * sampling — the card is generated in-shader, so it can dissolve itself.
 */
export const DISSOLVE_PRELUDE = /* wgsl */ `
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

fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
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
  for (var i = 0; i < 5; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

// Procedural holographic card surface: diagonal gradient + drifting sheen.
fn cardSurface(uv: vec2<f32>) -> vec3<f32> {
  let t = u.time.x;
  var col = mix(u.color0.rgb, u.color1.rgb,
                clamp(uv.x * 0.7 + uv.y * 0.3, 0.0, 1.0));
  let sheen = smoothstep(0.34, 0.0,
              abs((uv.x - uv.y * 0.5) - (0.5 + 0.16 * sin(t * 0.6))));
  col = col + sheen * 0.18;
  col = col + (hash21(uv * u.resolution.xy) - 0.5) * 0.02;
  return col;
}

// Voronoi: returns vec3(distanceToCellEdge, cellHash, distanceToCellCentre).
fn voronoi(p: vec2<f32>) -> vec3<f32> {
  let ip = floor(p);
  let fp = fract(p);
  var mg = vec2<f32>(0.0);
  var mr = vec2<f32>(0.0);
  var mid = 0.0;
  var md = 8.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let g = vec2<f32>(f32(i), f32(j));
      let o = hash22(ip + g);
      let r = g + o - fp;
      let d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
        mg = g;
        mid = hash21(ip + g);
      }
    }
  }
  var medge = 8.0;
  for (var j = -2; j <= 2; j = j + 1) {
    for (var i = -2; i <= 2; i = i + 1) {
      let g = mg + vec2<f32>(f32(i), f32(j));
      let o = hash22(ip + g);
      let r = g + o - fp;
      let diff = mr - r;
      if (dot(diff, diff) > 0.00001) {
        medge = min(medge, dot(0.5 * (mr + r), normalize(r - mr)));
      }
    }
  }
  return vec3<f32>(medge, mid, sqrt(md));
}
`;

/**
 * Build a dissolve component from a `@fragment main` body. The factory prepends
 * {@link DISSOLVE_PRELUDE}, wires the two card colors into `color0/color1`, and
 * renders the {@link ShaderView} `transparent` so dissolved fragments reveal
 * what's behind.
 */
export function createDissolveComponent(mainWGSL: string) {
  const fragmentShader = DISSOLVE_PRELUDE + mainWGSL;

  return function Dissolve({
    paramsSynchronizable,
    baseColor = '#3b2a8c',
    accentColor = '#ff5fa2',
    ...rest
  }: DissolveProps) {
    const colors = useMemo(
      () => [baseColor, accentColor],
      [baseColor, accentColor]
    );

    return (
      <ShaderView
        fragmentShader={fragmentShader}
        colors={colors}
        paramsSynchronizable={paramsSynchronizable}
        transparent
        speed={1.0}
        {...rest}
      />
    );
  };
}
