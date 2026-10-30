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
   * `(x, y, ageSeconds, seed), (strength, deadPixels, 0, 0)` in logical px,
   * y-down.
   */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A shattered cover glass over a snapshot of the screen. Each impact jolts
 * the screen, flashes and throws glass dust, then races kinked radial cracks
 * with side branches out from a crushed centre and lets polygonal ring cracks
 * run between neighbouring rays. Every shard (sector between two rays x band
 * between two rings) refracts the content by its own offset with a chromatic
 * fringe at its edges, and crack segments facing the light glint as the phone
 * tilts. Some impacts also kill the panel underneath: a spreading ink blot
 * and a dead pixel column.
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
const RAYS: i32 = 17;
const SPLINTERS: i32 = 43;
const RINGS: i32 = 4;
const REACH: f32 = 980.0;     // longest radial crack, logical px
const SPEED: f32 = 3400.0;    // crack front speed, logical px per second
const CORE: f32 = 30.0;       // crushed centre radius, logical px
const RAY_SEG: f32 = 34.0;
const BRANCH_SEG: f32 = 22.0;
const DEBRIS: i32 = 22;

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
fn easeOut(x: f32) -> f32 {
  let t = clamp(x, 0.0, 1.0);
  return 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
}

// A crack is a polyline whose nodes sit at fixed steps along a base
// direction and are pushed sideways: a random kink per node plus a slow bend
// that is zero at the origin. Kinks are sharp, like real fracture paths.
struct Polyline {
  o: vec2<f32>,
  d: vec2<f32>,
  key: vec2<f32>,
  seg: f32,
  len: f32,
};

fn kink(p: Polyline, i: i32) -> f32 {
  if (i <= 0) {
    return 0.0;
  }
  let fi = f32(i);
  let h = hash21(vec2<f32>(fi * 1.37 + p.key.x, p.key.y * 17.0 + fi)) - 0.5;
  let ph = hash21(p.key + 3.1) * TAU;
  return h * p.seg * 0.42 + p.seg * 0.55 * (sin(fi * 0.27 + ph) - sin(ph));
}
fn node(p: Polyline, i: i32) -> vec2<f32> {
  let t = min(f32(i) * p.seg, p.len);
  return p.o + p.d * t + vec2<f32>(-p.d.y, p.d.x) * kink(p, i);
}
fn pointAt(p: Polyline, along: f32) -> vec2<f32> {
  let x = clamp(along, 0.0, p.len) / p.seg;
  let i = i32(floor(x));
  return mix(node(p, i), node(p, i + 1), fract(x));
}

struct Hit {
  dist: f32,
  side: f32,
  along: f32,
  nrm: vec2<f32>,
  segId: f32,
};

fn trace(q: vec2<f32>, p: Polyline) -> Hit {
  var h: Hit;
  h.dist = 1e5;
  h.side = 1.0;
  h.along = 0.0;
  h.nrm = vec2<f32>(0.0, 1.0);
  h.segId = 0.0;
  let last = i32(ceil(p.len / p.seg)) - 1;
  if (last < 0) {
    return h;
  }
  let k = clamp(i32(floor(dot(q - p.o, p.d) / p.seg)), 0, last);
  for (var s = k - 1; s <= k + 1; s = s + 1) {
    if (s < 0 || s > last) {
      continue;
    }
    let a = node(p, s);
    let b = node(p, s + 1);
    let ab = b - a;
    let t = clamp(dot(q - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
    let v = q - (a + ab * t);
    let l = length(v);
    if (l < h.dist) {
      let sn = normalize(vec2<f32>(-ab.y, ab.x));
      let sd = select(-1.0, 1.0, dot(q - a, sn) >= 0.0);
      h.dist = l;
      h.side = sd;
      h.along = (f32(s) + t) * p.seg;
      h.nrm = select(sn * sd, v / l, l > 0.001);
      h.segId = f32(s);
    }
  }
  return h;
}

struct Glass {
  edge: f32,          // distance to the nearest crack edge, device px
  nrm: vec2<f32>,     // that crack's normal, pointing at this pixel
  glint: f32,         // how strongly that crack segment catches the light
  tone: f32,          // how visible that crack segment is
  offset: vec2<f32>,  // refraction of the content, logical px
  shade: f32,         // per-shard sheen
  crush: f32,         // milky crushed-glass amount
  dust: f32,          // crushed shard borders
  sparkle: f32,       // crushed-cell and debris glitter
  ink: f32,           // dead LCD under the impact
  inkEdge: f32,
  stripe: vec3<f32>,  // dead pixel column colour
  flash: f32,
};

fn takeLine(g: ptr<function, Glass>, h: Hit, width: f32, grown: f32, light: vec2<f32>, salt: f32) {
  let reveal = clamp((grown - h.along) * u.resolution.w, 0.0, 1.0);
  if (reveal <= 0.0) {
    return;
  }
  let e = h.dist * u.resolution.w - width * 0.5 + (1.0 - reveal) * 2.0;
  if (e < (*g).edge) {
    (*g).edge = e;
    (*g).nrm = h.nrm;
    let facing = abs(dot(h.nrm, light));
    let lucky = hash21(vec2<f32>(h.segId, salt));
    (*g).glint = pow(facing, 10.0) * step(0.55, lucky);
    let wave = 0.5 + 0.5 * sin(h.along * 0.045 + lucky * 30.0);
    (*g).tone = mix(0.45, 1.0, hash21(vec2<f32>(h.segId + 0.5, salt + 1.0))) * mix(0.6, 1.0, wave);
  }
}

fn rayLine(c: vec2<f32>, j: i32, seed: f32, strength: f32) -> Polyline {
  let fj = f32(j);
  let h = hash22(vec2<f32>(fj, seed * 31.0));
  let ang = (fj + 0.5 + (h.x - 0.5) * 0.75) * TAU / f32(RAYS) + seed * TAU;
  var p: Polyline;
  p.o = c;
  p.d = dir(ang);
  p.key = vec2<f32>(fj * 7.3, seed * 91.0);
  p.seg = RAY_SEG;
  p.len = REACH * strength * mix(0.18, 1.0, h.y * h.y);
  return p;
}
fn raySpeed(j: i32, seed: f32) -> f32 {
  return SPEED * mix(0.65, 1.0, hash21(vec2<f32>(f32(j) + 0.7, seed * 13.0)));
}
fn branchLine(ray: Polyline, j: i32, b: i32, seed: f32) -> Polyline {
  let h = hash22(vec2<f32>(f32(j) * 3.0 + f32(b), seed * 17.0 + 4.0));
  let at = ray.len * mix(0.12, 0.62, h.x);
  let side = select(-1.0, 1.0, hash21(vec2<f32>(f32(j) + f32(b) * 5.0, seed)) > 0.5);
  let base = atan2(ray.d.y, ray.d.x);
  var p: Polyline;
  p.o = pointAt(ray, at);
  p.d = dir(base + side * mix(0.35, 0.95, h.y));
  p.key = vec2<f32>(f32(j) * 11.0 + f32(b) * 3.0, seed * 57.0);
  p.seg = BRANCH_SEG;
  p.len = ray.len * mix(0.12, 0.38, h.y) + 20.0;
  return p;
}
fn ringRadius(j: i32, k: i32, seed: f32, strength: f32) -> f32 {
  let fk = f32(k);
  let base = CORE * strength * (2.0 + fk * 1.7 + fk * fk * 0.55);
  return base * (0.84 + 0.32 * hash21(vec2<f32>(f32(j) + 0.5, fk + seed * 13.0)));
}
fn ringInSector(s: i32, k: i32, seed: f32) -> bool {
  return hash21(vec2<f32>(f32(s) * 3.0 + f32(k), seed * 7.0 + 2.0)) > 0.22 + f32(k) * 0.1;
}

fn segDist(q: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let ab = b - a;
  let t = clamp(dot(q - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
  return vec2<f32>(length(q - (a + ab * t)), t);
}

struct Cells {
  edge: f32,
  id: vec2<f32>,
};

fn voronoi(p: vec2<f32>, seed: f32) -> Cells {
  let cell = floor(p);
  var f1 = 9.0;
  var f2 = 9.0;
  var id = vec2<f32>(0.0);
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let cid = cell + vec2<f32>(f32(x), f32(y));
      let pt = cid + 0.1 + 0.8 * hash22(cid + seed * 41.0);
      let dd = length(p - pt);
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
        id = cid;
      } else if (dd < f2) {
        f2 = dd;
      }
    }
  }
  var out: Cells;
  out.edge = (f2 - f1) * 0.5;
  out.id = id;
  return out;
}

// Crushed centre: angular shards, finer toward the point of impact.
fn crushed(g: ptr<function, Glass>, d: vec2<f32>, r: f32, core: f32, seed: f32, light: vec2<f32>) {
  let cz = 1.0 - smoothstep(core * 0.6, core * 1.4, r);
  if (cz <= 0.0) {
    return;
  }
  let fineness = smoothstep(core * 0.35, core * 0.8, r);
  let cellPx = mix(3.2, 8.5, fineness);
  let v = voronoi(d / cellPx, seed + floor(fineness + 0.5) * 3.0);
  let edgePx = v.edge * cellPx * u.resolution.w;
  let h = hash22(v.id + seed * 7.0);
  let drawn = select(0.15, 0.75, h.y > 0.45);
  (*g).dust = max((*g).dust, (1.0 - smoothstep(0.3, 1.1, edgePx)) * cz * drawn);
  (*g).crush = max((*g).crush, cz * h.x * h.x);
  (*g).offset = (*g).offset + (h - 0.5) * 7.0 * cz;
  (*g).shade = (*g).shade + (h.y - 0.5) * 0.35 * cz;
  let facet = normalize(h - 0.5 + vec2<f32>(0.0001));
  (*g).sparkle = max((*g).sparkle, pow(max(dot(facet, light), 0.0), 24.0) * cz * step(0.5, h.x));
}

fn debris(g: ptr<function, Glass>, q: vec2<f32>, c: vec2<f32>, age: f32, seed: f32, strength: f32) {
  if (age > 0.7) {
    return;
  }
  for (var i = 0; i < DEBRIS; i = i + 1) {
    let h = hash22(vec2<f32>(f32(i) * 1.9, seed * 77.0));
    let v = mix(220.0, 900.0, h.y * h.y) * strength;
    let travel = v * (1.0 - exp(-age * 4.0)) / 4.0;
    let p = c + dir(h.x * TAU) * (travel + 6.0);
    let life = 1.0 - smoothstep(0.25, 0.7, age + h.y * 0.15);
    let d = (q - p) * u.resolution.w;
    let size = mix(1.6, 4.0, hash21(vec2<f32>(f32(i), seed)));
    let star = exp(-dot(d, d) / (size * size)) + 0.35 * exp(-abs(d.x) * 0.9 - abs(d.y) * 0.18 / size) * exp(-abs(d.y) * 0.25)
      + 0.35 * exp(-abs(d.y) * 0.9 - abs(d.x) * 0.18 / size) * exp(-abs(d.x) * 0.25);
    let twinkle = 0.6 + 0.4 * sin(age * 70.0 + h.x * 40.0);
    (*g).sparkle = max((*g).sparkle, star * life * twinkle);
  }
}

// Smooth random value around the circle with n knots, 0..1.
fn loopNoise(th: f32, n: f32, seed: f32) -> f32 {
  let x = fract(th / TAU + 1.0) * n;
  let i = floor(x);
  let f = x - i;
  let a = hash21(vec2<f32>(i, seed * 61.0));
  let b = hash21(vec2<f32>(i + 1.0 - n * step(n - 1.5, i), seed * 61.0));
  return mix(a, b, f * f * (3.0 - 2.0 * f));
}

fn deadPixels(g: ptr<function, Glass>, q: vec2<f32>, c: vec2<f32>, r: f32, th: f32, age: f32, seed: f32, strength: f32) {
  let spread = 1.0 - exp(-age * 1.8);
  let wobble = loopNoise(th, 5.0, seed) * 0.32 + loopNoise(th, 13.0, seed + 0.5) * 0.12 - 0.22;
  let radius = (9.0 + 34.0 * spread) * strength * (1.0 + wobble);
  let inside = 1.0 - smoothstep(radius - 2.5, radius + 0.5, r);
  (*g).ink = max((*g).ink, inside);
  (*g).inkEdge = max((*g).inkEdge, exp(-max(r - radius * 0.7, 0.0) / (6.0 + 10.0 * spread)) * (1.0 - inside));

  let col = hash21(vec2<f32>(seed * 3.0, 1.7));
  let x0 = c.x + (hash21(vec2<f32>(seed, 9.2)) - 0.5) * 30.0;
  let w = mix(1.0, 2.2, hash21(vec2<f32>(seed, 4.4)));
  let shown = smoothstep(0.15, 0.3, age);
  let line = (1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, abs(q.x - x0))) * shown;
  var tint = vec3<f32>(0.1, 1.0, 0.35);
  if (col > 0.66) {
    tint = vec3<f32>(0.85, 0.2, 1.0);
  } else if (col > 0.33) {
    tint = vec3<f32>(0.95, 0.97, 1.0);
  }
  (*g).stripe = max((*g).stripe, tint * line);
}

fn impact(g: ptr<function, Glass>, q: vec2<f32>, light: vec2<f32>, i: i32) {
  let a = u.liveData[i * 2];
  let b = u.liveData[i * 2 + 1];
  let c = a.xy;
  let age = a.z;
  let seed = a.w;
  let strength = b.x;
  if (age <= 0.0) {
    return;
  }

  let d = q - c;
  let r = length(d);
  let th = atan2(d.y, d.x);
  let rel = fract((th - seed * TAU) / TAU);
  let core = CORE * strength * (1.0 + 0.25 * sin(th * 3.0 + seed * 20.0) + 0.12 * sin(th * 7.0 + seed * 9.0));
  let front = age * SPEED;

  (*g).flash = (*g).flash + exp(-age / 0.04) * exp(-r / 120.0) + exp(-age / 0.025) * 0.1;
  debris(g, q, c, age, seed, strength);
  if (b.y > 0.5) {
    deadPixels(g, q, c, r, th, age, seed, strength);
  }

  // Radial cracks: the nearest three, each with two side branches.
  let k = i32(floor(rel * f32(RAYS)));
  var centreSide = 1.0;
  for (var jj = -1; jj <= 1; jj = jj + 1) {
    let j = wrapRay(k + jj);
    let ray = rayLine(c, j, seed, strength);
    let grown = age * raySpeed(j, seed);
    let h = trace(q, ray);
    let taper = 1.0 - clamp(h.along / ray.len, 0.0, 1.0);
    let w = (0.8 + 1.7 * taper * taper * taper) * mix(1.0, 1.6, smoothstep(core * 3.0, core, r));
    takeLine(g, h, w, grown, light, f32(j) + seed * 10.0);
    if (jj == 0) {
      centreSide = h.side;
    }

    for (var bi = 0; bi < 2; bi = bi + 1) {
      let br = branchLine(ray, j, bi, seed);
      let startAt = length(br.o - c);
      let bg = grown - startAt * 1.05;
      if (bg > 0.0 && length(q - br.o) < br.len + br.seg) {
        let hb = trace(q, br);
        let bt = 1.0 - clamp(hb.along / br.len, 0.0, 1.0);
        takeLine(g, hb, 0.75 + 1.1 * bt * bt, bg, light, f32(j * 2 + bi) + seed * 20.0);
      }
    }
  }
  let lower = select(wrapRay(k - 1), k, centreSide > 0.0);
  let upper = wrapRay(lower + 1);
  let sector = lower;

  // Ring cracks: kinked chords between neighbouring rays, so the rings read
  // as the polygonal web real glass makes. Each one crossed outward starts a
  // new band of shards.
  let rayA = rayLine(c, lower, seed, strength);
  let rayB = rayLine(c, upper, seed, strength);
  var band = 0;
  for (var rk = 0; rk < RINGS; rk = rk + 1) {
    if (!ringInSector(sector, rk, seed)) {
      continue;
    }
    let ra = ringRadius(lower, rk, seed, strength);
    let rb = ringRadius(upper, rk, seed, strength);
    if (ra > rayA.len || rb > rayB.len) {
      continue;
    }
    if (r > max(ra, rb) * 1.6) {
      band = band + 1;
      continue;
    }
    let pa = pointAt(rayA, ra);
    let pb = pointAt(rayB, rb);
    let mh = hash21(vec2<f32>(f32(sector) + f32(rk) * 7.0, seed * 5.0)) - 0.5;
    let pm = mix(pa, pb, 0.5 + mh * 0.3) + normalize(mix(pa, pb, 0.5) - c) * mh * length(pb - pa) * 0.22;
    let s1 = segDist(q, pa, pm);
    let s2 = segDist(q, pm, pb);
    let firstHalf = s1.x < s2.x;
    let e0 = select(pm, pa, firstHalf);
    let e1 = select(pb, pm, firstHalf);
    var outward = vec2<f32>(-(e1 - e0).y, (e1 - e0).x);
    if (dot(outward, e0 - c) < 0.0) {
      outward = -outward;
    }
    if (dot(q - e0, outward) > 0.0) {
      band = band + 1;
    }

    let startAt = max(ra / raySpeed(lower, seed), rb / raySpeed(upper, seed)) + 0.025 + f32(rk) * 0.022;
    let runPx = (age - startAt) * 1800.0;
    if (runPx > 0.0) {
      let l1 = length(pm - pa);
      let l2 = length(pb - pm);
      let fromA = hash21(vec2<f32>(f32(sector), f32(rk) + seed)) > 0.5;
      let pos = select(l1 + s2.y * l2, s1.y * l1, firstHalf);
      let along = select(l1 + l2 - pos, pos, fromA);
      var rh: Hit;
      rh.dist = min(s1.x, s2.x);
      rh.along = along;
      let sd = q - select(mix(pm, pb, s2.y), mix(pa, pm, s1.y), firstHalf);
      rh.nrm = select(normalize(outward), sd / max(rh.dist, 0.0001), rh.dist > 0.001);
      rh.segId = f32(rk) + select(0.5, 0.0, firstHalf);
      rh.side = 1.0;
      takeLine(g, rh, 1.0 + 0.5 * f32(RINGS - rk) / f32(RINGS), runPx, light, f32(sector) + seed * 30.0);
    }
  }

  let settled = smoothstep(0.0, 0.08, age - r / SPEED);
  let fade = smoothstep(min(REACH * strength, 800.0), 120.0, r) * settled;
  let hs = hash22(vec2<f32>(f32(sector) * 5.0 + f32(band), seed * 23.0)) - 0.5;
  let near = 0.3 + 0.7 * exp(-r / 240.0);
  (*g).offset = (*g).offset + hs * 3.6 * strength * near * fade;
  let tilt = hash22(vec2<f32>(f32(band) + 9.1, f32(sector) + seed * 3.0)) - 0.5;
  (*g).shade = (*g).shade + dot(tilt, light) * 0.18 * fade;

  let fk = i32(floor(fract((th - seed * 3.1) / TAU) * f32(SPLINTERS)));
  for (var jj = -1; jj <= 1 && r < core * 3.8; jj = jj + 1) {
    let j = ((fk + jj) % SPLINTERS + SPLINTERS) % SPLINTERS;
    let hh = hash22(vec2<f32>(f32(j) + 0.3, seed * 53.0));
    var sp: Polyline;
    sp.o = c;
    sp.d = dir((f32(j) + 0.5 + (hh.x - 0.5) * 0.9) * TAU / f32(SPLINTERS) + seed * 3.1);
    sp.key = vec2<f32>(f32(j) * 5.1 + 40.0, seed * 19.0);
    sp.seg = 9.0;
    sp.len = core * mix(1.1, 3.4, hh.y * hh.y);
    let hs2 = trace(q, sp);
    takeLine(g, hs2, 0.6 + 0.9 * (1.0 - hs2.along / sp.len), age * SPEED * 0.5, light, f32(j) + seed * 40.0);
  }

  crushed(g, d, r, core * min(1.0, 0.4 + age * 25.0), seed, light);
}

fn shake(age: f32, seed: f32, strength: f32) -> vec2<f32> {
  if (age <= 0.0 || age > 0.5) {
    return vec2<f32>(0.0);
  }
  let env = exp(-age * 11.0) * strength;
  let a = seed * TAU;
  return dir(a) * sin(age * 95.0) * 6.0 * env + dir(a + 1.7) * sin(age * 61.0 + 1.0) * 3.0 * env;
}

fn sampleRgb(q: vec2<f32>, size: vec2<f32>, offset: vec2<f32>, spread: vec2<f32>) -> vec3<f32> {
  let lo = vec2<f32>(0.001);
  let hi = vec2<f32>(0.999);
  let rr = textureSampleLevel(tex, samp, clamp((q + offset + spread) / size, lo, hi), 0.0).r;
  let gg = textureSampleLevel(tex, samp, clamp((q + offset) / size, lo, hi), 0.0).g;
  let bb = textureSampleLevel(tex, samp, clamp((q + offset - spread) / size, lo, hi), 0.0).b;
  return vec3<f32>(rr, gg, bb);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let size = u.resolution.xy / u.resolution.w;
  let count = i32(u.live.x + 0.5);
  let light = normalize(vec2<f32>(-0.45, -0.9) + (u.live.yz - 0.5) * vec2<f32>(2.2, -2.2));

  var jolt = vec2<f32>(0.0);
  for (var i = 0; i < MAX_IMPACTS; i = i + 1) {
    if (i >= count) {
      break;
    }
    jolt = jolt + shake(u.liveData[i * 2].z, u.liveData[i * 2].w, u.liveData[i * 2 + 1].x);
  }
  let q = vec2<f32>(uv.x, 1.0 - uv.y) * size + jolt;

  var g: Glass;
  g.edge = 1000.0;
  g.nrm = vec2<f32>(0.0, 1.0);
  g.glint = 0.0;
  g.tone = 1.0;
  g.offset = vec2<f32>(0.0);
  g.shade = 0.0;
  g.crush = 0.0;
  g.dust = 0.0;
  g.sparkle = 0.0;
  g.ink = 0.0;
  g.inkEdge = 0.0;
  g.stripe = vec3<f32>(0.0);
  g.flash = 0.0;
  for (var i = 0; i < MAX_IMPACTS; i = i + 1) {
    if (i >= count) {
      break;
    }
    impact(&g, q, light, i);
  }

  let bevel = exp(-max(g.edge, 0.0) / 2.4);
  let offset = g.offset - g.nrm * bevel * 1.1;
  let spread = g.nrm * bevel * 1.3 + g.offset * 0.25 + vec2<f32>(g.crush * 1.5, 0.0);
  var col = sampleRgb(q, size, offset, spread);

  let bleed = mix(vec3<f32>(0.05, 0.35, 0.3), vec3<f32>(0.35, 0.06, 0.45), g.inkEdge);
  let inkCol = mix(bleed, vec3<f32>(0.01, 0.008, 0.015), g.ink);
  col = col * (1.0 + g.shade);
  let milky = vec3<f32>(0.82, 0.85, 0.88);
  col = mix(col, milky, g.crush * 0.28);
  col = mix(col, inkCol, max(g.ink, g.inkEdge * 0.85));
  col = max(col, g.stripe);
  col = mix(col, vec3<f32>(0.96), g.dust * 0.75);

  let facing = dot(g.nrm, light);
  let lit = clamp(facing, 0.0, 1.0);
  let dark = clamp(-facing, 0.0, 1.0);
  col = col + bevel * (lit * 0.2 - dark * 0.22);

  let coreA = 1.0 - smoothstep(-0.55, 0.65, g.edge);
  let silver = mix(vec3<f32>(0.62, 0.66, 0.7), vec3<f32>(1.0), 0.45 + 0.55 * lit);
  col = mix(col, silver, coreA * g.tone * 0.92);
  col = col + vec3<f32>(1.0, 0.98, 0.95) * min(g.glint, 1.0) * (coreA + bevel * 0.3) * 0.6;

  col = col + vec3<f32>(1.0, 0.98, 0.94) * min(g.sparkle, 1.5);
  col = col + vec3<f32>(0.9, 0.95, 1.0) * min(g.flash, 1.2);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
