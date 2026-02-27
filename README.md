# react-native-effects

> **Experimental** — APIs may change without notice. Relies on `react-native-worklets` bundle mode, which is not yet stable. Use with caution.

WebGPU-powered effects running on UI thread in React Native. Beautiful, animated shader effects as drop-in components.

## Features

- **WebGPU rendering** via `react-native-wgpu`
- **Off-thread rendering** using `react-native-worklets` bundle mode — the GPU render loop runs on a separate JS runtime, keeping the main thread free
- **Drop-in components** — use like any React Native `View`
- **Customizable** — control colors, speed, intensity, and effect-specific parameters
- **Animated & static** modes for gradients
- **Build your own** — create custom effects with `ShaderView` and WGSL shaders

## Components

| Component | Description |
|-----------|-------------|
| `Iridescence` | Mesmerizing iridescent animated effect |
| `LiquidChrome` | Fluid metallic surface |
| `Silk` | Smooth flowing silk fabric |
| `Campfire` | Fire with drifting sparks and smoke |
| `CalicoSwirl` | Warped noise pattern with flowing colors |
| `Aurora` | Northern lights with flowing curtains of light |
| `LinearGradient` | Smooth linear gradients (static & animated) |
| `CircularGradient` | Customizable circular/radial gradients |

## ShaderView

`ShaderView` is the core building block that powers every effect in this library. It takes a WGSL fragment shader and renders it on a WebGPU canvas, handling the render loop, uniform buffer, and React Native view integration for you.

```tsx
import { ShaderView } from 'react-native-effects';

<ShaderView
  fragmentShader={myShader}
  colors={['#ff0000', '#0000ff']}
  params={[1.0, 0.5]}
  speed={1.0}
  style={{ width: '100%', height: 300 }}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fragmentShader` | `string` | — | WGSL fragment shader source |
| `colors` | `ColorInput[]` | `[]` | Up to 2 colors mapped to `u.color0` and `u.color1` |
| `params` | `number[]` | `[]` | Up to 8 floats mapped to `u.params0.xyzw` and `u.params1.xyzw` |
| `speed` | `number` | `1.0` | Animation speed multiplier |
| `isStatic` | `boolean` | `false` | Render once then stop the animation loop |

All built-in effects (Silk, Aurora, Campfire, etc.) are thin wrappers around `ShaderView`. You can use it directly to create your own custom effects — see the [Custom Effects Guide](CUSTOM_EFFECTS.md) for a full walkthrough and a ready-to-use AI prompt.

## Installation

```sh
npm install react-native-effects
```

### Peer dependencies

```sh
npm install react-native-wgpu react-native-worklets react-native-reanimated react-native-gesture-handler
```

### Bundle mode setup

This library relies on `react-native-worklets` [Bundle Mode](https://docs.swmansion.com/react-native-worklets/docs/bundleMode). You need to configure Metro and Babel in your app:

**babel.config.js**

```js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['react-native-worklets/plugin', { bundleMode: true, strictGlobal: true }],
  ],
};
```

**metro.config.js**

```js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { bundleModeMetroConfig } = require('react-native-worklets/bundleMode');

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  bundleModeMetroConfig
);
```

**package.json** (add at root level)

```json
{
  "worklets": {
    "staticFeatureFlags": {
      "BUNDLE_MODE_ENABLED": true,
      "FETCH_PREVIEW_ENABLED": true
    }
  }
}
```

## Usage

```tsx
import { Iridescence, LiquidChrome, Aurora } from 'react-native-effects';

// Full-screen animated background
<Iridescence style={StyleSheet.absoluteFillObject} />

// Metallic effect with custom speed
<LiquidChrome style={{ width: '100%', height: 300 }} speed={1.5} />

// Aurora borealis with custom parameters
<Aurora
  style={StyleSheet.absoluteFillObject}
  color="#4ade80"
  speed={1.0}
  intensity={1.0}
  layers={3}
  waviness={1.0}
/>
```

### Common Props

All shader components accept standard `View` props plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `string \| number` | varies | Base tint color |
| `speed` | `number` | `1.0` | Animation speed multiplier |

### Aurora

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `intensity` | `number` | `1.0` | Brightness of the aurora bands |
| `layers` | `number` | `3` | Number of curtain layers (1-5) |
| `waviness` | `number` | `1.0` | Turbulence of the curtains |

### Gradients

```tsx
import { LinearGradient, CircularGradient } from 'react-native-effects';

<LinearGradient
  style={{ width: '100%', height: 200 }}
  colors={['#ff0000', '#0000ff']}
  angle={45}
/>

<CircularGradient
  style={{ width: 200, height: 200 }}
  colors={['#ff0000', '#0000ff']}
/>
```

## Create Your Own Effect

Want to build a custom shader effect? Check out the [Custom Effects Guide](CUSTOM_EFFECTS.md) — it includes everything you need to know about the `ShaderView` API, the uniform layout, and the WGSL shader contract. It also has a ready-to-use AI prompt you can paste into ChatGPT or Claude to generate a complete custom effect.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
