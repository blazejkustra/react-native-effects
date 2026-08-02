import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { ShaderView, useParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /** True when the banner has been expanded to full screen. */
  expanded?: boolean;
};

/** Max beads on the panel — must match the shader's loop bound. */
const MAX_DROPS = 12;
/** Radius (in panel heights) a bead spawns at, and how big it may swell. */
const R_SPAWN = 0.011;
const R_MAX = 0.036;
/** Reference radius: beads this size run at roughly full speed. */
const R_CRIT = 0.026;
/** How fast the bead under a held finger grows (radius per second). */
const GROW_RATE = 0.03;
/** Gravity, viscous drag, and how much water a running bead leaves behind. */
const GRAVITY = 0.9;
const DRAG = 3.0;
const SHED = 0.03;
/** Min finger travel (pt) before a drag flicks another bead onto the panel. */
const DROP_SPACING = 26;
/** How long a wet track takes to dry (s). */
const DRY_TAU = 7.5;

/** Live channel: unused header + MAX_DROPS × 2 vec4s (bead, then its track). */
const LIVE_SIZE = 4 + MAX_DROPS * 8;
const INITIAL_LIVE = new Array(LIVE_SIZE).fill(0);

type Drop = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  /** Where the bead broke loose — the top of its wet track. */
  tx: number;
  ty: number;
  /** Width of that track, set from the radius it ran at. */
  tw: number;
  /** Track wetness, 1 while running and drying once it stops. */
  wet: number;
  running: boolean;
  seed: number;
};

/**
 * A sheet of brushed stainless steel with water on it.
 *
 * Layers:
 *  1. Base field — the room reflected in the sheet: a dark floor band, a
 *     mid-grey wall, a bright softbox strip up near the ceiling. A mirror
 *     surface has almost no colour of its own, so this reflection is the
 *     material; everything else just disturbs it.
 *  2. Mid structure — low-contrast smudge blotches (handling marks, uneven
 *     passivation) that also bend the reflection so no band is ever straight.
 *  3. Micro detail — dense horizontal brushing (quantised rows about 1.2pt
 *     apart plus a finer continuous grain) that scatters the reflection
 *     vertically, sparse deeper score lines, and an anisotropic sheen band.
 *
 * Interaction (expanded only): touch the panel and water lands on it. Hold
 * still and the bead under your finger swells until surface tension gives
 * way; then it breaks loose and runs, wandering as it goes, swallowing any
 * bead it catches — which makes it heavier and faster — and shedding water
 * behind it as a wet track until it is too small to keep going and pins
 * again. Dragging flicks a line of beads across the sheet. Each bead is a
 * lens: it carries a squeezed, upside-down image of the room, a hard
 * softbox glint and a dark grazing rim. The wet tracks fill the brushing, so
 * the steel under them turns into a sharper, darker mirror until they dry.
 *
 * On a device the accelerometer sets which way is down, so tilting the panel
 * steers the beads and laying it flat stops them. Each bead occupies two
 * liveData vec4s: (x, y, radius, speed) and (trackX, trackY, wetness,
 * trackWidth), all y-up. Touch handlers are attached ONLY when `expanded` so
 * the banner card never steals the parent Pressable's tap or list scroll.
 */
export default function MetalMaterial({
  expanded = false,
  style,
  onLayout,
  ...rest
}: Props) {
  const params = useMemo(() => [expanded ? 1 : 0], [expanded]);

  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(INITIAL_LIVE);

  // All per-instance mutable state lives in refs — two instances (banner +
  // fullscreen overlay) can be mounted at once without cross-talk.
  const sizeRef = useRef({ width: 1, height: 1 });
  const dropsRef = useRef<Drop[]>([]);
  const fingerRef = useRef({ x: 0.5, y: 0.5, down: false });
  const lastFlickRef = useRef<{ x: number; y: number } | null>(null);
  // Screen-space gravity, y-up. Straight down until the accelerometer says
  // otherwise (it never does on the simulator).
  const gravRef = useRef({ x: 0, y: -1 });
  const liveArrRef = useRef<number[]>(new Array(LIVE_SIZE).fill(0));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  const pushLive = useCallback(() => {
    const arr = liveArrRef.current;
    const drops = dropsRef.current;
    for (let i = 0; i < MAX_DROPS; i++) {
      const base = 4 + i * 8;
      const d = drops[i];
      arr[base] = d ? d.x : 0;
      arr[base + 1] = d ? d.y : 0;
      arr[base + 2] = d ? d.r : 0;
      arr[base + 3] = d ? Math.hypot(d.vx, d.vy) : 0;
      arr[base + 4] = d ? d.tx : 0;
      arr[base + 5] = d ? d.ty : 0;
      arr[base + 6] = d ? d.wet : 0;
      arr[base + 7] = d ? d.tw : 0;
    }
    setParamsSynchronizable(...arr);
  }, [setParamsSynchronizable]);

  const step = useCallback(
    function tick(now: number) {
      const dt = Math.min(Math.max(now - lastTsRef.current, 0) / 1000, 0.05);
      lastTsRef.current = now;
      const drops = dropsRef.current;
      const grav = gravRef.current;
      const aspect =
        sizeRef.current.width / Math.max(sizeRef.current.height, 1);

      // Water keeps arriving under a held finger, pooling into whichever bead
      // is already there. That bead is the only one held still — everything
      // else on the panel is on its way down.
      const finger = fingerRef.current;
      let host: Drop | null = null;
      if (finger.down) {
        let bestD = 0.05;
        for (const d of drops) {
          if (d.r <= 0) {
            continue;
          }
          const dx = (d.x - finger.x) * aspect;
          const dy = d.y - finger.y;
          const dist = Math.hypot(dx, dy);
          if (dist < bestD) {
            bestD = dist;
            host = d;
          }
        }
        if (host) {
          host.r = Math.min(host.r + GROW_RATE * dt, R_MAX);
        } else if (drops.length < MAX_DROPS) {
          drops.push({
            x: finger.x,
            y: finger.y,
            r: R_SPAWN,
            vx: 0,
            vy: 0,
            tx: finger.x,
            ty: finger.y,
            tw: 0,
            wet: 0,
            running: false,
            seed: Math.random(),
          });
        }
      }

      for (const d of drops) {
        if (d.r <= 0) {
          d.wet *= Math.exp(-dt / DRY_TAU);
          continue;
        }
        if (d === host) {
          // Pinned under the finger while it swells — the one moment of
          // surface tension in the whole thing.
          d.vx = 0;
          d.vy = 0;
          d.tx = d.x;
          d.ty = d.y;
          d.tw = d.r;
          continue;
        }
        if (!d.running) {
          // Off it goes. Nothing stays on a vertical panel.
          d.running = true;
          d.tx = d.x;
          d.ty = d.y;
          d.tw = d.r;
          d.wet = 1;
        }

        // Heavier beads pull away harder and run faster; the smallest still
        // creep, so the panel always clears itself in the end.
        const pull = GRAVITY * Math.min(Math.max(d.r / R_CRIT, 0.5), 2.5);
        d.vx += grav.x * pull * dt;
        d.vy += grav.y * pull * dt;
        // Real runs wander: the bead keeps catching on the brushing.
        d.vx += Math.sin(d.y * 47 + d.seed * 31) * 0.09 * dt;
        const damp = Math.exp(-DRAG * dt);
        d.vx *= damp;
        d.vy *= damp;
        const dx = d.vx * dt;
        const dy = d.vy * dt;
        d.x += dx;
        d.y += dy;
        // Water is left behind as track, so the bead thins as it runs — by
        // distance travelled, and in proportion to how much it is carrying,
        // so a small one keeps going rather than evaporating mid-panel.
        d.r = Math.max(
          0,
          d.r - SHED * Math.hypot(dx, dy) * Math.min(d.r / R_CRIT, 1.5)
        );
        d.wet = 1;
        if (d.y < -0.04 || d.x < -0.1 || d.x > 1.1) {
          // Ran off the panel; only its track is left to dry.
          d.r = 0;
          d.running = false;
        }
      }

      // A running bead swallows anything it catches, which makes it heavier
      // and faster — that cascade is most of the fun.
      for (let i = 0; i < drops.length; i++) {
        const a = drops[i]!;
        if (a.r <= 0) {
          continue;
        }
        for (let j = i + 1; j < drops.length; j++) {
          const b = drops[j]!;
          if (b.r <= 0) {
            continue;
          }
          const dx = (a.x - b.x) * aspect;
          const dy = a.y - b.y;
          if (Math.hypot(dx, dy) > (a.r + b.r) * 0.85) {
            continue;
          }
          const big = a.r >= b.r ? a : b;
          const small = a.r >= b.r ? b : a;
          // Volume adds; on a flat panel that reads as areas adding.
          const merged = Math.sqrt(big.r * big.r + small.r * small.r);
          const w = (small.r * small.r) / (merged * merged);
          big.x += (small.x - big.x) * w;
          big.y += (small.y - big.y) * w;
          big.vx += (small.vx - big.vx) * w;
          big.vy += (small.vy - big.vy) * w;
          big.r = Math.min(merged, R_MAX);
          // The absorbed bead is gone, but its track stays until it dries.
          small.r = 0;
          small.running = false;
        }
      }

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]!;
        if (d.r <= 0 && d.wet < 0.02) {
          drops.splice(i, 1);
        }
      }

      pushLive();

      if (drops.length > 0 || finger.down) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    },
    [pushLive]
  );

  const kick = useCallback(() => {
    if (rafRef.current === null) {
      lastTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  // Which way is down. Passive — no gesture, so it never competes with the
  // touches, and it simply stays "down" wherever there is no sensor.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const ok = await Accelerometer.isAvailableAsync();
        if (!ok || cancelled) {
          return;
        }
        Accelerometer.setUpdateInterval(60);
        sub = Accelerometer.addListener(({ x, y }) => {
          // Portrait upright reads y ≈ -1, which is already "down" in the
          // shader's y-up space; lying flat reads ~0 and the beads stall.
          gravRef.current = {
            x: Math.min(1, Math.max(-1, x)),
            y: Math.min(1, Math.max(-1, y)),
          };
        });
      } catch {
        // No accelerometer (simulator / module not linked) — plain gravity.
      }
    })();
    return () => {
      cancelled = true;
      if (sub) {
        sub.remove();
      }
    };
  }, []);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      sizeRef.current = {
        width: Math.max(width, 1),
        height: Math.max(height, 1),
      };
      onLayout?.(e);
    },
    [onLayout]
  );

  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = sizeRef.current;
      fingerRef.current = {
        x: Math.min(1, Math.max(0, locationX / width)),
        // nativeEvent is y-down in points; shader uv is y-up — flip.
        y: Math.min(1, Math.max(0, 1 - locationY / height)),
        down: true,
      };
      // Dragging flicks beads along the path rather than pooling one.
      const last = lastFlickRef.current;
      const far =
        !last ||
        (locationX - last.x) ** 2 + (locationY - last.y) ** 2 >=
          DROP_SPACING * DROP_SPACING;
      if (far) {
        lastFlickRef.current = { x: locationX, y: locationY };
        const drops = dropsRef.current;
        if (last && drops.length < MAX_DROPS) {
          drops.push({
            x: fingerRef.current.x,
            y: fingerRef.current.y,
            r: R_SPAWN * (0.8 + Math.random() * 0.9),
            vx: 0,
            vy: 0,
            tx: fingerRef.current.x,
            ty: fingerRef.current.y,
            tw: 0,
            wet: 0,
            running: false,
            seed: Math.random(),
          });
        }
      }
      kick();
    },
    [kick]
  );

  const handleRelease = useCallback(() => {
    fingerRef.current.down = false;
    lastFlickRef.current = null;
    kick();
  }, [kick]);

  // Collapsing wipes the panel dry so the banner is always clean.
  useEffect(() => {
    if (!expanded) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      dropsRef.current = [];
      fingerRef.current.down = false;
      lastFlickRef.current = null;
      pushLive();
    }
  }, [expanded, pushLive]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  // CRITICAL: in banner mode the parent Pressable owns the tap and the list
  // must scroll — attach touch handlers only when expanded.
  const touchProps = expanded
    ? {
        onTouchStart: handleTouch,
        onTouchMove: handleTouch,
        onTouchEnd: handleRelease,
        onTouchCancel: handleRelease,
      }
    : null;

  return (
    <View style={style} onLayout={handleLayout} {...rest} {...touchProps}>
      <ShaderView
        fragmentShader={METAL_SHADER}
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        isStatic={!expanded}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const METAL_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,  // (width_px, height_px, aspect, pixelRatio)
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,  // x: 1.0 when expanded to full screen
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,  // per bead: (x,y,r,speed), (tx,ty,wet,tw)
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

// The room, as the sheet sees it: a dark floor low down, a mid wall, a bright
// softbox strip near the ceiling and a dim ceiling above it. Sampled by
// reflected height, which is the only thing a flat mirror needs.
fn roomRefl(ry: f32) -> vec3<f32> {
  var c = mix(vec3<f32>(0.250, 0.260, 0.282),
              vec3<f32>(0.505, 0.520, 0.545),
              smoothstep(0.02, 0.62, ry));
  // Softbox: the bright horizontal strip that makes steel look like steel.
  let sb = ry - 0.80;
  c = c + vec3<f32>(0.290, 0.300, 0.320) * exp(-sb * sb * 40.0);
  // Dark skirting where wall meets floor.
  let sk = ry - 0.20;
  c = c - vec3<f32>(0.130, 0.132, 0.128) * exp(-sk * sk * 90.0);
  // Cool ceiling wash above the softbox.
  c = c + vec3<f32>(0.050, 0.058, 0.075) * smoothstep(0.86, 1.10, ry);
  return c;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  let big = clamp(u.params0.x, 0.0, 1.0);
  // Physical coords (height = 1 unit) for the water.
  let p = vec2<f32>(uv.x * aspect, uv.y);
  // Point-space coords: brushing keeps its physical grain at any size.
  let pt = uv * u.resolution.xy / max(u.resolution.w, 1.0);
  let ac = vec2<f32>(uv.x * aspect, uv.y);

  // ---- Wet tracks ---------------------------------------------------------
  // Where a bead has run, water has filled the brushing grooves: the surface
  // stops scattering and turns into a sharper, slightly darker mirror. This
  // has to be known before the reflection is sampled.
  var wetAcc = 0.0;
  var rimAcc = 0.0;
  let ragged = (vnoise(p * 90.0) - 0.5) * 0.0035;
  for (var i = 0; i < 12; i = i + 1) {
    let trk = u.liveData[i * 2 + 1];
    if (trk.z < 0.01) { continue; }
    let bead = u.liveData[i * 2];
    let segA = vec2<f32>(trk.x * aspect, trk.y);
    let segB = vec2<f32>(bead.x * aspect, bead.y);
    let pa = p - segA;
    let ba = segB - segA;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    let off = pa - ba * h;
    let dTrk = length(off) + ragged;
    // The track is widest where the bead broke loose and fattest, and tapers
    // toward the bead as it sheds its way down.
    let wTrk = max(trk.w, 0.008) * mix(0.78, 0.45, h);
    wetAcc = wetAcc
           + (1.0 - smoothstep(wTrk * 0.55, wTrk * 1.15, dTrk)) * trk.z;
    // The film is thickest at its edge, where it stands up in a meniscus and
    // catches a hairline of light — that is the tell that it is wet and not
    // just a shadow.
    rimAcc = rimAcc
           + (1.0 - smoothstep(wTrk * 0.90, wTrk * 1.30, dTrk))
           * smoothstep(wTrk * 0.50, wTrk * 0.95, dTrk) * trk.z;
  }
  let wet = clamp(wetAcc, 0.0, 1.0);

  // ---- Layer 2: smudge blotches (also the warp field) --------------------
  let smudge = fbm(ac * mix(1.7, 3.4, big) + vec2<f32>(17.0, 9.0));
  let warp = smudge - 0.5;

  // ---- Layer 3: brushing --------------------------------------------------
  // Crisp per-line intensity: rows ~1.2pt tall, each with its own value that
  // drifts slowly along x so no line is uniform end to end.
  let rowA = floor(pt.y * 0.8);
  let nA = vnoise(vec2<f32>(pt.x * 0.010, rowA * 7.31));
  // Finer continuous anisotropic grain woven between the rows.
  let nB = vnoise(vec2<f32>(pt.x * 0.045 + 91.0, pt.y * 1.6));

  // ---- Layer 1: the reflected room ---------------------------------------
  // Brushing scatters the reflection vertically — that vertical smear is the
  // whole anisotropic look — and water fills the grooves and stops it.
  let scatter = 1.0 - wet * 0.80;
  let jitter = ((nA - 0.5) * 0.075 + (nB - 0.5) * 0.040) * scatter
             + warp * 0.12;
  // Full screen the sheet reflects the room floor to ceiling; the short
  // banner only catches a slice of the wall, so it never blows out to white
  // under the caption.
  let ryBase = mix(0.26 + uv.y * 0.42, uv.y * 1.05 - 0.02, big);
  var col = roomRefl(ryBase + jitter);
  col = col * (1.0 + warp * 0.085);

  let brush = ((nA - 0.5) * 0.075 + (nB - 0.5) * 0.045) * scatter;
  col = col * (1.0 + brush * 1.25);
  // Wet steel is darker and glassier than dry steel, and the film's edge
  // stands up as a bright hairline.
  col = col * (1.0 - wet * 0.055);
  col = col + vec3<f32>(0.88, 0.92, 1.0) * clamp(rimAcc, 0.0, 1.0) * 0.05;

  // Sparse deeper score lines: ~2.5% of 2.4pt rows, running only part of the
  // width, with a thin dark groove and a hairline catch-light beside it.
  let sy = pt.y * 0.42;
  let srow = floor(sy);
  let fy = fract(sy) - 0.5;
  let rnd = hash21(vec2<f32>(srow, 7.7));
  let scoreOn = step(0.975, rnd);
  let reach = smoothstep(0.35, 0.60,
                         vnoise(vec2<f32>(pt.x * 0.008, srow * 3.9)));
  let scoreAmt = scoreOn * reach * (0.05 + (rnd - 0.975) * 3.2);
  col = col * (1.0 - exp(-fy * fy * 26.0) * scoreAmt);
  let lip = fy - 0.20;
  col = col + vec3<f32>(1.0) * exp(-lip * lip * 60.0) * scoreOn * reach * 0.030;

  // ---- Specular: broad anisotropic band along the brushing ---------------
  // Wide, soft, silvery; its centre drifts imperceptibly and the smudge field
  // keeps it from ever being a straight stripe. Water tightens it.
  let sheenY = 0.60 + sin(t * 0.035) * 0.045 + warp * 0.10;
  let sd = uv.y - sheenY + (uv.x - 0.5) * 0.05;
  let band = exp(-sd * sd * mix(22.0, 60.0, wet));
  let sAmp = 0.150 + 0.030 * sin(t * 0.021 + 1.7);
  let sAlong = 0.82 + 0.18 * vnoise(vec2<f32>(uv.x * 2.0 + t * 0.010, 3.7));
  let sheen = band * sAmp * sAlong * (1.0 + (nA - 0.5) * 1.5 * scatter);
  col = col + vec3<f32>(0.90, 0.93, 0.99) * sheen;
  col = mix(col, vec3<f32>(1.0), sheen * 0.22);

  // ---- The beads ----------------------------------------------------------
  // Each one is a little plano-convex lens sitting on a mirror: it shows a
  // squeezed, upside-down slice of the room, goes dark where the surface
  // turns away at the rim, and throws one hard glint back from the softbox.
  for (var i = 0; i < 12; i = i + 1) {
    let bead = u.liveData[i * 2];
    let r = bead.z;
    if (r < 0.004) { continue; }
    let ctr = vec2<f32>(bead.x * aspect, bead.y);
    var rel = p - ctr;
    if (dot(rel, rel) > r * r * 3.2) { continue; }

    // A running bead stretches into a teardrop along its path.
    let trk = u.liveData[i * 2 + 1];
    let run = vec2<f32>((bead.x - trk.x) * aspect, bead.y - trk.y);
    let runLen = length(run);
    let spd = clamp(bead.w, 0.0, 1.0);
    if (spd > 0.02 && runLen > 1e-4) {
      let dir = run / runLen;
      let along = dot(rel, dir);
      let across = rel - dir * along;
      rel = dir * (along / (1.0 + spd * 0.5)) + across;
    }

    let q = rel / r;
    let d2 = dot(q, q);
    let dd = sqrt(d2);
    // Flattened cap: a bead on steel is a dome, not a ball.
    let nz = sqrt(max(1.0 - min(d2, 1.0), 0.0));
    let nrm = normalize(vec3<f32>(q.x * 0.80, q.y * 0.80, nz * 0.55 + 0.30));

    // The lens: the room, inverted and compressed into the bead.
    var wcol = roomRefl(ryBase - nrm.y * 0.62 + warp * 0.05);
    wcol = wcol * vec3<f32>(0.95, 0.975, 1.0);
    // Grazing rim goes dark, with a bright edge where it catches the light…
    wcol = wcol * (1.0 - smoothstep(0.62, 1.0, dd) * 0.38);
    wcol = wcol + vec3<f32>(0.86, 0.91, 1.0)
         * smoothstep(0.86, 0.995, dd) * 0.34;
    // …and light that came through the dome piles up in a bright crescent
    // along its lower inside wall. Water, not a ball bearing.
    wcol = wcol + vec3<f32>(1.0, 0.99, 0.96)
         * smoothstep(0.45, 0.94, dd) * step(0.0, -q.y) * 0.22;
    // Softbox glint, high on the bead.
    let hv = normalize(vec3<f32>(-0.30, 0.58, 0.76));
    wcol = wcol + vec3<f32>(1.0, 1.0, 0.99)
         * pow(clamp(dot(nrm, hv), 0.0, 1.0), 80.0) * 1.5;

    let edge = 1.5 / u.resolution.y / max(r, 0.004);
    let cov = smoothstep(1.0, 1.0 - edge - 0.02, dd);
    // Light bent through the bead lands just outside it as a bright crescent,
    // and the bead's own shadow sits opposite.
    let ring = exp(-(dd - 1.10) * (dd - 1.10) * 90.0) * (1.0 - cov);
    col = col + vec3<f32>(1.0, 0.99, 0.95) * ring * 0.16 * step(0.0, -q.y);
    col = col * (1.0 - smoothstep(1.30, 1.0, dd) * (1.0 - cov) * 0.16);
    col = mix(col, wcol, cov);
  }

  // ---- Frame + finish -----------------------------------------------------
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.24);
  col = col + (hash21(uv * u.resolution.xy) - 0.5) * (1.5 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
