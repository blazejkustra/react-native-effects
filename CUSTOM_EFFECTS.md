# Custom Effects Guide

This guide explains how to create your own shader effects using `ShaderView`, the core component behind every effect in `react-native-effects`.

## How ShaderView Works

`ShaderView` renders a WGSL fragment shader on a WebGPU canvas. It handles the render loop, uniform buffer, and React Native view integration. You provide:

- A **WGSL fragment shader** string
- Up to **2 colors** (mapped to `u.color0`, `u.color1`)
- Up to **8 float parameters** (mapped to `u.params0.xyzw`, `u.params1.xyzw`)
- A **speed** multiplier for animation
- An optional **isStatic** flag to render once and stop
- An optional **paramsSynchronizable** channel for live, per-frame input (touch/scroll)

### Props

| Prop                   | Type                   | Default | Description                                                                                                                                                                |
| ---------------------- | ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fragmentShader`       | `string`               | —       | WGSL fragment shader source (must declare the `Uniforms` struct)                                                                                                           |
| `colors`               | `ColorInput[]`         | `[]`    | Up to 2 colors — accepts hex strings, named colors, or numeric values                                                                                                      |
| `params`               | `number[]`             | `[]`    | Up to 8 shader-specific floats                                                                                                                                             |
| `speed`                | `number`               | `1.0`   | Time multiplier for animation speed                                                                                                                                        |
| `isStatic`             | `boolean`              | `false` | Render once then stop the animation loop                                                                                                                                   |
| `transparent`          | `boolean`              | `false` | Clear the canvas to alpha `0` for a transparent background                                                                                                                 |
| `paramsSynchronizable` | `ParamsSynchronizable` | —       | Live float input (4 up to 388 floats) written into the dedicated `u.live` / `u.liveData` slots every frame (touch/scroll/audio/trails), independent of the static `params` |

`ShaderView` also accepts all standard React Native `View` props (`style`, `onLayout`, etc.).

## Uniform Buffer Layout

Every shader must declare the uniform struct with these fields in this order:

```wgsl
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (seconds, dt, 0, 0)
  color0:     vec4<f32>,  // colors[0] as normalized RGBA (0..1)
  color1:     vec4<f32>,  // colors[1] as normalized RGBA (0..1)
  params0:    vec4<f32>,  // params[0], params[1], params[2], params[3]
  params1:    vec4<f32>,  // params[4], params[5], params[6], params[7]
  live:       vec4<f32>,  // paramsSynchronizable[0..3] (touch/scroll/audio); (0,0,0,0) when unused
  liveData:   array<vec4<f32>, 96>,  // paramsSynchronizable[4..387] for long channels (trails, multi-touch)
};
@group(0) @binding(0) var<uniform> u: Uniforms;
```

You only need to declare the fields you actually read, top-down — a shader that
never uses live input can stop at `params1`, and most live-input shaders stop
at `live`. The full struct is shown here so the offsets are unambiguous.

### Field Reference

| Field          | Components                                                           | Description                           |
| -------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `u.resolution` | `.x` = width, `.y` = height, `.z` = aspect ratio, `.w` = pixel ratio | Canvas dimensions                     |
| `u.time`       | `.x` = elapsed seconds (speed-adjusted), `.y` = delta time           | Animation timing                      |
| `u.color0`     | `.rgba`                                                              | First color, normalized 0..1          |
| `u.color1`     | `.rgba`                                                              | Second color, normalized 0..1         |
| `u.params0`    | `.xyzw` = params[0..3]                                               | First 4 custom parameters             |
| `u.params1`    | `.xyzw` = params[4..7]                                               | Last 4 custom parameters              |
| `u.live`       | `.xyzw` = paramsSynchronizable[0..3]                                 | Live per-frame input; `0` when unused |
| `u.liveData`   | `[i]` = paramsSynchronizable[4+4i .. 7+4i]                           | Overflow vec4s for long live channels |

## Fragment Shader Contract

Your fragment shader entry point must have this signature:

```wgsl
@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  // ndc is in Normalized Device Coordinates: x and y range from -1 to 1
  // Convert to UV (0..1) with:
  let uv = ndc * 0.5 + 0.5;

  // Return an RGBA color
  return vec4<f32>(r, g, b, a);
}
```

**Key points:**

- The input `ndc` ranges from **-1 to 1** on both axes
- Convert to standard UV coordinates (0..1) with `ndc * 0.5 + 0.5`
- The vertex shader draws a full-screen triangle — you only write the fragment shader
- Return a `vec4<f32>` RGBA color

## Step-by-Step: Create a Custom Effect

### 1. Create your component file

```tsx
import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from 'react-native-effects';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  color?: ColorInput;
  speed?: number;
  intensity?: number;
  scale?: number;
};

export default function MyEffect({
  color = '#3b82f6',
  speed = 1.0,
  intensity = 1.0,
  scale = 1.0,
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(() => [intensity, scale], [intensity, scale]);

  return (
    <ShaderView
      fragmentShader={MY_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      {...viewProps}
    />
  );
}
```

### 2. Write the WGSL shader

Define it as a constant below your component:

```wgsl
const MY_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let time = u.time.x;
  let intensity = u.params0.x;
  let scale = u.params0.y;

  // Your shader logic here
  let pattern = sin(uv.x * scale * 10.0 + time) * sin(uv.y * scale * 10.0 + time);
  let col = u.color0.rgb * (0.5 + 0.5 * pattern * intensity);

  return vec4<f32>(col, 1.0);
}
`;
```

### 3. Use it

```tsx
<MyEffect
  style={{ width: '100%', height: 300 }}
  color="#8b5cf6"
  speed={1.5}
  intensity={0.8}
  scale={2.0}
/>
```

### Tips

- Use `useMemo` for the `colors` and `params` arrays to avoid re-creating them every render
- Spread `...viewProps` so your component works like any React Native view
- Keep the shader string as a module-level `const` — it never changes
- Look at the built-in effects (Silk, Aurora, Campfire) in `src/components/` for real-world examples

## Live Input with `paramsSynchronizable`

Static `params` are re-uploaded whenever the React prop changes — fine for occasional updates, but the render loop runs **off-thread**, so routing fast, per-frame input (a finger drag, scroll progress, an audio level) through React props would be laggy and drop frames.

`paramsSynchronizable` solves this. It is a 4-float [Synchronizable](https://docs.swmansion.com/react-native-worklets/docs/synchronization/synchronizable) that the off-thread render loop reads on **every frame** and writes into its own dedicated `u.live` slot. Because it has its own slot, it never collides with the 8 static `params` — you keep the full `u.params0`/`u.params1` budget _and_ a live channel at the same time.

### 1. Create the channel with the hook

```tsx
import { ShaderView, useParamsSynchronizable } from 'react-native-effects';

function TouchReactive() {
  // `initial` seeds the resting value, read once: (x, y, active, extra)
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0.5, 0.5, 0, 0]);

  return (
    <ShaderView
      fragmentShader={MY_SHADER}
      paramsSynchronizable={paramsSynchronizable}
      style={{ width: '100%', height: 300 }}
      onTouchMove={(e) => {
        const { locationX, locationY } = e.nativeEvent;
        setParamsSynchronizable(locationX, locationY, 1, 0);
      }}
      onTouchEnd={() => setParamsSynchronizable(0, 0, 0, 0)}
    />
  );
}
```

`setParamsSynchronizable(x, y, active, extra)` runs on the JS thread — call it from gesture, scroll, or any event handler. The four floats are `(x, y, active, extra)` by convention for pointer input, or `(progress, …)` for scroll-driven effects, but the meaning is entirely up to your shader.

### 2. Read the live values in the shader

The values land in `u.live` — make sure your `Uniforms` struct declares the `live` field (it comes right after `params1`):

```wgsl
@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv      = ndc * 0.5 + 0.5;
  let pointer = u.live.xy;   // (x, y) you wrote from JS
  let active  = u.live.z;    // 1 while interacting, 0 otherwise

  let glow = (1.0 - distance(uv, pointer)) * active;
  return vec4<f32>(u.color0.rgb * glow, 1.0);
}
```

> **Note:** `u.live` is a separate slot, so all 8 static `params` (`u.params0` + `u.params1`) stay fully available alongside it.

For a ready-made pan-gesture wrapper that drives a `paramsSynchronizable` for you (with drag + momentum), see [`ShaderViewWithPanGesture`](src/components/ShaderViewWithPanGesture/index.tsx).

## AI Prompt for Generating Custom Effects

Copy and paste the prompt below into ChatGPT, Claude, or any AI assistant. Replace the placeholder description with your desired effect, and the AI will generate a complete component.

````
I want to create a custom shader effect component for react-native-effects. This library uses WebGPU (WGSL shaders) in React Native.

## What I want
[Describe your desired effect here — e.g., "A rain effect with droplets falling down the screen" or "A plasma/lava lamp effect with smooth color blending"]

## ShaderView API

ShaderView is a React Native component that renders a WGSL fragment shader. Props:
- `fragmentShader: string` — WGSL fragment shader source
- `colors?: ColorInput[]` — up to 2 colors mapped to u.color0 and u.color1 (normalized RGBA 0..1). Accepts hex strings, named colors, or numbers.
- `params?: number[]` — up to 8 floats mapped to u.params0.xyzw (indices 0-3) and u.params1.xyzw (indices 4-7)
- `speed?: number` — animation speed multiplier (default 1.0)
- `isStatic?: boolean` — render once then stop (default false)
- `transparent?: boolean` — clear the canvas to alpha 0 for a transparent background (default false)
- `paramsSynchronizable?: ParamsSynchronizable` — optional live 4-float input written into its own dedicated u.live slot every frame, independent of the static params (all 8 params stay available). Create it with the `useParamsSynchronizable` hook and update it from gesture/scroll handlers for touch-, scroll-, or audio-reactive effects.
- Also accepts all standard React Native View props (style, onLayout, etc.)

Import: `import { ShaderView } from 'react-native-effects';`
Color type import: `import type { ColorInput } from 'react-native-effects';`

## Uniform buffer layout (declare the fields you read, in this order)

```wgsl
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (elapsed_seconds, delta_time, 0, 0)
  color0:     vec4<f32>,  // colors[0] as RGBA 0..1
  color1:     vec4<f32>,  // colors[1] as RGBA 0..1
  params0:    vec4<f32>,  // params[0..3]
  params1:    vec4<f32>,  // params[4..7]
  live:       vec4<f32>,  // paramsSynchronizable channel (touch/scroll/audio); omit if unused
};
@group(0) @binding(0) var<uniform> u: Uniforms;
```

## Fragment shader contract

- Entry point: `@fragment fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32>`
- `ndc` is in Normalized Device Coordinates: both x and y range from -1 to 1
- Convert to UV (0..1) with: `let uv = ndc * 0.5 + 0.5;`
- `u.time.x` = elapsed seconds (already multiplied by speed prop)
- `u.resolution.xy` = canvas width and height in pixels
- `u.resolution.z` = aspect ratio (width/height)
- Return a vec4<f32> RGBA color

## React component pattern

```tsx
import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { ColorInput } from 'react-native-effects';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  color?: ColorInput;
  speed?: number;
  // ... your custom props
};

export default function MyEffect({
  color = '#defaultHex',
  speed = 1.0,
  // ... destructure your props with defaults
  ...viewProps
}: Props) {
  const colors = useMemo(() => [color], [color]);
  const params = useMemo(() => [/* your props mapped to floats */], [/* deps */]);

  return (
    <ShaderView
      fragmentShader={MY_SHADER}
      colors={colors}
      params={params}
      speed={speed}
      {...viewProps}
    />
  );
}

const MY_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  let time = u.time.x;
  // ... shader logic ...
  return vec4<f32>(col, 1.0);
}
`;
```

## Requirements
- Generate a COMPLETE, working component file (TypeScript + WGSL shader)
- Map all effect-specific props through `params` (max 8 floats) and `colors` (max 2)
- Use `useMemo` for colors and params arrays
- Spread `...viewProps` on ShaderView
- Define the shader as a module-level const
- The Uniforms struct must be declared exactly as shown above
- Use only WGSL syntax (not GLSL)
````
