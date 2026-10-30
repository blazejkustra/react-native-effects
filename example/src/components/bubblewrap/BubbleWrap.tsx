import { useMemo } from 'react';
import type { ImageSourcePropType, ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';
import type { BubbleGrid } from '../../hooks/useBubbleWrap';

type Props = ViewProps & {
  /** What the sheet lies on; seen through the film and bent by each dome. */
  surface: ImageSourcePropType;
  /** `[scaleX, scaleY]` mapping screen uv onto the photo, cover-fit. */
  coverScale: [number, number];
  grid: BubbleGrid;
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A sheet of clear bubble wrap lying on a photographed surface.
 *
 * Every bubble is a shallow dome of clear film: it magnifies and bends the
 * surface under it, throws a soft shadow and a little focused light onto it,
 * and carries a soft window highlight and a bright Fresnel rim. The flat
 * film between bubbles is faintly crinkled. A popped bubble (its float in the
 * live channel goes 0 to 1) slumps into a flat, creased, slightly whitened
 * disc whose highlight breaks into crumbs.
 */
export default function BubbleWrap({
  surface,
  coverScale,
  grid,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  const params = useMemo(
    () => [
      grid.spacing,
      grid.rowHeight,
      grid.stride,
      grid.rows,
      coverScale[0],
      coverScale[1],
    ],
    [grid, coverScale]
  );
  return (
    <ShaderView
      fragmentShader={BUBBLE_SHADER}
      texture={surface}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const BUBBLE_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const RADIUS = 0.44;

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

// Screen points (y down) -> the photo.
fn surfaceAt(pt: vec2<f32>) -> vec3<f32> {
  let size = u.resolution.xy / u.resolution.w;
  let suv = pt / size;
  let iuv = (suv - 0.5) * u.params1.xy + 0.5;
  return textureSampleLevel(tex, samp, iuv, 0.0).rgb;
}

fn bubbleState(idx: i32) -> f32 {
  let i = clamp(idx, 0, 383);
  let v = u.liveData[i / 4];
  return v[i % 4];
}

struct Nearest {
  center: vec2<f32>,
  idx: i32,
  valid: f32,
};

fn nearestBubble(pt: vec2<f32>) -> Nearest {
  let sp = u.params0.x;
  let rowH = u.params0.y;
  let stride = i32(u.params0.z);
  let rows = i32(u.params0.w);
  let r0 = i32(floor(pt.y / rowH - 0.5));
  var best: Nearest;
  best.valid = 0.0;
  best.idx = 0;
  best.center = vec2<f32>(-1000.0);
  var bestD = 1e9;
  for (var k = 0; k < 2; k = k + 1) {
    let row = r0 + k;
    let shift = select(0.0, 0.5, (row & 1) == 0);
    let col = i32(round(pt.x / sp - shift));
    let center = vec2<f32>((f32(col) + shift) * sp, (f32(row) + 0.5) * rowH);
    let d = distance(pt, center);
    let ok = row >= 0 && row < rows && col >= 0 && col < stride;
    if (ok && d < bestD) {
      bestD = d;
      best.center = center;
      best.idx = row * stride + col;
      best.valid = 1.0;
    }
  }
  return best;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let size = u.resolution.xy / u.resolution.w;
  let pt = vec2<f32>(uv.x, 1.0 - uv.y) * size;
  let sp = u.params0.x;
  let R = sp * RADIUS;
  let aa = 1.2 / (R * u.resolution.w);

  let nb = nearestBubble(pt);
  let popRaw = select(0.0, bubbleState(nb.idx), nb.valid > 0.5);
  let pop = popRaw * popRaw * (3.0 - 2.0 * popRaw);
  let seed = hash21(vec2<f32>(f32(nb.idx), 7.0));
  // Local bubble coords, y up, 1.0 at the dome's foot.
  let d = pt - nb.center;
  let o = vec2<f32>(d.x, -d.y) / R;
  let rr = length(o);
  let inside = smoothstep(1.0 + aa, 1.0 - aa, rr) * nb.valid;

  // Dome: a squashed hemisphere that slumps to almost nothing when popped.
  let domeH = mix(0.72 + 0.16 * seed, 0.07, pop);
  let foot = sqrt(max(1.0 - rr * rr, 0.035));
  var n = vec3<f32>(o * domeH / foot, 1.0);
  // Crumple: creases radiate from the middle; a popped film is a mess of
  // small facets.
  let ang = atan2(o.y, o.x);
  let creaseA = vnoise(vec2<f32>(ang * 2.6 + seed * 40.0, rr * 2.0));
  let creaseB = vnoise(o * 4.2 + seed * 13.0);
  let creaseC = vnoise(o * 4.2 + seed * 13.0 + 31.7);
  let crumple = vec2<f32>(creaseB - 0.5, creaseC - 0.5) * 2.2 + vec2<f32>(cos(ang), sin(ang)) * (creaseA - 0.5) * 2.4;
  n = vec3<f32>(n.xy + crumple * pop * smoothstep(1.02, 0.55, rr), n.z);
  n = normalize(n);

  // Film between bubbles: barely crinkled.
  let fw = vec2<f32>(vnoise(pt * 0.07), vnoise(pt * 0.07 + 9.1)) - 0.5;
  let fw2 = vec2<f32>(vnoise(pt * 0.23 + 3.3), vnoise(pt * 0.23 + 5.9)) - 0.5;
  let nFilm = normalize(vec3<f32>(fw * 0.22 + fw2 * 0.08, 1.0));
  let nrm = normalize(mix(nFilm, n, inside));

  // The surface under the film: magnified and bent by each intact dome,
  // shadowed beside it, brightened where the dome focuses light.
  let lens = (1.0 - pop) * inside;
  let refr = nb.center + d * mix(1.0, 0.84, lens) + vec2<f32>(nrm.x, -nrm.y) * 5.0 * (lens + pop * inside * 0.4);
  var base = surfaceAt(refr);
  let sh = distance(pt, nb.center + vec2<f32>(R * 0.22, R * 0.34)) / R;
  let shadow = 0.24 * (1.0 - 0.8 * pop) * smoothstep(1.08, 0.72, sh) * (1.0 - lens * 0.7) * nb.valid;
  let focus = 0.18 * lens * smoothstep(0.75, 0.0, distance(o, vec2<f32>(0.15, -0.2)));
  base = base * (1.0 - shadow) * (1.0 + focus);
  base = base * 0.92 + vec3<f32>(0.012, 0.014, 0.018);

  // Light: a window up and to the left, a soft room fill.
  // A camera and a window at finite distances, so the reflection slides and
  // stretches across the sheet instead of repeating on every bubble.
  let fromEye = vec2<f32>(pt.x - size.x * 0.5, size.y * 0.5 - pt.y);
  let v = normalize(vec3<f32>(-fromEye, 1400.0));
  let r = reflect(-v, nrm);
  let onCeiling = r.xy / max(r.z, 0.1) * 420.0 + vec2<f32>(pt.x, -pt.y);
  let windowCenter = vec2<f32>(-0.7 * size.x, 0.45 * size.y);
  let wq = (onCeiling - windowCenter) / vec2<f32>(0.8 * size.x, 0.7 * size.y);
  let streak = smoothstep(1.0, 0.6, length(wq)) * (0.7 + 0.3 * smoothstep(-0.4, 0.6, wq.y));
  let toLamp = vec3<f32>(-0.4 * size.x - pt.x, pt.y + 0.5 * size.y, 900.0);
  let sunH = normalize(normalize(toLamp) + v);
  let sun = pow(clamp(dot(nrm, sunH), 0.0, 1.0), 320.0);
  let k = 1.0 - clamp(nrm.z, 0.0, 1.0);
  let fres = 0.04 + 0.96 * k * k * k;

  var col = base;
  col = col + vec3<f32>(1.0, 0.99, 0.97) * streak * (0.5 + fres) * mix(1.0, 0.45, pop) * (0.2 + 0.8 * inside);
  col = col + vec3<f32>(1.0) * min(sun * 1.1, 1.0);
  let lit = dot(o / max(rr, 1e-3), vec2<f32>(-0.6, 0.8));
  let crescent = smoothstep(0.62, 0.84, rr) * smoothstep(0.98, 0.88, rr) * smoothstep(0.1, 0.85, lit);
  col = col + vec3<f32>(1.0, 0.98, 0.95) * 0.42 * crescent * inside * (1.0 - pop);
  col = col + vec3<f32>(0.85, 0.9, 1.0) * fres * 0.55 * inside;
  // Total internal reflection darkens the dome's steep foot; the welded
  // seam around it shows as a thin bright line.
  col = col * (1.0 - 0.22 * smoothstep(0.72, 0.97, rr) * inside * (1.0 - pop));
  let away = dot(o, vec2<f32>(0.6, -0.8));
  col = col * (1.0 - 0.16 * smoothstep(0.2, 0.95, away) * inside * (1.0 - pop));
  let bounce = smoothstep(0.55, 0.85, away) * smoothstep(1.0, 0.9, rr);
  col = col + vec3<f32>(0.9, 0.85, 0.75) * 0.1 * bounce * inside * (1.0 - pop);
  let seam = smoothstep(0.06, 0.0, abs(rr - 1.03)) * nb.valid;
  col = col + vec3<f32>(0.10) * seam;
  // A popped film is stretched and whitened a little.
  col = mix(col, vec3<f32>(0.86, 0.88, 0.9), 0.16 * pop * inside * (0.4 + creaseB));

  col = col + (hash21(uv * u.resolution.xy) - 0.5) / 255.0;
  return vec4<f32>(col, 1.0);
}`;
