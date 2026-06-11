# Realism Techniques

What separates a "real-looking" shader from a programmer-art one is **layering**: a base field, mid-scale structure, and micro detail, each moving at a different speed, with nothing fully saturated and no hard edges. Every recipe below is proven in this repo — file references included.

## The standard noise toolkit

Paste these as-is (from `example/src/components/HoloFoilCard.tsx:45-73` — the house style):

```wgsl
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
  let m = mat2x2<f32>(1.6, 1.2, -1.2, 1.6);  // rotate+scale between octaves: kills grid artifacts
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}
```

Need noise that evolves over time without visible scrolling? Use the 3D simplex implementation in `src/components/Campfire.tsx` with `z = time` — but it's ~3× the cost of `vnoise`; see PERFORMANCE.md.

## Color: palettes that look expensive

**Cosine palette** — smooth full-spectrum hue from one float (`HoloFoilCard.tsx:76-79`):
```wgsl
fn spectrum(h: f32) -> vec3<f32> {
  return 0.5 + 0.5 * cos(6.2831853 * (vec3<f32>(h) + vec3<f32>(0.0, 0.33, 0.67)));
}
```
Vary the phase vector `(0.0, 0.33, 0.67)` for other moods (IQ palettes); feed it slowly-varying fields (noise, position, tilt), never raw time.

**Desaturate toward luma** — the single biggest "premium vs neon" lever:
```wgsl
let luma = dot(col, vec3<f32>(0.299, 0.587, 0.114));
col = mix(vec3<f32>(luma), col, 0.72);  // 0.6–0.8 = metallic/tasteful; 1.0 = arcade
```

**Vignette** — grounds the effect in its frame:
```wgsl
let vd = uv - 0.5;
col = col * (1.0 - dot(vd, vd) * 0.55);
```

## Light: specular glare and glow

**Gaussian glare** (cheap, no `pow`): a stripe of light that blows out to white, like foil/glass catching light (`HoloFoilCard.tsx:107-116`):
```wgsl
let glarePos = (c.x * 0.8 - c.y * 0.6) - drive;   // drive = tilt, touch, or slow sin(t)
let glare = exp(-glarePos * glarePos * 3.5);       // bigger k = tighter stripe
col = col + glare * 0.45;                          // additive energy
col = mix(col, vec3<f32>(1.0), glare * 0.45);      // AND blow toward white — both, not either
```
Add a second, softer counter-glare on the opposite diagonal at ~25% strength for depth.

**Point glow** with natural falloff: `let glow = k / (length(c - center) + k);` — reads as light, unlike `smoothstep` discs which read as stickers.

## Shape: nothing hard-edged

- Edges: `smoothstep(r, r - feather, d)` where `feather` ≈ 2–4 px → `feather = 3.0 / u.resolution.y`.
- Organic motion: **domain warping** — distort coordinates with low-frequency fbm before evaluating the pattern:
  ```wgsl
  let warp = fbm(c * 2.0 + vec2<f32>(t * 0.05, t * 0.02));   // SLOW drift
  let g = c.x * 1.1 + c.y * 0.6 + (warp - 0.5) * 1.3;        // bands that flow, not stripe
  ```
  Compute `warp` **once** and reuse it for every layer that needs organic variation (HoloFoilCard reuses it for both the iridescent bands and the brush streaks — realism and performance from one sample).
- Micro detail: high-frequency anisotropic streaks `0.5 + 0.5 * sin(c.x * 88.0 + (warp - 0.5) * 16.0)` modulating brightness ±25%.
- Sparkle dust: `let s = hash21(floor(c * 120.0)); col += step(0.995, s) * flicker;` with `flicker = 0.5 + 0.5 * sin(t * 7.0 + s * 40.0)`.

## Motion: layered speeds

Real materials never move uniformly. Give each layer its own speed, slowest for the largest features: base drift `t * 0.02–0.05`, mid structure `t * 0.1–0.3`, highlights/shimmer `t * 0.5–2.0`. Breathing/pulse (SiriOrb): `radius += sin(t * pulseSpeed) * pulseAmt` with amplitude ~1–2% of the base — subtlety is what reads as alive.

## Banding

Smooth dark gradients band visibly on OLED. Dither before returning:
```wgsl
col = col + (hash21(uv * u.resolution.xy) - 0.5) * (1.5 / 255.0);
```

## Transparent overlays (badges, waves, glows over content)

```wgsl
let alpha = clamp(line + glow + fill, 0.0, 1.0);
return vec4<f32>(col * alpha, alpha);   // PREMULTIPLIED — col * alpha, always
```
(`example/src/components/VoiceWave.tsx:93`.) Straight alpha produces grey fringing wherever alpha approaches 0. Size the view to the effect's bounding box, not full-screen — transparent pixels still pay full fragment cost.

## Interactivity sells realism

A static foil is a gradient; a tilt-driven foil is foil. Drive at least one parameter from `u.live`:
- Tilt/parallax sweeping a glare or hue (`HoloFoilCard` + `useTilt`)
- Touch position warping the field locally (`TouchField.tsx`)
- Scroll progress tightening/morphing structure (`ScrollReactive.tsx`)
- Audio level driving amplitude + glow (`VoiceWave.tsx`, `SiriOrb.tsx`)

Map live values through easing in the shader (`smoothstep`, `exp` decay) so responses feel physical rather than 1:1 mechanical.

## Pre-flight realism checklist

- [ ] ≥ 2 visual layers at different spatial scales
- [ ] ≥ 2 different motion speeds (slowest for biggest features)
- [ ] Colors desaturated toward luma (unless deliberately neon)
- [ ] Highlights blow toward white, not toward saturated color
- [ ] No hard edges — every boundary smoothstepped or glow-falloff
- [ ] Vignette or edge treatment so it sits in its frame
- [ ] Dither on smooth gradients
- [ ] Something responds to input (`u.live`) or breathes on its own
