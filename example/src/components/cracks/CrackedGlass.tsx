import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

export const MAX_IMPACTS = 6;
/** `u.live` + two vec4 per impact in `u.liveData`. */
export const CRACK_CHANNEL_LENGTH = 4 + MAX_IMPACTS * 8;

type CrackedGlassProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent' | 'texture'
> & {
  /** Snapshot of the content under the glass, sized like this view. */
  textureUri: string;
  /**
   * `u.live = (impactCount, tiltX, tiltY, 0)`, then per impact
   * `(x, y, progress, seed), (strength, 0, 0, 0)` in logical px, y-down.
   */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A shattered cover glass over a snapshot of the screen. Each impact grows a
 * crushed centre of fine log-polar shards, a fan of long wavy radial cracks
 * with side branches, and polygonal ring cracks between neighbouring rays.
 * Every shard (sector between two rays x band between two rings) refracts the
 * content by its own small offset and tilts its own sheen, and crack edges
 * catch a thin highlight on the side facing the light.
 */
export default function CrackedGlass({
  textureUri,
  paramsSynchronizable,
  ...rest
}: CrackedGlassProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      texture={{ uri: textureUri }}
      paramsSynchronizable={paramsSynchronizable}
      transparent
      {...rest}
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
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

const TAU: f32 = 6.2831853;
const PI: f32 = 3.14159265;
const MAX_IMPACTS: i32 = 6;
const RAYS: i32 = 11;
const RINGS: i32 = 3;
const REACH: f32 = 950.0;  // longest radial crack, logical px
const CORE: f32 = 20.0;    // crushed centre radius, logical px
const CRUSH_CELLS: f32 = 15.0;
const SPLINTERS: i32 = 23;

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
fn wrapPi(a: f32) -> f32 {
  return a - TAU * floor((a + PI) / TAU);
}
fn dir(a: f32) -> vec2<f32> {
  return vec2<f32>(cos(a), sin(a));
}
fn wrapRay(j: i32) -> i32 {
  return ((j % RAYS) + RAYS) % RAYS;
}

// Angle of radial crack j at distance r: a jittered fan plus a slow wander
// and a fine jag, so long cracks are neither straight nor wobbly.
fn rayAngle(j: i32, seed: f32, r: f32) -> f32 {
  let fj = f32(j);
  let h = hash21(vec2<f32>(fj, seed * 31.0));
  let base = (fj + 0.5 + (h - 0.5) * 0.8) * TAU / f32(RAYS) + seed * TAU;
  let wander = 0.04 * sin(r * 0.011 + h * 40.0) * smoothstep(0.0, 200.0, r);
  let jagPx = 1.3 * sin(r * 0.083 + h * 17.0) + 0.7 * sin(r * 0.29 + h * 9.0) + 0.4 * sin(r * 0.71 + h * 3.0);
  return base + wander + jagPx / max(r, 1.0) * smoothstep(CORE, CORE * 4.0, r);
}
fn rayLength(j: i32, seed: f32, strength: f32) -> f32 {
  let h = hash21(vec2<f32>(f32(j), seed * 31.0 + 5.0));
  return REACH * strength * mix(0.22, 1.0, h * h);
}
fn ringRadius(j: i32, k: i32, seed: f32, strength: f32) -> f32 {
  let base = CORE * strength * (1.9 + f32(k) * 1.55 + f32(k * k) * 0.55);
  return base * (0.86 + 0.28 * hash21(vec2<f32>(f32(j) + 0.5, f32(k) + seed * 13.0)));
}
fn ringInSector(s: i32, k: i32, seed: f32) -> bool {
  return hash21(vec2<f32>(f32(s) * 3.0 + f32(k), seed * 7.0 + 2.0)) > 0.3;
}

// (distance, normal toward q, t along the segment)
fn segment(q: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> vec4<f32> {
  let ab = b - a;
  let t = clamp(dot(q - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  let d = q - (a + ab * t);
  let l = length(d);
  let n = select(vec2<f32>(-ab.y, ab.x) / max(length(ab), 0.0001), d / l, l > 0.0001);
  return vec4<f32>(l, n, t);
}

struct Glass {
  edge: f32,          // signed distance to the nearest crack edge, device px
  nrm: vec2<f32>,     // that crack's normal, pointing at this pixel
  offset: vec2<f32>,  // refraction of the content, logical px
  shade: f32,         // per-shard sheen
  crush: f32,         // milky crushed-glass amount
  dust: f32,          // crushed shard borders
};

fn takeLine(g: ptr<function, Glass>, dist: f32, width: f32, n: vec2<f32>) {
  let e = dist * u.resolution.w - width * 0.5;
  if (e < (*g).edge) {
    (*g).edge = e;
    (*g).nrm = n;
  }
}

fn impact(g: ptr<function, Glass>, q: vec2<f32>, light: vec2<f32>, i: i32) {
  let a = u.liveData[i * 2];
  let b = u.liveData[i * 2 + 1];
  let c = a.xy;
  let prog = a.z;
  let seed = a.w;
  let strength = b.x;
  if (prog <= 0.0) {
    return;
  }

  let d = q - c;
  let r = length(d);
  let th = atan2(d.y, d.x);
  let core = CORE * strength * (1.0 + 0.25 * sin(th * 3.0 + seed * 20.0) + 0.12 * sin(th * 7.0 + seed * 9.0));
  let front = REACH * strength * prog;

  // Radial cracks: the base sector and its two neighbours.
  let rel = fract((th - seed * TAU) / TAU);
  let k = i32(floor(rel * f32(RAYS)));
  var sector = k;
  for (var jj = -1; jj <= 1; jj = jj + 1) {
    let j = wrapRay(k + jj);
    let ang = rayAngle(j, seed, r);
    let diff = wrapPi(th - ang);
    if (jj == 0 && diff < 0.0) {
      sector = wrapRay(k - 1);
    }
    let len = rayLength(j, seed, strength);
    let reach = len * prog;
    if (r < reach && abs(diff) < 1.2) {
      let taper = 1.0 - r / len;
      let w = (0.9 + 1.6 * taper * taper) * mix(1.0, 1.8, smoothstep(core * 3.0, core, r));
      let side = select(-1.0, 1.0, diff > 0.0);
      takeLine(g, r * abs(sin(diff)), w, dir(ang + PI * 0.5) * side);
    }

    // One side branch per ray, splitting off partway along it.
    let hb = hash22(vec2<f32>(f32(j) + 3.7, seed * 17.0));
    let br = len * mix(0.18, 0.55, hb.x);
    let blen = len * mix(0.25, 0.5, hb.y);
    let bang = rayAngle(j, seed, br) + select(-0.5, 0.5, hb.y > 0.5) * mix(0.6, 1.2, hb.x);
    let shown = clamp((front * len / (REACH * strength) - br) / blen, 0.0, 1.0);
    if (shown > 0.0) {
      let p0 = c + dir(rayAngle(j, seed, br)) * br;
      let p1 = p0 + dir(bang) * blen * shown;
      let s = segment(q, p0, p1);
      takeLine(g, s.x, 0.8 + 0.6 * (1.0 - s.w), s.yz);
    }
  }

  // Short splinters around the crushed centre.
  let fk = i32(floor(fract((th - seed * 3.1) / TAU) * f32(SPLINTERS)));
  for (var jj = -1; jj <= 1; jj = jj + 1) {
    let j = ((fk + jj) % SPLINTERS + SPLINTERS) % SPLINTERS;
    let h = hash22(vec2<f32>(f32(j) + 0.3, seed * 53.0));
    let ang = (f32(j) + 0.5 + (h.x - 0.5) * 0.9) * TAU / f32(SPLINTERS) + seed * 3.1
      + 0.012 * sin(r * 0.2 + h.y * 30.0);
    let len = core * mix(1.4, 4.5, h.y * h.y) * min(prog * 3.0, 1.0);
    let diff = wrapPi(th - ang);
    if (r < len && abs(diff) < 1.2) {
      let side = select(-1.0, 1.0, diff > 0.0);
      takeLine(g, r * abs(sin(diff)), 0.7 + 0.8 * (1.0 - r / len), dir(ang + PI * 0.5) * side);
    }
  }

  // Ring cracks: straight chords between neighbouring rays, so the rings
  // read as the polygonal web real glass makes. Each chord crossed outward
  // starts a new band of shards.
  let ja = sector;
  let jb = wrapRay(sector + 1);
  var band = 0;
  for (var rk = 0; rk < RINGS; rk = rk + 1) {
    if (!ringInSector(sector, rk, seed)) {
      continue;
    }
    let ra = ringRadius(ja, rk, seed, strength);
    let rb = ringRadius(jb, rk, seed, strength);
    let pa = c + dir(rayAngle(ja, seed, ra)) * ra;
    let pb = c + dir(rayAngle(jb, seed, rb)) * rb;
    var outward = vec2<f32>(-(pb - pa).y, (pb - pa).x);
    if (dot(outward, pa - c) < 0.0) {
      outward = -outward;
    }
    if (dot(q - pa, outward) > 0.0) {
      band = band + 1;
    }
    let shown = smoothstep(0.0, 0.25, prog * REACH * strength * 0.35 / max(ra, rb) - 1.0);
    if (shown > 0.0) {
      let s = segment(q, pa, pb);
      takeLine(g, s.x, 1.1 * shown, s.yz);
    }
  }

  let fade = smoothstep(min(front, 700.0), min(front, 700.0) * 0.6, r);
  let hs = hash22(vec2<f32>(f32(sector) * 5.0 + f32(band), seed * 23.0)) - 0.5;
  let near = 0.35 + 0.65 * exp(-r / 260.0);
  (*g).offset = (*g).offset + hs * 3.2 * strength * near * fade;
  let tilt = hash22(vec2<f32>(f32(band) + 9.1, f32(sector) + seed * 3.0)) - 0.5;
  (*g).shade = (*g).shade + dot(tilt, light) * 0.16 * fade;

  // Crushed centre: Voronoi cells in log-polar space, so the shards get
  // finer toward the point of impact.
  let cz = 1.0 - smoothstep(core * 0.45, core * 1.3, r);
  if (cz > 0.0) {
    let lr = log(max(r, 0.6) / core) * 3.2;
    let warp = vec2<f32>(
      0.35 * sin(rel * 37.0 + seed * 11.0) + 0.2 * sin(rel * 91.0),
      0.45 * sin(lr * 2.3 + seed * 5.0) + 0.25 * sin(lr * 5.1 + rel * 19.0)
    );
    let lp = vec2<f32>(lr, rel * CRUSH_CELLS) + warp;
    let cell = floor(lp);
    var f1 = 9.0;
    var f2 = 9.0;
    var id = vec2<f32>(0.0);
    for (var y = -1; y <= 1; y = y + 1) {
      for (var x = -1; x <= 1; x = x + 1) {
        let cid = cell + vec2<f32>(f32(x), f32(y));
        let key = vec2<f32>(cid.x, cid.y - CRUSH_CELLS * floor(cid.y / CRUSH_CELLS));
        let pt = cid + 0.15 + 0.7 * hash22(key + seed * 41.0);
        let dd = length(lp - pt);
        if (dd < f1) {
          f2 = f1;
          f1 = dd;
          id = key;
        } else if (dd < f2) {
          f2 = dd;
        }
      }
    }
    let cellPx = max(r, 0.6) * 0.3;
    let edgePx = (f2 - f1) * 0.5 * cellPx * u.resolution.w;
    let h = hash22(id + seed * 7.0);
    let drawn = select(0.35, 1.0, h.y > 0.3);
    (*g).dust = max((*g).dust, (1.0 - smoothstep(0.3, 1.3, edgePx)) * cz * drawn);
    (*g).crush = max((*g).crush, cz * h.x * h.x * 0.85);
    (*g).offset = (*g).offset + (h - 0.5) * 5.0 * cz;
    (*g).shade = (*g).shade + (h.y - 0.5) * 0.3 * cz;
  }
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let size = u.resolution.xy / u.resolution.w;
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * size;
  let count = i32(u.live.x + 0.5);
  let light = normalize(vec2<f32>(-0.45, -0.9) + (u.live.yz - 0.5) * vec2<f32>(1.8, -1.8));

  var g: Glass;
  g.edge = 1000.0;
  g.nrm = vec2<f32>(0.0, 1.0);
  g.offset = vec2<f32>(0.0);
  g.shade = 0.0;
  g.crush = 0.0;
  g.dust = 0.0;
  for (var i = 0; i < MAX_IMPACTS; i = i + 1) {
    if (i >= count) {
      break;
    }
    impact(&g, q, light, i);
  }

  let bevel = exp(-max(g.edge, 0.0) / 2.2);
  let offset = g.offset - g.nrm * bevel * 0.9;
  let t = clamp((q + offset) / size, vec2<f32>(0.001), vec2<f32>(0.999));
  var col = textureSampleLevel(tex, samp, t, 0.0).rgb;
  col = col * (1.0 + g.shade);

  let crushed = vec3<f32>(0.80, 0.83, 0.86);
  col = mix(col, crushed, g.crush * 0.6);
  col = mix(col, vec3<f32>(0.95), g.dust * 0.7);

  let facing = dot(g.nrm, light);
  let lit = clamp(facing, 0.0, 1.0);
  let dark = clamp(-facing, 0.0, 1.0);
  col = col + bevel * (lit * 0.22 - dark * 0.16);
  col = col + bevel * pow(lit, 6.0) * 0.45;

  let core = 1.0 - smoothstep(-0.6, 0.7, g.edge);
  col = mix(col, vec3<f32>(0.9, 0.92, 0.94), core * (0.55 + 0.35 * lit));

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
