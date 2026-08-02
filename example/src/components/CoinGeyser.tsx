import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Small caption line. */
  caption?: string;
  /** Starting balance, in dollars. */
  initialAmount?: number;
};

// Must match the shader's eruption period so the balance ticks up in sync
// with each burst.
const ERUPTION_PERIOD_MS = 5200;

// More money, more coins: one coin per $300, within the shader's budget.
const coinsForAmount = (amount: number) =>
  Math.min(64, Math.max(10, Math.round(amount / 300)));

// The piggy bank reads as "full" at this balance — the gold level tracks it.
const FULL_AT = 2000;
const fillForAmount = (amount: number) => Math.min(1, amount / FULL_AT);

/**
 * A piggy bank made of molten gold. Every deposit erupts as a geyser of big,
 * spinning gold coins; the balance rolls up as they land, and the pool of
 * liquid gold sits exactly where the balance says it should — the fuller the
 * piggy bank, the higher the metal climbs. It never drains.
 */
export default function CoinGeyser({
  caption = 'Piggy Bank · Auto-save',
  initialAmount = 200,
  style,
  ...rest
}: Props) {
  const [display, setDisplay] = useState(initialAmount);
  const [coinCount, setCoinCount] = useState(coinsForAmount(initialAmount));
  // Seconds since the bank filled up; 0 while still filling. Drives the
  // shader's finale (seal flash, then glitter + sheen on the full gold).
  const [finale, setFinale] = useState(0);
  const amountRef = useRef(initialAmount);
  const scale = useRef(new Animated.Value(1)).current;

  // Every eruption pays out again: the balance rolls up to its new value
  // while the title pops like a register drawer.
  useEffect(() => {
    const id = setInterval(() => {
      const from = amountRef.current;
      // Once the piggy bank is full, the deposits stop — it stays brimming.
      if (from >= FULL_AT) {
        return;
      }
      const to = Math.min(
        FULL_AT,
        from + 300 + Math.round(Math.random() * 800)
      );
      amountRef.current = to;
      setCoinCount(coinsForAmount(to));

      // The last drop seals it: kick off the finale clock and give the
      // title one big celebratory pop.
      if (to >= FULL_AT) {
        const finaleStart = Date.now();
        const tick = () => {
          const s = (Date.now() - finaleStart) / 1000;
          setFinale(Math.min(s, 5));
          if (s < 5) {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }

      const start = Date.now();
      const duration = 900;
      const step = () => {
        const k = Math.min((Date.now() - start) / duration, 1);
        const eased = 1 - Math.pow(1 - k, 3);
        setDisplay(from + (to - from) * eased);
        if (k < 1) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);

      Animated.sequence([
        Animated.timing(scale, {
          toValue: to >= FULL_AT ? 1.3 : 1.14,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    }, ERUPTION_PERIOD_MS);
    return () => clearInterval(id);
  }, [scale]);

  const title = `$${display.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <View style={[styles.card, style]} {...rest}>
      <ShaderView
        fragmentShader={GEYSER_SHADER}
        params={[coinCount, fillForAmount(display), finale, 0, 0, 0, 0, 0]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.textWrap} pointerEvents="none">
        <Text style={styles.caption}>
          {finale > 0 ? 'Piggy Bank · Goal reached 🎉' : caption}
        </Text>
        <Animated.Text style={[styles.title, { transform: [{ scale }] }]}>
          {title}
        </Animated.Text>
      </View>
    </View>
  );
}

const GEYSER_SHADER = /* wgsl */ `
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

// Molten surface height at x around a given level; the chop swells with
// each eruption but the level itself never drops.
fn surfaceY(x: f32, t: f32, level: f32, chop: f32) -> f32 {
  let amp = 1.0 + chop * 1.6;
  return level
       + (0.022 * sin(x * 2.3 - t * 0.7)
        + 0.014 * sin(x * 4.7 + t * 1.1)
        + 0.012 * (vnoise(vec2<f32>(x * 7.0, t * 0.8)) - 0.5) * 2.0) * amp;
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let p = vec2<f32>(uv.x * aspect, uv.y);

  // The eruption clock. The pool's level comes straight from the balance
  // (params0.y in [0,1]): the fuller the piggy bank, the higher the gold —
  // and since the balance only grows, the level never drops.
  let period = 5.2;
  let clock = t / period;
  let prog = fract(clock);
  let gen = floor(clock);
  let fill = clamp(u.params0.y, 0.0, 1.0);
  // Full means FULL: at fill = 1 the surface climbs past the top edge and
  // the whole card is molten gold.
  let level = mix(0.10, 1.12, fill);
  // The chop and the heat still pulse with each blast.
  let rise = smoothstep(0.04, 0.30, prog) * (1.0 - smoothstep(0.50, 0.90, prog));

  let ys = surfaceY(p.x, t, level, rise);
  let h = p.y - ys;
  let e = 0.015;
  let slope = (surfaceY(p.x + e, t, level, rise) - surfaceY(p.x - e, t, level, rise))
            / (2.0 * e);

  var col: vec3<f32>;
  if (h < 0.0) {
    // --- Inside the molten pool.
    let depth = -h;
    col = mix(vec3<f32>(1.00, 0.76, 0.32), vec3<f32>(0.30, 0.14, 0.02),
              smoothstep(0.0, 0.30, depth));
    let swirl = fbm(vec2<f32>(p.x * 2.6 + t * 0.08, (p.y + t * 0.05) * 4.0));
    col = col * (0.88 + 0.24 * swirl);
    let lit = clamp(-slope * 2.2 + 0.35, 0.0, 1.0);
    col = col + vec3<f32>(1.0, 0.93, 0.70) * lit * exp(-depth * 16.0) * 0.55;
    // The pool burns hotter while it's swollen.
    col = col * (1.0 + rise * 0.35);
  } else {
    // --- Dark glass above, warmed by the pool's glow.
    col = mix(vec3<f32>(0.020, 0.018, 0.022), vec3<f32>(0.055, 0.042, 0.030),
              exp(-h * 4.5));
    let glow = exp(-h * 6.0) * (0.16 + rise * 0.22);
    col = col + vec3<f32>(0.85, 0.55, 0.18) * glow;
  }
  // The meniscus: a razor of white gold where metal meets dark.
  col = col + vec3<f32>(1.0, 0.90, 0.62) * exp(-abs(h) * 70.0) * 0.85;

  let src = vec2<f32>(aspect * 0.5, level);

  // The blast column: a hot vertical flare in the first beat of the cycle.
  let blast = pow(max(1.0 - prog * 5.5, 0.0), 2.0);
  let dxs = p.x - src.x;
  col = col + vec3<f32>(1.0, 0.80, 0.42)
            * exp(-dxs * dxs * 9.0) * exp(-max(h, 0.0) * 2.2) * blast * 1.1;

  // --- The coins. Fat gold discs on ballistic arcs, tumbling as they fly:
  // edge-on they thin to a sliver, face-on they catch a glint. How many fly
  // is driven from JS (params0.x) — the bigger the balance, the denser the
  // geyser.
  let grav = -3.4;
  let coinN = clamp(u.params0.x, 4.0, 64.0);
  for (var i = 0; i < 64; i = i + 1) {
    let fi = f32(i);
    if (fi >= coinN) {
      continue;
    }
    let sd = vec2<f32>(fi * 11.31 + gen * 2.7, fi * 5.17 - gen);

    let delay = 0.10 * hash21(sd + 1.1);
    let ts = (prog - delay) * period;
    if (ts < 0.0) {
      continue;
    }

    let vx = (hash21(sd + 2.2) - 0.5) * 2.2;
    let vy = 1.8 + 0.85 * hash21(sd + 3.3);
    var pos = vec2<f32>(
      src.x + vx * ts * 0.55,
      src.y + vy * ts + 0.5 * grav * ts * ts
    );
    pos.x = pos.x + sin(ts * 2.5 + fi) * 0.015;

    // Gone once it splashes back into the (risen) pool.
    if (ts > 0.5 && pos.y < surfaceY(pos.x, t, level, rise) - 0.02) {
      continue;
    }

    // Tumble: the disc squashes to a sliver edge-on and rounds out face-on.
    let spin = ts * (5.0 + 4.0 * hash21(sd + 4.4)) + hash21(sd + 5.5) * 6.28;
    let squash = abs(sin(spin));
    let ang = hash21(sd + 6.6) * 6.28 + ts * 1.6;
    let ca = cos(ang);
    let sa = sin(ang);
    let rel = p - pos;
    let q = vec2<f32>(ca * rel.x - sa * rel.y, sa * rel.x + ca * rel.y);
    let sq = mix(0.20, 1.0, squash);
    let ed = length(vec2<f32>(q.x, q.y / sq));

    let r = 0.050 + 0.024 * hash21(sd + 7.7);
    let disc = smoothstep(r, r * 0.80, ed);
    if (disc < 0.003) {
      continue;
    }

    // Shading: lit from above-left, a bright rim band near the edge, darker
    // amber when edge-on, and a white glint sweeping the face as it tumbles.
    let lambert = clamp(0.62 - (ed / r) * 0.35 + (q.y / r) * 0.30, 0.0, 1.0);
    var coin = mix(vec3<f32>(0.52, 0.32, 0.08), vec3<f32>(1.00, 0.82, 0.38),
                   lambert);
    let rim = smoothstep(r * 0.92, r * 0.80, ed)
            - smoothstep(r * 0.72, r * 0.58, ed);
    coin = coin + vec3<f32>(1.0, 0.92, 0.65) * clamp(rim, 0.0, 1.0) * 0.45;
    coin = coin * mix(0.55, 1.0, squash);
    let glint = pow(squash, 14.0) * pow(clamp(1.0 - abs(q.x + q.y) / r, 0.0, 1.0), 3.0);
    coin = coin + vec3<f32>(1.0, 0.97, 0.85) * glint * 0.9;

    // Coins are solid: paint over what's behind them.
    col = mix(col, coin, disc);
  }

  // --- The finale (params0.z = seconds since the bank filled). One brilliant
  // flash as the last drop seals it, then the full gold lives on: glitter
  // twinkling in the metal and a slow mint-sheen sweeping the surface.
  let fin = u.params0.z;
  if (fin > 0.0) {
    col = col * (1.0 + exp(-fin * 2.2) * 1.5);

    let settle = smoothstep(0.4, 1.8, fin);
    let cell = floor(p * 22.0);
    let rndc = hash21(cell + 7.0);
    let cp = (cell + 0.5
            + (vec2<f32>(rndc, hash21(cell + 3.0)) - 0.5) * 0.7) / 22.0;
    let dsp = p - cp;
    let twk = pow(0.5 + 0.5 * sin(t * (2.0 + rndc * 5.0) + rndc * 40.0), 12.0);
    col = col + vec3<f32>(1.0, 0.96, 0.78)
              * exp(-dot(dsp, dsp) * 26000.0) * step(0.78, rndc) * twk
              * settle * 1.2;

    let sw = p.x * 0.8 + p.y * 0.45;
    let sweepPos = mix(-1.0, aspect + 1.0, fract(t * 0.20));
    let dsw = sw - sweepPos;
    col = col + vec3<f32>(1.0, 0.88, 0.55)
              * exp(-dsw * dsw * 8.0) * settle * 0.22;
  }

  // Lacquer vignette + grain.
  let vd = uv - 0.5;
  col = col * (1.0 - dot(vd, vd) * 0.5);
  let noise = hash21(uv * u.resolution.xy + fract(t) * 197.0) - 0.5;
  col = col + noise * 0.009;

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

const styles = StyleSheet.create({
  card: {
    height: 122,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#070708',
    justifyContent: 'center',
  },
  textWrap: {
    paddingHorizontal: 26,
  },
  caption: {
    color: 'rgba(235, 235, 245, 0.72)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    transformOrigin: 'left center',
  },
});
