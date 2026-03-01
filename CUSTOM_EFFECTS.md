# Custom Effects Guide

This guide explains how to create your own shader effects using `ShaderView`, the core component behind every effect in `react-native-effects`.

## How ShaderView Works

`ShaderView` renders a WGSL fragment shader on a WebGPU canvas. It handles the render loop, uniform buffer, and React Native view integration. You provide:

- A **WGSL fragment shader** string
- Up to **2 colors** (mapped to `u.color0`, `u.color1`)
- Up to **8 float parameters** (mapped to `u.params0.xyzw`, `u.params1.xyzw`)
- A **speed** multiplier for animation
- An optional **isStatic** flag to render once and stop

### Props

| Prop             | Type           | Default | Description                                                           |
| ---------------- | -------------- | ------- | --------------------------------------------------------------------- |
| `fragmentShader` | `string`       | —       | WGSL fragment shader source (must declare the `Uniforms` struct)      |
| `colors`         | `ColorInput[]` | `[]`    | Up to 2 colors — accepts hex strings, named colors, or numeric values |
| `params`         | `number[]`     | `[]`    | Up to 8 shader-specific floats                                        |
| `speed`          | `number`       | `1.0`   | Time multiplier for animation speed                                   |
| `isStatic`       | `boolean`      | `false` | Render once then stop the animation loop                              |

`ShaderView` also accepts all standard React Native `View` props (`style`, `onLayout`, etc.).

## Uniform Buffer Layout

Every shader must declare this exact uniform struct:

```wgsl
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (seconds, dt, 0, 0)
  color0:     vec4<f32>,  // colors[0] as normalized RGBA (0..1)
  color1:     vec4<f32>,  // colors[1] as normalized RGBA (0..1)
  params0:    vec4<f32>,  // params[0], params[1], params[2], params[3]
  params1:    vec4<f32>,  // params[4], params[5], params[6], params[7]
};
@group(0) @binding(0) var<uniform> u: Uniforms;
```

### Field Reference

| Field          | Components                                                           | Description                   |
| -------------- | -------------------------------------------------------------------- | ----------------------------- |
| `u.resolution` | `.x` = width, `.y` = height, `.z` = aspect ratio, `.w` = pixel ratio | Canvas dimensions             |
| `u.time`       | `.x` = elapsed seconds (speed-adjusted), `.y` = delta time           | Animation timing              |
| `u.color0`     | `.rgba`                                                              | First color, normalized 0..1  |
| `u.color1`     | `.rgba`                                                              | Second color, normalized 0..1 |
| `u.params0`    | `.xyzw` = params[0..3]                                               | First 4 custom parameters     |
| `u.params1`    | `.xyzw` = params[4..7]                                               | Last 4 custom parameters      |

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
- Also accepts all standard React Native View props (style, onLayout, etc.)

Import: `import { ShaderView } from 'react-native-effects';`
Color type import: `import type { ColorInput } from 'react-native-effects';`

## Uniform buffer layout (must be declared exactly like this in every shader)

```wgsl
struct Uniforms {
  resolution: vec4<f32>,  // (width, height, aspect, pixelRatio)
  time:       vec4<f32>,  // (elapsed_seconds, delta_time, 0, 0)
  color0:     vec4<f32>,  // colors[0] as RGBA 0..1
  color1:     vec4<f32>,  // colors[1] as RGBA 0..1
  params0:    vec4<f32>,  // params[0..3]
  params1:    vec4<f32>,  // params[4..7]
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
