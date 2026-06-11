---
name: shader-react-native-effects
displayName: ShaderView Effects
description: Implement realistic, high-performance WGSL shader effects with react-native-effects' ShaderView (WebGPU). Use when writing, porting, or debugging a shader effect, creating a new effect component, making an effect touch/scroll/audio-reactive, fixing a blank/black ShaderView, or optimizing shader performance in this repo or any app using react-native-effects.
---

# ShaderView Effects

ShaderView renders a WGSL fragment shader on a WebGPU canvas with the render loop running **off the JS thread** (react-native-worklets). You write only the fragment shader; the library provides the full-screen triangle vertex shader and a fixed uniform buffer.

## Quick start

```tsx
import { useMemo } from 'react';
import { ShaderView, type ColorInput } from 'react-native-effects';

export default function MyEffect({ color = '#3b82f6' as ColorInput, ...viewProps }) {
  const colors = useMemo(() => [color], [color]);
  return <ShaderView fragmentShader={SHADER} colors={colors} {...viewProps} />;
}

const SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (seconds, dt, 0, 0)
  color0:     vec4<f32>,  // colors[0] RGBA 0..1
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;                              // y-UP: uv.y=1 is TOP
  let c = (uv - 0.5) * vec2<f32>(u.resolution.z, 1.0);   // aspect-corrected, centered
  let glow = 0.05 / (length(c) + 0.05);
  return vec4<f32>(u.color0.rgb * glow, 1.0);
}`;
```

Full uniform layout, props, live-input API, and WGSL gotchas: [WGSL.md](WGSL.md)

## Non-negotiable rules

1. **WGSL, not GLSL.** No ternary (`select()`), no `frac` (`fract`), explicit `f32` literals (`1.0` not `1`), `var` mutable / `let` immutable.
2. **Never name a variable `active`, `auto`, `filter`, `final`, `new`, `target`, `mod`, `type`, `set`, `get`, `self`, `smooth`, `precise`, `common`.** These are WGSL reserved words; the shader compiles to a silent failure → **blank canvas**. This is the #1 cause of "nothing renders".
3. **UV is y-up**: `uv.y = 1.0` is the TOP of the view. Negate when porting Shadertoy/screen-space logic.
4. **`transparent` ⇒ premultiplied alpha**: `return vec4<f32>(col * alpha, alpha);` — straight alpha washes grey where alpha→0.
5. **Per-frame input goes through `paramsSynchronizable`** (`u.live`), never React props/state — prop updates re-render and drop frames.
6. Shader string = module-level `const`; `useMemo` the `colors`/`params` arrays; spread `...viewProps`.

## Workflow for a new effect

1. **Design before coding**: pick 2–3 visual layers (base field → mid-scale structure → micro detail/highlight). Single-layer shaders look fake. Recipes: [TECHNIQUES.md](TECHNIQUES.md)
2. **Set a performance budget first**: fragment cost × every pixel × DPR. Pick noise octaves and loop counts from [PERFORMANCE.md](PERFORMANCE.md), don't tune down later.
3. Write the component wrapper (Quick start above). Map design knobs to `params` (max 8 floats) and `colors` (max 2); live input via `useParamsSynchronizable`.
4. Build the shader incrementally — start by returning a solid color, then add one layer at a time so a silent compile failure is bisectable.
5. **Verify on device** with the argent tools (launch the example app, screenshot, compare against intent), then check motion smoothness at the final size.

## Debugging a blank/black view

A blank view almost always means the WGSL failed to compile (silently). In order:
1. Grep your identifiers against the reserved-word list in [WGSL.md](WGSL.md).
2. Check for GLSL-isms: ternaries, `vec3(x)` shorthand without `<f32>`, int/float mixing, swizzle assignment (`p.xy = ...` is illegal).
3. Bisect: `return vec4<f32>(1.0, 0.0, 1.0, 1.0);` at the top of `main`, move it down until it breaks.
4. Verify the `Uniforms` struct fields are declared in the exact canonical order (top-down, may stop early).

## Reference files

- [WGSL.md](WGSL.md) — exact ShaderView contract: props, uniform slots, entry point, live input, reserved words, GLSL→WGSL translation
- [TECHNIQUES.md](TECHNIQUES.md) — realism recipes: noise/fbm toolkit, cosine palettes, specular glare, glass, sparkle, domain warping, dithering, transparent overlays
- [PERFORMANCE.md](PERFORMANCE.md) — cost model, octave/loop budgets, what's expensive on mobile GPUs, measuring on device
- In-repo exemplars: `example/src/components/HoloFoilCard.tsx` (tilt-driven foil), `src/components/Aurora.tsx` (fbm curtains), `example/src/components/VoiceWave.tsx` (audio + transparency), `src/components/Campfire.tsx` (3D simplex noise)
