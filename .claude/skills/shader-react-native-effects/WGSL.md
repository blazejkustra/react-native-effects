# ShaderView WGSL Contract

Source of truth: `src/shaders/uniforms.ts`, `src/components/ShaderView/types.ts`, `CUSTOM_EFFECTS.md`.

## Props

| Prop                   | Type                   | Default | Notes                                                                                                           |
| ---------------------- | ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `fragmentShader`       | `string`               | —       | WGSL source; must declare the `Uniforms` struct                                                                 |
| `colors`               | `ColorInput[]`         | `[]`    | Max 2 → `u.color0`, `u.color1`. Hex string/number, `rgb()`, `rgba()`, named CSS colors. Normalized to RGBA 0..1 |
| `params`               | `number[]`             | `[]`    | Max 8 floats → `u.params0.xyzw`, `u.params1.xyzw`. Missing = 0.0                                                |
| `speed`                | `number`               | `1.0`   | Time multiplier; `u.time.x` is already speed-adjusted                                                           |
| `isStatic`             | `boolean`              | `false` | Render one frame, stop the rAF loop entirely                                                                    |
| `transparent`          | `boolean`              | `false` | Clear to alpha 0; output must be **premultiplied**                                                              |
| `paramsSynchronizable` | `ParamsSynchronizable` | —       | Live float channel (4 up to 388 floats) → `u.live` + `u.liveData`, read every frame off-thread                  |

Plus all standard `ViewProps` (`style`, `onLayout`, `onTouchMove`, ...).

## Uniform buffer (1648 bytes = (7 + 96) × vec4<f32>)

Declare fields **top-down in this exact order**; you may stop after the last field you read (e.g. omit `live` if unused — most shaders stop at `live` or earlier).

```wgsl
struct Uniforms {
  resolution: vec4<f32>,  // (width_px, height_px, aspect = w/h, devicePixelRatio)
  time:       vec4<f32>,  // (elapsed seconds × speed, delta time, 0, 0)
  color0:     vec4<f32>,  // colors[0] RGBA 0..1
  color1:     vec4<f32>,  // colors[1] RGBA 0..1
  params0:    vec4<f32>,  // params[0..3]
  params1:    vec4<f32>,  // params[4..7]
  live:       vec4<f32>,  // paramsSynchronizable[0..3]; (0,0,0,0) when unused
  liveData:   array<vec4<f32>, 96>,  // paramsSynchronizable[4..387] for long channels (trails, multi-touch)
};
@group(0) @binding(0) var<uniform> u: Uniforms;
```

## Entry point

```wgsl
@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;
  // ...
  return vec4<f32>(r, g, b, a);
}
```

- `ndc` ∈ [-1, 1] on both axes; `uv = ndc * 0.5 + 0.5` gives 0..1.
- **UV origin is bottom-left; `uv.y` increases UPWARD** (standard shader space, opposite of screen coordinates). Porting from screen-space logic: `let suv = vec2<f32>(uv.x, 1.0 - uv.y);`
- Aspect-corrected centered coords (circles stay round): `let c = (uv - 0.5) * vec2<f32>(u.resolution.z, 1.0);`
- Opaque mode: straight RGBA. `transparent` mode: **premultiplied** — `vec4<f32>(col * alpha, alpha)`.
- No textures, no samplers, no extra bindings — everything is procedural from the one uniform buffer.

## Live input (`paramsSynchronizable` → `u.live`)

For anything updating faster than ~once a second (touch, scroll, audio level, tilt). Has its own slots — all 8 static params stay available alongside it. The channel length is fixed by the `initial` array passed to the hook (min 4, max 388 floats): floats 0..3 land in `u.live`, floats 4+ fill `u.liveData` vec4-by-vec4 — seed a longer `initial` for trail / multi-point effects (see `example/src/components/materials/SandMaterial.tsx`). The setter takes varargs and replaces the whole channel.

```tsx
import { ShaderView, useParamsSynchronizable } from 'react-native-effects';

const { paramsSynchronizable, setParamsSynchronizable } =
  useParamsSynchronizable([0.5, 0.5, 0, 0]); // initial, read once

<ShaderView
  fragmentShader={SHADER}
  paramsSynchronizable={paramsSynchronizable}
  onTouchMove={(e) => {
    const { locationX, locationY } = e.nativeEvent;
    setParamsSynchronizable(locationX, locationY, 1, 0);
  }}
  onTouchEnd={() => setParamsSynchronizable(0, 0, 0, 0)}
/>;
```

Conventions used in this repo: pointer `(x, y, isActive, extra)`, scroll `(progress, 0, 0, 0)`, audio `(level, ...)`, tilt `(tiltX, tiltY, active, 0)` with 0.5 = flat. Touch coordinates from `nativeEvent` are in **points with y-down** — normalize by view size and flip y before comparing to `uv`. Smooth jittery sources (audio) on the JS side before writing; the shader sees raw values. For drag + momentum, use `ShaderViewWithPanGesture` from the library.

## Reserved words that silently kill the shader

A WGSL compile error produces a **blank canvas with no exception**. These innocent-looking names are reserved and have all bitten or will bite:

```
active  auto  filter  final  new  target  mod  type  set  get  self
common  smooth  precise  static  attribute  layout  meta  module
match  ref  pub  pass  patch  resource  shared  std  super  this
```

When a shader renders nothing, rename suspect identifiers FIRST (e.g. `active` → `isActive`, `filter` → `flt`). `u.live.z` conventionally carries an "active" flag — name the local `isActive`.

## GLSL → WGSL translation table

| GLSL                                                      | WGSL                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| `cond ? a : b`                                            | `select(b, a, cond)` — note arg order: (false, true, cond) |
| `vec2(x)` / `vec3(1.0)`                                   | `vec2<f32>(x)` / `vec3<f32>(1.0)`                          |
| `mat2(a,b,c,d)`                                           | `mat2x2<f32>(a,b,c,d)`                                     |
| `float x = 1;`                                            | `let x = 1.0;` — no implicit int→float, ever               |
| mutable local                                             | `var x = ...;` (`let` is immutable)                        |
| `for (int i=0; i<4; i++)`                                 | `for (var i = 0; i < 4; i++)`                              |
| `atan(y, x)`                                              | `atan2(y, x)`                                              |
| `mod(x, y)`                                               | `x % y` (f32 ok) — `mod` is reserved                       |
| `p.xy = q;` (swizzle write)                               | illegal — assign whole vector or components singly         |
| `fract`, `mix`, `clamp`, `smoothstep`, `dot`, `normalize` | same names, same behavior                                  |
| `texture2D(...)`                                          | not available in ShaderView — go procedural                |

Casts are explicit: `f32(i)`, `i32(x)`, `u32(x)`. Function parameters are immutable — copy to a `var` to mutate (`fn fbm(p0: vec2<f32>) { var p = p0; ... }`).
