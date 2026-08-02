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

/** Ball radius as a fraction of view height, per context. */
const BALL_R_EXPANDED = 0.035;
const BALL_R_BANNER = 0.12;
/** Where the ball rests in the static banner (clear of the title text). */
const BANNER_BALL_X = 0.8;
const BANNER_BALL_Y = 0.5;

/** Spring pulling the ball toward the finger (per s²) and its damping (per s). */
const SPRING_K = 160;
const SPRING_C = 13;
/** Rolling friction after release (per s) and wall-bounce energy retention. */
const FRICTION = 2.4;
const RESTITUTION = 0.45;

/**
 * Woven linen, natural undyed, with a glossy chromed-steel ball resting on
 * it. Perpendicular warp/weft threads with per-thread width and brightness
 * irregularity, occasional slubs, an over/under checker so the weave has
 * depth, heathered patch-to-patch tint, large soft cloth-fold shading, and a
 * faint fuzz veil. The ball mirrors the linen in its lower half, presses a
 * shallow dent into the weave, and pools a soft contact shadow beneath it.
 *
 * In the banner it renders once via isStatic (zero ongoing GPU cost) with the
 * ball parked on the right. When expanded, dragging pulls the ball toward the
 * finger through a damped spring so it trails with real weight; on release it
 * rolls on with momentum, slowed by friction and bouncing softly off the
 * edges. The whole simulation is a JS-side rAF loop feeding `u.live` — no
 * React re-renders per frame — and the loop stops itself once the ball rests.
 */
export default function FabricMaterial({
  expanded = false,
  style,
  ...rest
}: Props) {
  // params0.x — weft threads per view height (feature scale per context)
  // params0.y — micro fiber-detail amplitude (kept lower in the small banner
  //             so the fine striations don't alias into noise)
  // params0.z — ball radius as a fraction of view height
  const params = useMemo(
    () => [
      expanded ? 120 : 48,
      expanded ? 1.0 : 0.55,
      expanded ? BALL_R_EXPANDED : BALL_R_BANNER,
    ],
    [expanded]
  );

  // Live ball channel: (x, y, 0, 0) — normalized 0..1, y-up like shader uv.
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([BANNER_BALL_X, BANNER_BALL_Y, 0, 0]);

  const sizeRef = useRef({ width: 0, height: 0 });
  const posRef = useRef({ x: 0.5, y: 0.5 });
  const velRef = useRef({ x: 0, y: 0 });
  const fingerRef = useRef({ x: 0.5, y: 0.5 });
  const touchingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef(0);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = { width, height };
  }, []);

  const step = useCallback(() => {
    const now = Date.now();
    const dt = Math.min((now - lastTRef.current) / 1000, 1 / 30);
    lastTRef.current = now;

    const pos = posRef.current;
    const vel = velRef.current;

    if (touchingRef.current) {
      const finger = fingerRef.current;
      vel.x += (SPRING_K * (finger.x - pos.x) - SPRING_C * vel.x) * dt;
      vel.y += (SPRING_K * (finger.y - pos.y) - SPRING_C * vel.y) * dt;
    } else {
      const decay = Math.exp(-FRICTION * dt);
      vel.x *= decay;
      vel.y *= decay;
    }
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    // Keep the ball on the cloth: its radius is a fraction of height, so the
    // x margin shrinks by the aspect ratio. Walls give a soft bounce.
    const { width, height } = sizeRef.current;
    const aspect = width > 0 && height > 0 ? width / height : 0.5;
    const mx = BALL_R_EXPANDED / aspect;
    const my = BALL_R_EXPANDED;
    if (pos.x < mx) {
      pos.x = mx;
      vel.x = Math.abs(vel.x) * RESTITUTION;
    } else if (pos.x > 1 - mx) {
      pos.x = 1 - mx;
      vel.x = -Math.abs(vel.x) * RESTITUTION;
    }
    if (pos.y < my) {
      pos.y = my;
      vel.y = Math.abs(vel.y) * RESTITUTION;
    } else if (pos.y > 1 - my) {
      pos.y = 1 - my;
      vel.y = -Math.abs(vel.y) * RESTITUTION;
    }

    setParamsSynchronizable(pos.x, pos.y, 0, 0);

    const speed = Math.hypot(vel.x, vel.y);
    if (!touchingRef.current && speed < 0.002) {
      vel.x = 0;
      vel.y = 0;
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  }, [setParamsSynchronizable]);

  const ensureLoop = useCallback(() => {
    if (rafRef.current === null) {
      lastTRef.current = Date.now();
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  const onTouch = useCallback(
    (e: GestureResponderEvent) => {
      const { width, height } = sizeRef.current;
      if (width <= 0 || height <= 0) {
        return;
      }
      const { locationX, locationY } = e.nativeEvent;
      fingerRef.current = {
        x: Math.min(1, Math.max(0, locationX / width)),
        // nativeEvent is points y-down; the shader uv is y-up.
        y: Math.min(1, Math.max(0, 1 - locationY / height)),
      };
      touchingRef.current = true;
      ensureLoop();
    },
    [ensureLoop]
  );

  const onRelease = useCallback(() => {
    // The loop keeps running on the ball's momentum and stops itself.
    touchingRef.current = false;
  }, []);

  // Entering fullscreen: drop the ball at center, at rest. Leaving: stop the
  // simulation and park the ball back at its banner spot.
  useEffect(() => {
    if (expanded) {
      posRef.current = { x: 0.5, y: 0.5 };
      velRef.current = { x: 0, y: 0 };
      touchingRef.current = false;
      setParamsSynchronizable(0.5, 0.5, 0, 0);
    } else {
      stopLoop();
      touchingRef.current = false;
      setParamsSynchronizable(BANNER_BALL_X, BANNER_BALL_Y, 0, 0);
    }
    return stopLoop;
  }, [expanded, stopLoop, setParamsSynchronizable]);

  // In the banner the parent Pressable owns the tap and the list must
  // scroll — touch handlers are attached ONLY when expanded.
  const touchHandlers = expanded
    ? {
        onTouchStart: onTouch,
        onTouchMove: onTouch,
        onTouchEnd: onRelease,
        onTouchCancel: onRelease,
      }
    : {};

  return (
    <View
      style={[styles.base, style]}
      onLayout={onLayout}
      {...touchHandlers}
      {...rest}
    >
      <ShaderView
        fragmentShader={FABRIC_SHADER}
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        isStatic={!expanded}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const FABRIC_SHADER = /* wgsl */ `
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
  let uv = ndc * 0.5 + 0.5;
  let aspect = u.resolution.z;
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let threadF = max(u.params0.x, 8.0);
  let microAmt = clamp(u.params0.y, 0.0, 1.0);

  // ---- Ball geometry + weight dent --------------------------------------
  // u.live = (x, y) ball center, normalized 0..1 y-up; params0.z its radius
  // as a fraction of view height. The ball's weight presses a shallow dent
  // into the cloth: the weave is drawn slightly toward the contact point.
  let ballR = max(u.params0.z, 0.02);
  let ballP = vec2<f32>(u.live.x * aspect, u.live.y);
  let bvec = p - ballP;
  let bdist = length(bvec);
  // Wide funnel: the heavy ball sinks the stretched cloth over a radius of
  // several ball-widths, pulling the weave toward the contact point.
  let dent = exp(-dot(bvec, bvec) / (ballR * ballR * 12.0));
  let pw = p + bvec * dent * 0.28;

  // ---- Layer 1: base field — cloth folds + heathered undyed tint --------
  // A couple of gentle undulations: low-freq fbm bends the phase of one
  // soft directional wave, so the shading reads as draped cloth, not blobs.
  let fold = fbm(uv * vec2<f32>(2.1, 1.5) + vec2<f32>(7.3, 2.9));
  let undPh = uv.x * 4.6 + uv.y * 1.9 + (fold - 0.5) * 3.2;
  let foldLight = 1.0 + (fold - 0.5) * 0.17 + sin(undPh) * 0.05;

  // Heather: patch-to-patch drift between warm oat and grey-flax.
  let hea1 = vnoise(p * 3.1 + vec2<f32>(11.0, 5.0));
  let hea2 = vnoise(p * 6.3 + vec2<f32>(3.0, 21.0));
  let linA = vec3<f32>(0.760, 0.706, 0.615);
  let linB = vec3<f32>(0.652, 0.622, 0.560);
  let baseTone = mix(linA, linB, clamp(hea1 * 0.65 + hea2 * 0.35, 0.0, 1.0));

  // ---- Layer 2: the weave ----------------------------------------------
  // Thread coordinates, gently wavy so no thread runs ruler-straight.
  let wxF = pw.x * threadF + (vnoise(vec2<f32>(pw.y * 2.6, 4.7)) - 0.5) * 0.7;
  let wyF = pw.y * threadF + (vnoise(vec2<f32>(pw.x * 2.6, 9.3)) - 0.5) * 0.7;
  let ix = floor(wxF);
  let iy = floor(wyF);
  let fx = fract(wxF);
  let fy = fract(wyF);
  let dx = abs(fx - 0.5);
  let dy = abs(fy - 0.5);

  // Per-thread randoms: width + brightness irregularity.
  let rWarp = hash21(vec2<f32>(ix, 3.7));
  let rWeft = hash21(vec2<f32>(iy, 8.1));

  // Slubs: short thicker segments scattered along individual threads.
  let slubWarp = smoothstep(0.74, 0.90,
      vnoise(vec2<f32>(ix * 7.77 + 13.0, wyF * 0.13)));
  let slubWeft = smoothstep(0.74, 0.90,
      vnoise(vec2<f32>(wxF * 0.13 + 47.0, iy * 7.77)));

  let warpHalf = 0.34 + (rWarp - 0.5) * 0.12 + slubWarp * 0.16;
  let weftHalf = 0.33 + (rWeft - 0.5) * 0.12 + slubWeft * 0.16;

  // Soft-edged thread coverage + cylindrical cross-section shading.
  let covW = smoothstep(warpHalf, warpHalf - 0.16, dx);
  let covF = smoothstep(weftHalf, weftHalf - 0.16, dy);
  let cylW = 0.42 + 0.58 * max(1.0 - (dx / warpHalf) * (dx / warpHalf), 0.0);
  let cylF = 0.42 + 0.58 * max(1.0 - (dy / weftHalf) * (dy / weftHalf), 0.0);

  // Over/under checker: the top thread bulges toward the light at the
  // crossing, the under thread dips into shadow — this is the weave's depth.
  let chk = fract((ix + iy) * 0.5);
  let wOver = chk > 0.25;
  let warpOver = select(0.0, 1.0, wOver);
  let bumpW = sin(3.14159 * fy);
  let bumpF = sin(3.14159 * fx);
  let liftW = mix(0.78 - 0.10 * bumpW, 0.94 + 0.14 * bumpW, warpOver);
  let liftF = mix(0.78 - 0.10 * bumpF, 0.94 + 0.14 * bumpF, 1.0 - warpOver);

  // ---- Layer 3: micro detail — fiber striations along each thread ------
  let fibW = (vnoise(vec2<f32>(wxF * 2.7, wyF * 0.33 + 17.0)) - 0.5) * microAmt;
  let fibF = (vnoise(vec2<f32>(wxF * 0.33 + 51.0, wyF * 2.7)) - 0.5) * microAmt;

  // Thread tones: warp a hair warmer than weft, per-thread brightness
  // wobble, slubs slightly paler and yellower where the yarn thickens.
  let bW = 0.90 + 0.20 * rWarp;
  let bF = 0.90 + 0.20 * rWeft;
  var warpCol = baseTone * vec3<f32>(1.030, 1.010, 0.985) * bW;
  var weftCol = baseTone * vec3<f32>(0.985, 0.992, 1.010) * bF;
  warpCol = mix(warpCol, warpCol * vec3<f32>(1.09, 1.05, 0.97), slubWarp * 0.6);
  weftCol = mix(weftCol, weftCol * vec3<f32>(1.09, 1.05, 0.97), slubWeft * 0.6);

  let toneW = warpCol * cylW * liftW * (1.0 + fibW * 0.55);
  let toneF = weftCol * cylF * liftF * (1.0 + fibF * 0.55);

  // Composite: shadowed gap, then the under thread, then the over thread.
  var col = baseTone * 0.40;
  let underTone = select(toneW, toneF, wOver);
  let underCov = select(covW, covF, wOver);
  let overTone = select(toneF, toneW, wOver);
  let overCov = select(covF, covW, wOver);
  col = mix(col, underTone, underCov);
  col = mix(col, overTone, overCov);

  // Sparse defects: the occasional dark nub caught in the weave. Centers
  // sit in the cell interior so a nub is never sliced flat by a cell edge.
  let nubCell = floor(pw * threadF * 0.23);
  let nubH = hash21(nubCell + vec2<f32>(31.0, 17.0));
  let nubPos = vec2<f32>(
      mix(0.15, 0.85, hash21(nubCell + vec2<f32>(5.0, 9.0))),
      mix(0.15, 0.85, hash21(nubCell + vec2<f32>(2.0, 27.0))));
  let nubD = fract(pw * threadF * 0.23) - nubPos;
  let nub = step(0.9955, nubH) * smoothstep(0.075, 0.02, length(nubD));
  col = mix(col, baseTone * vec3<f32>(0.52, 0.50, 0.46), nub * 0.7);

  // Faint fuzz veil: surface fibers soften the weave contrast slightly.
  col = mix(col, baseTone * 0.80, 0.13);

  // Dent shading: the hollow darkens toward the contact; the funnel wall
  // below the ball tilts up into the light and brightens while the wall
  // above tilts away and darkens, which is what sells the depth. The cloth
  // bunching around the rim catches a little extra light.
  let dentSlope = clamp(-bvec.y / ballR * dent * 0.12, -0.12, 0.12);
  let dentRim = smoothstep(0.10, 0.35, dent) * smoothstep(0.80, 0.40, dent);
  col = col * (1.0 - dent * 0.22 + dentSlope + dentRim * 0.08);

  // Contact shadow: a soft pool ringing the ball — the light is mostly
  // overhead, so it stays nearly centered with only a whisper of offset —
  // plus a tight occlusion ring right where sphere meets cloth.
  let shD = length(bvec - vec2<f32>(0.06, -0.10) * ballR);
  let shadow = smoothstep(ballR * 2.0, ballR * 0.6, shD);
  col = col * (1.0 - shadow * 0.30);
  let contactAo = smoothstep(ballR * 1.30, ballR * 0.85, bdist);
  col = col * (1.0 - contactAo * 0.30);

  // Fold shading over everything, and a light vignette to sit in the frame.
  col = col * foldLight;
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.22);

  // Keep it natural, not printed: nudge toward luma.
  let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(luma), col, 0.90);

  // Fine grain: fuzz sparkle + kills banding on the fold gradients.
  let grain = hash21(uv * u.resolution.xy + vec2<f32>(0.7, 0.3));
  col = col + (grain - 0.5) * 0.022;

  // ---- The glossy metal ball -------------------------------------------
  // Orthographic sphere shading: normal from the circle, view (0,0,1).
  let qv = bvec / ballR;
  let nz = sqrt(max(1.0 - dot(qv, qv), 0.0));
  let nrm = vec3<f32>(qv.x, qv.y, nz);
  // Reflection of the view ray about the normal.
  let rv = vec3<f32>(2.0 * nz * nrm.x, 2.0 * nz * nrm.y, 2.0 * nz * nz - 1.0);

  // Chrome environment: the linen below the horizon (the cloth it sits on,
  // mirrored in the ball), a cool bright room above, and the classic sharp
  // horizon band between them.
  // Mirrored linen below the horizon: warm and bright right at the horizon
  // (the far cloth), falling smoothly into the ball's own contact shadow
  // straight down. A blurry noise hint replaces literal stripes — high-freq
  // patterns on the curved reflection alias into moiré rings.
  let downAmt = clamp(-rv.y, 0.0, 1.0);
  let weaveHint = 0.92 + 0.08 * vnoise(vec2<f32>(rv.x * 5.0, rv.y * 5.0));
  var groundCol =
      baseTone * foldLight * mix(1.05, 0.55, downAmt) * weaveHint;
  // The ball's own contact shadow: a soft dark core only straight down.
  groundCol = groundCol * (1.0 - 0.55 * smoothstep(0.55, 0.95, downAmt));
  // Sky: grey-blue near the horizon rising to a bright zenith, with two
  // softbox bands that curve over the dome — the banding is what makes
  // chrome read as chrome instead of a flat two-tone sticker.
  var skyCol = mix(vec3<f32>(0.62, 0.66, 0.72), vec3<f32>(0.94, 0.97, 1.02),
      clamp(rv.y * 1.3, 0.0, 1.0));
  skyCol = skyCol
      + vec3<f32>(0.38, 0.39, 0.42) * exp(-pow((rv.y - 0.22) * 6.5, 2.0))
      + vec3<f32>(0.20, 0.21, 0.24) * exp(-pow((rv.y - 0.78) * 8.0, 2.0));
  let horiz = smoothstep(-0.04, 0.06, rv.y);
  var envCol = mix(groundCol, skyCol, horiz);
  // Hot sliver of backlit cloth right under the horizon, and a window
  // glint mirrored in the upper dome.
  envCol = envCol + baseTone * 0.8 * exp(-pow((rv.y + 0.06) * 16.0, 2.0));
  let winD = length(vec2<f32>(rv.x * 1.5, rv.y - 0.58));
  envCol = envCol + vec3<f32>(0.40, 0.41, 0.45) * smoothstep(0.30, 0.08, winD);

  // Fresnel: grazing angles mirror harder; cool steel tint overall.
  let fres = pow(1.0 - nz, 3.0);
  var ballCol = envCol * vec3<f32>(0.93, 0.96, 1.02) * (0.60 + 0.40 * fres);

  // Speculars: hard key from the upper-left, broad soft fill lower-right.
  let lKey = normalize(vec3<f32>(-0.45, 0.70, 0.55));
  let hKey = normalize(lKey + vec3<f32>(0.0, 0.0, 1.0));
  // clamp to 1: outside the ball qv is un-normalized and huge, and an
  // unclamped dot here overflows pow() to inf — mix(col, inf, 0.0) is NaN,
  // which painted the far side of the screen black.
  let spKey = pow(clamp(dot(nrm, hKey), 0.0, 1.0), 260.0);
  let lFill = normalize(vec3<f32>(0.60, -0.35, 0.45));
  let hFill = normalize(lFill + vec3<f32>(0.0, 0.0, 1.0));
  let spFill = pow(clamp(dot(nrm, hFill), 0.0, 1.0), 48.0);
  ballCol = ballCol
      + vec3<f32>(1.00, 0.99, 0.96) * spKey * 1.8
      + vec3<f32>(0.88, 0.90, 0.96) * spFill * 0.22;

  // Grounding: underside falls into shadow, then picks up a warm bounce
  // from the linen it rests on.
  ballCol = ballCol * (0.78 + 0.22 * clamp(nrm.y * 0.5 + 0.62, 0.0, 1.0));
  ballCol = ballCol + baseTone * foldLight * max(-nrm.y, 0.0) * 0.14;

  // Composite after the grain — polished steel shouldn't inherit cloth fuzz.
  let edgePx = 1.5 / u.resolution.y;
  let ballCov = smoothstep(ballR, ballR - edgePx * 2.0, bdist);
  col = mix(col, ballCol, ballCov);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

const styles = StyleSheet.create({
  base: { backgroundColor: '#aca391' },
});
