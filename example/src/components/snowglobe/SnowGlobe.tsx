import type { ViewProps } from 'react-native';
import { ShaderView, type ParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /**
   * `[centerX, centerY, radius, baseHeight, 0, 0, 0, 0]`. The centre is in
   * screen uv (y-up); `radius` is a fraction of the screen HEIGHT and
   * `baseHeight` is measured in globe radii, so the whole object keeps its
   * proportions on any display.
   */
  params: number[];
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * A snow globe you shake.
 *
 * One opaque full-screen pass draws the whole object: the wooden plinth, the
 * glass sphere, the little scene glued to its floor (two firs and a lit
 * house), the snow that has settled, and the snow in the air.
 *
 * The two frames of reference are the point of the effect. The scene is fixed
 * in GLOBE space — the trees turn with the phone, because they are glued to
 * the base. The snow lives in GRAVITY space: `tilt` rotates the frame the
 * flakes fall along and the frame the settled pile levels itself in, so
 * tipping the phone makes the snow fall sideways and the drift slide to
 * whatever is downhill in the real world.
 *
 * Airborne snow is three layers of a cell grid rather than a particle loop:
 * each cell is one flake, displaced by a swirl that is smooth in time and
 * constant per cell, and gathered over the 3x3 neighbourhood so nothing pops
 * at a cell boundary. Density fades cells in by comparing their own hash to
 * `airborne`, so a shake lifts snow into the air without any flake appearing
 * out of nowhere.
 */
export default function SnowGlobe({
  params,
  paramsSynchronizable,
  ...viewProps
}: Props) {
  return (
    <ShaderView
      fragmentShader={SNOW_GLOBE_SHADER}
      params={params}
      paramsSynchronizable={paramsSynchronizable}
      {...viewProps}
    />
  );
}

const SNOW_GLOBE_SHADER = /* wgsl */ `
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

/** Axis-aligned box, signed. Positive outside. */
fn sdBox(p: vec2<f32>, b: vec2<f32>) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
}

/**
 * A triangle standing on its base: q is relative to the base centre, w
 * the base half-width, h the height. Positive outside.
 */
fn triField(q: vec2<f32>, w: f32, h: f32) -> f32 {
  let t = clamp(q.y / h, 0.0, 1.0);
  let ww = w * (1.0 - t * 0.94);
  return max(abs(q.x) - ww, max(-q.y, q.y - h));
}

/**
 * One depth layer of airborne snow, in the gravity frame.
 *
 * The grid is laid out in ORIGIN space (al - fallPhase * spd), so a cell id
 * names the same flake for its whole fall and the sideways swirl can be a
 * smooth function of time without ever moving a flake between cells. Every
 * cell's own hash decides when it fades in as dens rises, its jitter inside
 * the cell, and its size. One fall speed for the whole layer: a per-flake
 * speed would grow without bound against fallPhase and tear the gather.
 */
fn flakeLayer(
  ax: f32, al: f32, cs: f32, spd: f32, r0: f32, seed: f32,
  fallPhase: f32, swirlPhase: f32, stir: f32, dens: f32, surf: f32
) -> f32 {
  let ph = fallPhase * spd;
  let o = vec2<f32>(ax, al - ph) / cs;
  let cell = floor(o);
  // Kept under one cell so the 3x3 gather below is always enough.
  let amp = clamp(stir, 0.0, 1.0) * 0.34 * cs;
  var acc = 0.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let cid = cell + vec2<f32>(f32(i), f32(j));
      let h1 = hash21(cid + vec2<f32>(seed, seed * 0.7 + 4.3));
      // Cells fade in as the density passes their own hash — snow lifts into
      // the air instead of popping into it.
      let vis = smoothstep(h1, h1 - 0.22, dens);
      if (vis > 0.003) {
        let h2 = hash21(cid + vec2<f32>(seed + 37.7, seed * 1.3 + 11.1));
        let h3 = hash21(cid + vec2<f32>(seed + 91.3, seed * 0.4 + 63.9));
        let k = h1 * 6.28318;
        var c = (cid + vec2<f32>(0.15 + 0.70 * h2, 0.15 + 0.70 * h3)) * cs;
        c = c + vec2<f32>(sin(swirlPhase * 1.70 + k * 3.0),
                          cos(swirlPhase * 1.23 + k * 2.1)) * amp;
        // A settled globe still breathes: a slow sway even at stir 0.
        c = c + vec2<f32>(sin(swirlPhase * 0.45 + k) * cs * 0.085, 0.0);
        let d = vec2<f32>(ax - c.x, al - (c.y + ph));
        let rr = r0 * (0.62 + 0.76 * h2);
        // Super-gaussian: a flat-ish core with a quick soft edge reads as an
        // opaque speck of snow, where a plain gaussian reads as bokeh.
        let q2 = dot(d, d) / (rr * rr);
        let g = exp(-q2 * q2 * 1.55);
        // Flakes land: they fade out as they reach the settled surface.
        let land = smoothstep(surf + 0.035, surf - 0.055, c.y + ph);
        acc = acc + g * vis * land;
      }
    }
  }
  return acc;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let ctr = u.params0.xy;
  let rad = max(u.params0.z, 0.001);
  let baseH = max(u.params0.w, 0.05);

  // Globe space: origin at the sphere's centre, ONE unit = its radius.
  let p = vec2<f32>((uv.x - ctr.x) * aspect, uv.y - ctr.y) / rad;
  let r = length(p);
  // One pixel, in globe units — every edge below is antialiased with it.
  let e = 1.5 / (u.resolution.y * rad);

  let tilt = u.live.x;
  let stir = clamp(u.live.y, 0.0, 1.0);
  let air = clamp(u.live.z, 0.0, 1.0);
  let pile = clamp(u.live.w, 0.0, 1.0);
  let fallPhase = u.liveData[0].x;
  let swirlPhase = u.liveData[0].y;
  let surfTilt = u.liveData[0].z;
  let wobble = clamp(u.liveData[0].w, 0.0, 1.0);

  // ---- The room the globe stands in. ----
  var col = vec3<f32>(0.042, 0.045, 0.056);
  col = col + vec3<f32>(0.10, 0.13, 0.21) * exp(-max(r - 1.0, 0.0) * 2.3) * 0.42;
  // The plinth throws a soft shadow on the shelf.
  let shy = -0.72 - baseH;
  let shd = exp(-pow((uv.y - ctr.y) / rad - shy, 2.0) * 34.0)
          * exp(-pow(p.x / 1.35, 2.0) * 2.0);
  col = col * (1.0 - shd * 0.55);

  // ---- Inside the sphere. ----
  let gm = 1.0 - smoothstep(-e, e, r - 1.0);
  if (gm > 0.001) {
    // Glass magnifies the middle and pinches the rim.
    let rr = min(r, 1.0);
    let sp = p * (0.86 + 0.14 * rr * rr * rr);

    // Sky: night blue, lighter toward the floor where the snow bounces light.
    var sc = mix(vec3<f32>(0.055, 0.085, 0.175),
                 vec3<f32>(0.135, 0.205, 0.335),
                 smoothstep(0.85, -0.75, sp.y));
    sc = sc + vec3<f32>(0.16, 0.18, 0.26)
       * exp(-dot(sp - vec2<f32>(0.30, 0.62), sp - vec2<f32>(0.30, 0.62)) * 2.4) * 0.5;

    // ---- The scene glued to the floor: it turns with the phone. ----
    let floorY = -0.64;

    // A little house, roof to the right.
    let hp = sp - vec2<f32>(0.30, floorY);
    let bodyD = sdBox(hp - vec2<f32>(0.0, 0.048), vec2<f32>(0.105, 0.143));
    let bodyM = 1.0 - smoothstep(-e, e, bodyD);
    sc = mix(sc, mix(vec3<f32>(0.230, 0.175, 0.150),
                     vec3<f32>(0.130, 0.098, 0.088),
                     clamp(-hp.x * 3.0 + 0.5, 0.0, 1.0)), bodyM);
    // Snow on the roof, with the eaves overhanging the walls.
    let roofD = triField(hp - vec2<f32>(0.0, 0.190), 0.150, 0.100);
    let roofM = 1.0 - smoothstep(-e, e, roofD);
    sc = mix(sc, vec3<f32>(0.90, 0.93, 0.99), roofM);
    // A warm window, and the light it spills on the snow.
    let winD = sdBox(hp - vec2<f32>(0.0, 0.088), vec2<f32>(0.034, 0.030));
    let winM = 1.0 - smoothstep(-e, e, winD);
    sc = mix(sc, vec3<f32>(1.00, 0.84, 0.52), winM);
    let wl = hp - vec2<f32>(0.0, 0.088);
    sc = sc + vec3<f32>(1.00, 0.68, 0.30) * exp(-dot(wl, wl) * 20.0) * 0.40;

    // Two firs. Each is three tiers with snow caught on the branch edges.
    for (var t = 0; t < 2; t = t + 1) {
      let tx = select(-0.10, -0.44, t == 0);
      let th = select(0.38, 0.56, t == 0);
      let tw = select(0.125, 0.165, t == 0);
      let q = sp - vec2<f32>(tx, floorY);
      // Trunk.
      let trD = sdBox(q - vec2<f32>(0.0, 0.035), vec2<f32>(0.017, 0.045));
      sc = mix(sc, vec3<f32>(0.105, 0.075, 0.055), 1.0 - smoothstep(-e, e, trD));
      for (var k = 0; k < 3; k = k + 1) {
        let fk = f32(k);
        let by = 0.065 + fk * th * 0.250;
        let tierD = triField(q - vec2<f32>(0.0, by),
                             tw * (1.0 - fk * 0.20), th * 0.52);
        let tierM = 1.0 - smoothstep(-e, e, tierD);
        sc = mix(sc, mix(vec3<f32>(0.055, 0.135, 0.100),
                         vec3<f32>(0.085, 0.190, 0.135),
                         clamp(q.x * 1.6 + 0.5, 0.0, 1.0)), tierM);
        // Snow sitting on the skirt of the tier.
        let snowM = tierM * (1.0 - smoothstep(0.0, 0.035, q.y - by));
        sc = mix(sc, vec3<f32>(0.90, 0.94, 1.00), snowM * 0.85);
      }
    }

    // ---- Settled snow, in the gravity frame. ----
    // dn is downhill, ac runs across it; the pile fills everything past
    // surf measured along dn, so it always lies against real gravity.
    let dn = vec2<f32>(sin(tilt), -cos(tilt));
    let ac = vec2<f32>(-dn.y, dn.x);
    let al = dot(sp, dn);
    let ax = dot(sp, ac);

    let thick = 0.160 + 0.041 * pile;
    let bumps = (vnoise(vec2<f32>(ax * 2.30 + 13.0, 2.0)) - 0.5)
              + (vnoise(vec2<f32>(ax * 6.10 + 41.0, 5.0)) - 0.5) * 0.45;
    // Snow is not a liquid: it holds a slope instead of levelling off. The
    // surface follows gravity only up to the angle of repose (~34 degrees),
    // saturating smoothly past it, so a hard tilt gives a snowbank rather
    // than a waterline. The excess is taken back out in the gravity frame.
    let repose = 0.60;
    let overSteep = tilt - repose * tanh(tilt / repose);
    let surf = 1.0 - 2.0 * thick
             + bumps * 0.075
             + surfTilt * ax
             + overSteep * ax
             + wobble * 0.045 * sin(ax * 5.5 + swirlPhase * 1.6);
    let pm = smoothstep(surf - 0.012, surf + 0.012, al);
    let depth = max(al - surf, 0.0);
    var snowCol = mix(vec3<f32>(0.955, 0.975, 1.000),
                      vec3<f32>(0.560, 0.640, 0.790),
                      smoothstep(0.0, 0.40, depth));
    // A bright crest right at the surface, and a dry sparkle in it.
    snowCol = snowCol + vec3<f32>(0.18, 0.20, 0.24)
            * exp(-pow(depth / 0.034, 2.0)) * 0.42;
    let spk = pow(hash21(floor(sp * 250.0)), 34.0);
    snowCol = snowCol + vec3<f32>(0.9, 0.95, 1.0) * spk * 0.30;
    sc = mix(sc, snowCol, pm);

    // ---- Airborne snow: three depth layers, near ones bigger and faster. ----
    let dens = mix(0.028, 0.700, air);
    let f0 = flakeLayer(ax, al, 0.100, 0.72, 0.0058, 3.10,
                        fallPhase, swirlPhase, stir, dens, surf);
    let f1 = flakeLayer(ax, al, 0.145, 1.00, 0.0084, 17.90,
                        fallPhase, swirlPhase, stir, dens, surf);
    let f2 = flakeLayer(ax, al, 0.215, 1.42, 0.0116, 51.30,
                        fallPhase, swirlPhase, stir, dens, surf);
    let flakeA = clamp(f0 * 0.38, 0.0, 1.0)
               + clamp(f1 * 0.60, 0.0, 1.0)
               + clamp(f2 * 0.88, 0.0, 1.0);
    sc = mix(sc, vec3<f32>(0.960, 0.975, 1.000), clamp(flakeA, 0.0, 1.0));

    // ---- The glass itself. ----
    let rim = smoothstep(0.84, 1.0, rr);
    sc = sc * (1.0 - rim * 0.30);
    sc = mix(sc, vec3<f32>(0.42, 0.52, 0.70), rim * 0.20);
    let ring = exp(-pow((rr - 0.980) / 0.020, 2.0));
    sc = sc + vec3<f32>(0.70, 0.82, 1.00) * ring * 0.38;
    let g1 = (p - vec2<f32>(-0.40, 0.52)) * vec2<f32>(1.0, 1.7);
    sc = sc + vec3<f32>(1.0, 1.0, 1.0) * exp(-dot(g1, g1) / 0.070) * 0.30;
    let g2 = p - vec2<f32>(0.48, -0.30);
    sc = sc + vec3<f32>(0.80, 0.88, 1.00) * exp(-dot(g2, g2) / 0.022) * 0.12;

    col = mix(col, sc, gm);
  }

  // ---- The plinth, drawn last so it seats the sphere. ----
  let lipTop = -0.72;
  let lipD = sdBox(p - vec2<f32>(0.0, lipTop - 0.042), vec2<f32>(0.745, 0.042));
  let lipM = 1.0 - smoothstep(-e, e, lipD);
  let bodyTop = lipTop - 0.078;
  let ty = clamp((bodyTop - p.y) / baseH, 0.0, 1.0);
  let hw = mix(0.605, 0.815, pow(ty, 0.70));
  let dBody = max(abs(p.x) - hw,
                  max(p.y - bodyTop, (bodyTop - baseH) - p.y));
  let bodyM = 1.0 - smoothstep(-e, e, dBody);

  // Walnut: a vertical gradient, a little grain, a highlight down the middle.
  let grain = vnoise(vec2<f32>(p.x * 3.0, p.y * 26.0)) * 0.5
            + vnoise(vec2<f32>(p.x * 9.0, p.y * 60.0)) * 0.5;
  var wood = mix(vec3<f32>(0.235, 0.140, 0.088),
                 vec3<f32>(0.115, 0.066, 0.042), ty);
  wood = wood * (0.86 + 0.28 * grain);
  wood = wood + vec3<f32>(0.30, 0.20, 0.13) * exp(-pow(p.x / 0.42, 2.0)) * 0.18;
  var lip = mix(vec3<f32>(0.320, 0.196, 0.124),
                vec3<f32>(0.170, 0.100, 0.062),
                smoothstep(lipTop, lipTop - 0.085, p.y));
  // The globe's own light catches the top edge of the lip.
  lip = lip + vec3<f32>(0.40, 0.44, 0.52)
      * (1.0 - smoothstep(0.0, 0.022, lipTop - p.y)) * 0.55;
  col = mix(col, wood, bodyM * (1.0 - lipM));
  col = mix(col, lip, lipM);

  // ---- Room vignette, then dither so the dark background does not band. ----
  let vc = uv - vec2<f32>(0.5, 0.5);
  col = col * (1.0 - dot(vc, vc) * 0.55);
  let dth = (hash21(uv * u.resolution.xy) - 0.5) * (2.0 / 255.0);
  return vec4<f32>(clamp(col + vec3<f32>(dth), vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
