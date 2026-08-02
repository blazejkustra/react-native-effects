import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from 'react-native';
import { ShaderView, useParamsSynchronizable } from 'react-native-effects';

type Props = ViewProps & {
  /** True when the banner has been expanded to full screen. */
  expanded?: boolean;
};

/** Press-in ramp time constant (seconds) — the dent forms fast but not snapped. */
const TAU_PRESS = 0.055;
/** Release relax time constant (seconds) — the sand settles back over ~2s. */
const TAU_RELEASE = 0.42;
/** Wind-heal time constant (seconds) for drawn grooves — visible for ~15s. */
const TAU_HEAL = 5.0;
/** Max trail points — must match the shader's liveData loop bound. */
const MAX_TRAIL = 96;
/** Once the trail is this full, the oldest points fast-fade to free slots —
 * writing past the buffer melts the stroke tail away instead of popping it. */
const SOFT_CAP = MAX_TRAIL - 8;
/** Min finger travel (pt) before a new trail point is stamped. */
const TRAIL_SPACING = 16;
/** EMA factor for finger smoothing — stamps follow a rounded, steadied path
 * rather than the raw jittery touch samples. */
const SMOOTHING = 0.45;

/** Live channel: header (x, y, press, 0) + MAX_TRAIL × (x, y, strength, brk). */
const LIVE_SIZE = 4 + MAX_TRAIL * 4;
const INITIAL_LIVE = [0.5, 0.5, ...new Array(LIVE_SIZE - 2).fill(0)];

/** `brk` is 1 on the first stamp of a stroke — the shader draws no segment
 * across the gap between separate strokes. */
type TrailPoint = { x: number; y: number; s: number; brk: number };

/**
 * Wind-rippled desert sand in warm, low sun. Three layers: a dune-scale tonal
 * sweep (broad fbm shading + a diagonal light gradient), a field of
 * parallel-but-wavy ripple ridges with an asymmetric profile (long soft bright
 * windward slope, sharp shadowed lee just past each crest, irregular spacing
 * and patchy amplitude), and pixel-scale granular micro-noise with sparse
 * individual grains catching the sun as very slow twinkling glints. The
 * surface is essentially still — only the glints breathe.
 *
 * When expanded, the sand is a writing surface: dragging a finger engraves a
 * beach-writing trench — deep pooled shadow inside, chunky crumb piles pushed
 * onto the rims — while the surrounding field stays perfectly still. The wind
 * heals the writing over ~15s.
 */
export default function SandMaterial({
  expanded = false,
  style,
  onLayout,
  ...rest
}: Props) {
  // params0.x — ripple-frequency scale so ripple spacing reads naturally both
  // in the 122pt banner and fullscreen. Character is otherwise identical.
  const params = useMemo(() => [expanded ? 2.6 : 1.0], [expanded]);

  // Live channel: header (x, y, press, 0) then up to 32 trail points as
  // (x, y, strength, brk) vec4s — x/y normalized 0..1 with y already flipped
  // to shader space (y-up); press/strength eased on the JS side.
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable(INITIAL_LIVE);

  // All interaction state lives in refs — two instances (banner + overlay)
  // can be mounted at once and must not share anything.
  const sizeRef = useRef({ width: 0, height: 0 });
  const posRef = useRef({ x: 0.5, y: 0.5 });
  const strengthRef = useRef(0);
  const targetRef = useRef(0);
  const trailRef = useRef<TrailPoint[]>([]);
  /** Last stamped trail position in view points, for spacing new stamps. */
  const lastStampRef = useRef<{ x: number; y: number } | null>(null);
  /** EMA-smoothed finger position in view points. */
  const smoothRef = useRef({ x: 0, y: 0 });
  const liveArrRef = useRef<number[]>(new Array(LIVE_SIZE).fill(0));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  const pushLive = useCallback(() => {
    const arr = liveArrRef.current;
    arr[0] = posRef.current.x;
    arr[1] = posRef.current.y;
    arr[2] = strengthRef.current;
    arr[3] = 0;
    const trail = trailRef.current;
    for (let i = 0; i < MAX_TRAIL; i++) {
      const base = 4 + i * 4;
      const pnt = trail[i];
      arr[base] = pnt ? pnt.x : 0;
      arr[base + 1] = pnt ? pnt.y : 0;
      arr[base + 2] = pnt ? pnt.s : 0;
      arr[base + 3] = pnt ? pnt.brk : 0;
    }
    setParamsSynchronizable(...arr);
  }, [setParamsSynchronizable]);

  const step = useCallback(
    function tick(now: number) {
      const dt = Math.min(Math.max(now - lastTsRef.current, 0) / 1000, 0.1);
      lastTsRef.current = now;

      // Press dent: ease toward the target with press/release time constants.
      const target = targetRef.current;
      const tau = target > strengthRef.current ? TAU_PRESS : TAU_RELEASE;
      const k = 1 - Math.exp(-dt / tau);
      let s = strengthRef.current + (target - strengthRef.current) * k;
      if (Math.abs(s - target) < 0.004) {
        s = target;
      }
      strengthRef.current = s;

      // Wind-heal the trail. Points are in stamp order and decay at one rate,
      // so the weakest are always at the front.
      const trail = trailRef.current;
      const heal = Math.exp(-dt / TAU_HEAL);
      for (const pnt of trail) {
        pnt.s *= heal;
      }
      // Near capacity, fast-fade the oldest points so long writing melts away
      // at the tail instead of popping when the ring buffer overflows.
      const over = trail.length - SOFT_CAP;
      if (over > 0) {
        const fast = Math.exp(-dt * 5);
        for (let i = 0; i < over + 6 && i < trail.length; i++) {
          trail[i]!.s *= fast;
        }
      }
      while (trail.length > 0 && trail[0]!.s < 0.02) {
        trail.shift();
      }

      pushLive();

      if (s !== target || trail.length > 0) {
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

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  // If the overlay collapses mid-interaction we may never get a touch-end —
  // drop the trail and relax the dent so no instance can stick pressed.
  useEffect(() => {
    if (!expanded) {
      const dirty = targetRef.current !== 0 || trailRef.current.length > 0;
      trailRef.current = [];
      lastStampRef.current = null;
      targetRef.current = 0;
      if (dirty) {
        kick();
      }
    }
  }, [expanded, kick]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      sizeRef.current = {
        width: e.nativeEvent.layout.width,
        height: e.nativeEvent.layout.height,
      };
      onLayout?.(e);
    },
    [onLayout]
  );

  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const { width, height } = sizeRef.current;
      if (width > 0 && height > 0) {
        posRef.current = {
          x: Math.min(1, Math.max(0, locationX / width)),
          // nativeEvent is y-down in points; shader uv is y-up — flip.
          y: Math.min(1, Math.max(0, 1 - locationY / height)),
        };
        // Smooth the finger path so stamps trace a rounded, steadied curve
        // instead of the raw jittery touch samples.
        const last = lastStampRef.current;
        const sm = smoothRef.current;
        if (!last) {
          sm.x = locationX;
          sm.y = locationY;
        } else {
          sm.x += (locationX - sm.x) * SMOOTHING;
          sm.y += (locationY - sm.y) * SMOOTHING;
        }
        // Stamp a trail point once the finger has traveled far enough — the
        // stamps chain into capsule segments forming a continuous trench.
        const dx = last ? sm.x - last.x : 0;
        const dy = last ? sm.y - last.y : 0;
        if (!last || dx * dx + dy * dy >= TRAIL_SPACING * TRAIL_SPACING) {
          lastStampRef.current = { x: sm.x, y: sm.y };
          const trail = trailRef.current;
          trail.push({
            x: Math.min(1, Math.max(0, sm.x / width)),
            y: Math.min(1, Math.max(0, 1 - sm.y / height)),
            s: 1,
            brk: last ? 0 : 1,
          });
          if (trail.length > MAX_TRAIL) {
            trail.shift();
          }
        }
      }
      targetRef.current = 1;
      // Write immediately so a drag tracks the finger even while the strength
      // loop is idle at full press.
      pushLive();
      kick();
    },
    [kick, pushLive]
  );

  const handleRelease = useCallback(() => {
    targetRef.current = 0;
    lastStampRef.current = null;
    kick();
  }, [kick]);

  // CRITICAL: in banner mode the parent Pressable owns the tap and the list
  // must scroll — touch handlers only exist when expanded.
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
        fragmentShader={SAND_SHADER}
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const SAND_SHADER = /* wgsl */ `
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

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  // Aspect-corrected field coords; pt-scale coords for grain-size detail so
  // grains stay grain-sized at every view size.
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let px = uv * u.resolution.xy / max(u.resolution.w, 1.0);
  let sc = max(u.params0.x, 0.5);

  // ---- Touch: a subtle finger-sized shade under the fingertip. It must NOT
  // displace anything — the field stays perfectly still while writing.
  let press = u.live.z;
  let tp = vec2<f32>(u.live.x * aspect, u.live.y);
  let td = p - tp;
  let dent = press * exp(-dot(td, td) * 170.0);

  // ---- Drawn trail — beach-writing engraving. The distance to the stroke
  // polyline (capsule segments; .w==1 starts a new stroke, never bridged)
  // drives a narrow finger trench: deep shadow pooled inside (heaviest under
  // the wall that faces away from the low sun, with a lit sliver where the
  // sun-facing wall catches light) and chunky crumb piles pushed out onto
  // both rims. Healing (strength → 0) narrows the trench and fades its
  // contrast, as if the wind were filling it back in.
  var dMin = 1e9;
  var sNear = 0.0;
  var offNear = vec2<f32>(0.0, 0.0);
  for (var i = 0; i < 96; i = i + 1) {
    let pa4 = u.liveData[i];
    if (pa4.z < 0.004) { continue; }
    var pb4 = pa4;
    if (i < 95) {
      let nxt = u.liveData[i + 1];
      if (nxt.z >= 0.004 && nxt.w < 0.5) { pb4 = nxt; }
    }
    let segA = vec2<f32>(pa4.x * aspect, pa4.y);
    let segB = vec2<f32>(pb4.x * aspect, pb4.y);
    let pa = p - segA;
    let ba = segB - segA;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    let off = pa - ba * h;
    let d2 = dot(off, off);
    if (d2 < dMin) {
      dMin = d2;
      sNear = mix(pa4.z, pb4.z, h);
      offNear = off;
    }
  }
  let dSt = sqrt(dMin);
  // Ragged hand-cut edge: fine, high-frequency wobble — coarse noise at
  // stroke-width scale would read blocky, not sandy.
  let rag = (vnoise(p * 26.0) - 0.5) * 0.006
          + (vnoise(p * 74.0) - 0.5) * 0.003;
  let dr = dSt + rag;
  let cs = smoothstep(0.02, 0.35, sNear);       // contrast fades as it heals
  let w0 = 0.021 * (0.35 + 0.65 * sNear);       // trench half-width, narrows
  let inTrench = (1.0 - smoothstep(w0 * 0.7, w0 * 1.05, dr)) * cs;
  // Which side of the cut this fragment is on, relative to the sun. The sign
  // decides whether the cut reads carved-in or piled-on: the shadow must sit
  // on the side nearest the light for the brain to read an indent.
  let sideRaw = clamp(
    dot(offNear, vec2<f32>(-0.537, 0.844)) / max(dSt, 1e-4), -1.0, 1.0);
  // The whole interior sits in deep shadow — a narrow cut swallows the light,
  // with only a mild lean toward the wall nearest the sun and a whisper of
  // light where the sun-facing wall meets its rim.
  let shadowW = inTrench * (0.82 - 0.18 * clamp(sideRaw * 1.5, -1.0, 1.0));
  let litW = inTrench * clamp(sideRaw, 0.0, 1.0)
           * smoothstep(w0 * 0.55, w0 * 0.95, dr);
  // Crumb berms: a clumpy ring of displaced sand just outside the rim.
  let bermBand = smoothstep(w0 * 0.85, w0 * 1.15, dr)
               * (1.0 - smoothstep(w0 * 1.25, w0 * 2.3, dr)) * cs;
  let clump = smoothstep(0.30, 0.72, vnoise(px * 0.055));
  let clump2 = vnoise(px * 0.075 + vec2<f32>(7.7, 3.1));
  let berm = bermBand * (0.25 + 1.05 * clump);

  // ---- Layer 1: dune-scale tonal sweep -------------------------------------
  // Broad, uneven shading so the field is never flat, plus a soft diagonal
  // light gradient from a low sun high-left.
  let dune = vnoise(p * 0.75 + vec2<f32>(2.0, 6.5)) * 0.65
           + vnoise(p * 1.9 + vec2<f32>(8.0, 3.0)) * 0.35;
  let sweep = uv.x * -0.22 + uv.y * 0.26 + (dune - 0.5) * 0.60;
  let sh = clamp(0.5 + sweep, 0.0, 1.0);
  var col = mix(vec3<f32>(0.494, 0.386, 0.272),
                vec3<f32>(0.792, 0.652, 0.446), sh);
  // Faint warm/cool patchiness — real sand is never one temperature.
  col = col + vec3<f32>(0.030, 0.010, -0.020) * (dune - 0.5);

  // ---- Layer 2: wind ripples -----------------------------------------------
  // One low-frequency warp field bends the ridge lines; a slower patch field
  // drifts the ripple spacing (as a bounded phase offset, so the frequency
  // never runs away or reverses) and varies amplitude across the surface.
  // NOTHING interactive displaces the ripples — a cut interrupts them instead.
  let warp = fbm(p * (2.0 * sc) + vec2<f32>(7.3, 1.7));
  let pfield = vnoise(p * (1.3 * sc) + vec2<f32>(11.0, 4.0));
  let ampl = 0.55 + 0.45 * smoothstep(0.22, 0.78, pfield);

  let axis = p.x * 0.20 + p.y * 0.98;
  let phase = axis * 13.0 * sc + (pfield - 0.5) * 3.0 + (warp - 0.5) * 3.4;
  let s = fract(phase);
  // Asymmetric, wrap-continuous profile: a long windward rise from the trough
  // to a wobbling crest, a fast lee collapse, and a cool shadow band hugging
  // the lee face that relaxes back into the trough before the cycle repeats.
  let crest = 0.62 + (warp - 0.5) * 0.10;
  let upSlope = smoothstep(0.02, crest, s);
  let downLee = 1.0 - smoothstep(crest, crest + 0.14, s);
  let ridge = upSlope * downLee;
  let leeShadow = smoothstep(crest + 0.01, crest + 0.07, s)
                * (1.0 - smoothstep(crest + 0.14, 0.98, s));
  var rip = (ridge * 0.62 - 0.20 - leeShadow * 0.55) * ampl;

  // A fainter secondary ripple set at a slightly different angle and pitch —
  // interference where the primary set fades out.
  let ampl2 = 0.35 + 0.65 * (1.0 - smoothstep(0.22, 0.78, pfield));
  let s2 = fract((p.x * 0.09 + p.y * 0.996) * 29.0 * sc
                 + (warp - 0.5) * 2.1 + 5.0);
  let rip2 = smoothstep(0.05, 0.62, s2) - smoothstep(0.62, 0.74, s2) - 0.42;
  rip = rip + rip2 * 0.28 * ampl2;

  // The cut interrupts the ripples: inside the trench they're destroyed and
  // replaced by faintly rough disturbed sand; under the crumb berms they're
  // half-buried. The surrounding ripple field stays exactly on course — the
  // clean interruption is what sells the engraving.
  let floorRough = (vnoise(px * 0.35) - 0.5) * 0.20
                 + (vnoise(px * 0.12) - 0.5) * 0.12;
  rip = mix(rip, floorRough, inTrench);
  rip = mix(rip, floorRough * 0.5, bermBand * 0.6);

  col = col * (1.0 + rip * 0.50);
  // Lit slopes go golden, shadowed lee faces cool off slightly.
  col = col + vec3<f32>(0.055, 0.030, 0.004) * max(rip, 0.0);
  col = col + vec3<f32>(-0.012, -0.006, 0.014) * max(-rip, 0.0);

  // The fingertip shade — soft, small, and gone ~2s after release.
  col = col * (1.0 - dent * 0.10);

  // Engraved trench: deep pooled shadow (slightly cool), a warm lit sliver on
  // the sun-facing wall, bright chunky crumbs on the rims with their own
  // little self-shadows between the clumps.
  col = col * (1.0 - shadowW * 0.44);
  col = col + vec3<f32>(-0.012, -0.006, 0.012) * shadowW;
  col = col + vec3<f32>(0.030, 0.022, 0.012) * litW;
  col = col + vec3<f32>(0.135, 0.105, 0.062) * berm;
  col = col - col * bermBand * smoothstep(0.65, 0.25, clump2) * 0.16;

  // ---- Layer 3: grain + sparse defects + slow glints -----------------------
  // Per-grain brightness jitter (two scales, sized in points not uv).
  let g1 = hash21(floor(px * 0.9));
  let g2 = vnoise(px * 0.33);
  col = col * (1.0 + (g1 - 0.5) * 0.09 + (g2 - 0.5) * 0.09);

  // Rare darker flecks — tiny pebbles / organic bits, deliberately sparse.
  let fcell = floor(px * 0.22);
  let frnd = hash21(fcell + vec2<f32>(31.0, 17.0));
  let fuv = fract(px * 0.22) - 0.5;
  let fleck = step(0.992, frnd) * smoothstep(0.16, 0.02, dot(fuv, fuv));
  col = mix(col, col * 0.62, fleck);

  // Sparse specular glints: individual grains catching the sun, twinkling
  // very slowly and mostly living on the lit windward slopes and fresh crumb
  // piles. Sand inside the trench sits in shade and stops glinting.
  let gcell = floor(px * 0.62);
  let gr = hash21(gcell + vec2<f32>(5.0, 43.0));
  let gsel = step(0.9962, gr);
  let tw = 0.5 + 0.5 * sin(t * 0.45 + gr * 6283.0);
  let twk = smoothstep(0.55, 0.95, tw);
  let guv = fract(px * 0.62) - 0.5;
  let gshape = smoothstep(0.20, 0.02, dot(guv, guv));
  let sun = clamp(0.35 + rip * 1.3 + berm * 0.9, 0.0, 1.0)
          * (1.0 - dent * 0.7) * (1.0 - inTrench * 0.7);
  let glint = gsel * twk * gshape * sun;
  col = col + vec3<f32>(1.0, 0.93, 0.80) * glint * 0.75;
  col = mix(col, vec3<f32>(1.0, 0.98, 0.92), glint * 0.30);

  // ---- Finish --------------------------------------------------------------
  // Pull gently toward luma so the ochre stays warm, not neon.
  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(luma), col, 0.88);

  // Soft vignette seats the field in its frame.
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.30);

  // Fine dither kills banding on the smooth slopes.
  let dith = hash21(uv * u.resolution.xy) - 0.5;
  col = col + dith * (1.5 / 255.0);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
