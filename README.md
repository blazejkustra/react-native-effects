# react-native-effects

https://github.com/user-attachments/assets/5141208a-655a-4de8-94fb-3e66351bf36f

> **Experimental** — APIs may change without notice. Relies on `react-native-worklets` bundle mode, which is not enabled by default yet.

WebGPU-powered effects running on **background thread** in React Native.

## Features

- **WebGPU rendering** via `react-native-webgpu`
- **Off-thread rendering** using `react-native-worklets` bundle mode — the GPU render loop runs on a separate JS runtime, keeping the main thread free
- **Drop-in components** — use like any React Native `View`
- **Customizable** — control colors, speed, intensity, and effect-specific parameters
- **Animated & static** modes for gradients
- **Build your own** — create custom effects with `ShaderView` and WGSL shaders

## Components

| Component          | Description                                    |
| ------------------ | ---------------------------------------------- |
| `Iridescence`      | Mesmerizing iridescent animated effect         |
| `LiquidChrome`     | Fluid metallic surface                         |
| `Silk`             | Smooth flowing silk fabric                     |
| `Campfire`         | Fire with drifting sparks and smoke            |
| `CalicoSwirl`      | Warped noise pattern with flowing colors       |
| `Aurora`           | Northern lights with flowing curtains of light |
| `LinearGradient`   | Smooth linear gradients (static & animated)    |
| `CircularGradient` | Customizable circular/radial gradients         |

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
/>;
```

| Prop                   | Type                   | Default | Description                                                                                             |
| ---------------------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `fragmentShader`       | `string`               | —       | WGSL fragment shader source                                                                             |
| `colors`               | `ColorInput[]`         | `[]`    | Up to 2 colors mapped to `u.color0` and `u.color1`                                                      |
| `params`               | `number[]`             | `[]`    | Up to 8 floats mapped to `u.params0.xyzw` and `u.params1.xyzw`                                          |
| `speed`                | `number`               | `1.0`   | Animation speed multiplier                                                                              |
| `isStatic`             | `boolean`              | `false` | Render once then stop the animation loop                                                                |
| `transparent`          | `boolean`              | `false` | Clear the canvas to alpha `0` for an overlay-friendly transparent background                            |
| `paramsSynchronizable` | `ParamsSynchronizable` | —       | Live 4-float input written into the dedicated `u.live` slot every frame (touch/scroll/audio). See below |

All built-in effects (Silk, Aurora, Campfire, etc.) are thin wrappers around `ShaderView`. You can use it directly to create your own custom effects — see the [Custom Effects Guide](CUSTOM_EFFECTS.md) for a full walkthrough and a ready-to-use AI prompt.

### Live input with `paramsSynchronizable`

Static `params` are great for values that change on the JS thread occasionally, but the render loop runs off-thread — so feeding it fast, per-frame input (a finger drag, scroll progress, audio level) through React props would be laggy. `paramsSynchronizable` is the bridge: a 4-float [Synchronizable](https://docs.swmansion.com/react-native-worklets/docs/synchronization/synchronizable) that the off-thread render loop reads every frame and writes into its own dedicated `u.live` slot — so it never collides with the static `params` (you keep all 8 _and_ get a live channel).

Create one with the `useParamsSynchronizable` hook and update it from your gesture or scroll handlers:

```tsx
import { ShaderView, useParamsSynchronizable } from 'react-native-effects';

function TouchReactive() {
  // initial resting value, read once: (x, y, active, extra)
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0.5, 0.5, 0, 0]);

  return (
    <ShaderView
      fragmentShader={myShader}
      paramsSynchronizable={paramsSynchronizable}
      style={{ width: '100%', height: 300 }}
      onTouchMove={(e) => {
        const { locationX, locationY } = e.nativeEvent;
        setParamsSynchronizable(locationX, locationY, 1, 0);
      }}
    />
  );
}
```

Inside the shader, declare the `live` field on the `Uniforms` struct (right after `params1`) and read the live values from `u.live`:

```wgsl
let pointer = u.live.xy;   // (x, y) you wrote
let active  = u.live.z;    // 1 while touching, 0 otherwise
```

`setParamsSynchronizable(x, y, active, extra)` runs on the JS thread; the four floats are by convention `(x, y, active, extra)` for pointer input or `(progress, …)` for scroll-driven effects, but the meaning is entirely up to your shader. For a ready-made pan-gesture variant, use [`ShaderViewWithPanGesture`](src/components/ShaderViewWithPanGesture/index.tsx).

## Installation

```sh
npm install react-native-effects
```

### Peer dependencies

```sh
npm install react-native-webgpu react-native-worklets react-native-reanimated react-native-gesture-handler
```

### Android requirements

`react-native-webgpu` uses `AHardwareBuffer` APIs that require **Android API 26+**, so your app must set `minSdkVersion` to at least `26` (the default in many templates is `24`). In an Expo project, use [`expo-build-properties`](https://docs.expo.dev/versions/latest/sdk/build-properties/):

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
    ]
  }
}
```

In a bare React Native project, set `minSdkVersion = 26` in `android/build.gradle`.

### Bundle mode setup

This library relies on `react-native-worklets` [Bundle Mode](https://docs.swmansion.com/react-native-worklets/docs/bundleMode). You need to configure Metro, Babel, and package.json in your app.

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

<details>
<summary><strong>Bare React Native</strong></summary>

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
const {
  getBundleModeMetroConfig,
} = require('react-native-worklets/bundleMode');

let config = getDefaultConfig(__dirname);
config = getBundleModeMetroConfig(config);

// CRITICAL: Enable inlineRequires for worklets compatibility
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      inlineRequires: true,
    },
  }),
};

module.exports = config;
```

</details>

<details>
<summary><strong>Expo</strong></summary>

Install additional dev dependencies:

```sh
npm install -D babel-preset-expo @react-native/metro-config
```

**babel.config.js**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-worklets/plugin',
        { bundleMode: true, strictGlobal: true },
      ],
    ],
  };
};
```

**metro.config.js**

```js
const { getDefaultConfig } = require('expo/metro-config');
const {
  getBundleModeMetroConfig,
} = require('react-native-worklets/bundleMode');

/** @type {import('expo/metro-config').MetroConfig} */
let config = getDefaultConfig(__dirname);
config = getBundleModeMetroConfig(config);

// CRITICAL: Enable inlineRequires for worklets compatibility in Expo
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      inlineRequires: true,
    },
  }),
};

module.exports = config;
```

</details>

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

| Prop    | Type               | Default | Description                |
| ------- | ------------------ | ------- | -------------------------- |
| `color` | `string \| number` | varies  | Base tint color            |
| `speed` | `number`           | `1.0`   | Animation speed multiplier |

### Aurora

| Prop        | Type     | Default | Description                    |
| ----------- | -------- | ------- | ------------------------------ |
| `intensity` | `number` | `1.0`   | Brightness of the aurora bands |
| `layers`    | `number` | `3`     | Number of curtain layers (1-5) |
| `waviness`  | `number` | `1.0`   | Turbulence of the curtains     |

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

## Running the example app

```sh
yarn install
yarn prebuild        # generates native iOS/Android projects
yarn ios             # run on iOS simulator
yarn android         # run on Android emulator
```

To start fresh after config changes, use `yarn prebuild:clean` instead of `yarn prebuild`.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
