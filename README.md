# react-native-effects

WebGPU shader effects for React Native. Drop in a component, or write your own effect in WGSL. Rendering runs on a separate JS runtime, so a busy JS thread does not stall the animation.

<p align="center">
  <img src="docs/media/demo.webp" alt="The example app: the effects catalog, Lava Lamp, Liquid Chrome, Dust, Bubble Wrap, Ferrofluid, Instant Camera and CRT Off" width="300">
</p>

> **Experimental.** APIs may change without notice. The library relies on `react-native-worklets` bundle mode, which is off by default for now.

## Quick look

```tsx
import { StyleSheet } from 'react-native';
import { Aurora } from 'react-native-effects';

export function Background() {
  return <Aurora style={StyleSheet.absoluteFill} color="#4ade80" layers={3} />;
}
```

Effects accept standard `View` props, so they size and layer like any other view.

## Installation

```sh
npm install react-native-effects
npm install react-native-webgpu react-native-worklets react-native-gesture-handler
```

Then complete the two steps below. The example app runs on React Native 0.88, Expo 58, `react-native-webgpu` 0.17 and `react-native-worklets` 0.13.

### Android API level

`react-native-webgpu` uses `AHardwareBuffer` APIs that require **Android API 26+**, and many templates default to 24. In a bare project, set `minSdkVersion = 26` in `android/build.gradle`. In Expo, use [`expo-build-properties`](https://docs.expo.dev/versions/latest/sdk/build-properties/):

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
    ]
  }
}
```

### Bundle mode

The library needs `react-native-worklets` [Bundle Mode](https://docs.swmansion.com/react-native-worklets/docs/bundleMode). Enable it in Babel and Metro:

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
const { getDefaultConfig } = require('@react-native/metro-config');
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

Install the additional dev dependencies:

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

Release builds on Expo also need the `require.getModules` polyfill: copy [`metro-get-modules-polyfill.js`](example/metro-get-modules-polyfill.js) and register it the way [`example/metro.config.js`](example/metro.config.js) does.

</details>

## Effects

The package exports eight ready-made components. Colors are `ColorInput` values: color strings or numbers.

### Animated backgrounds

All of these take `color` and `speed` (a multiplier, default `1.0`), plus:

| Component      | Looks like                          | Extra props                                    |
| -------------- | ----------------------------------- | ---------------------------------------------- |
| `Aurora`       | Northern lights                     | `intensity`, `layers` (1-5), `waviness`        |
| `CalicoSwirl`  | Warped noise with flowing colors    | `intensity`                                    |
| `Campfire`     | Fire with drifting sparks and smoke | `sparkSize`, `fireIntensity`, `smokeIntensity` |
| `Iridescence`  | Soap-film color                     | none                                           |
| `LiquidChrome` | Fluid metallic surface              | `amplitude`, `frequencyX`, `frequencyY`        |
| `Silk`         | Smooth flowing fabric               | `scale`, `rotation`, `noiseIntensity`          |

### Gradients

```tsx
import { CircularGradient, LinearGradient } from 'react-native-effects';

<LinearGradient
  style={{ width: '100%', height: 200 }}
  startColor="#ff0000"
  endColor="#0000ff"
  angle={45}
/>

<CircularGradient
  style={{ width: 200, height: 200 }}
  centerColor="#ff0000"
  edgeColor="#0000ff"
/>
```

| Component          | Required props                    | Optional props                                      |
| ------------------ | --------------------------------- | --------------------------------------------------- |
| `LinearGradient`   | `startColor`, `endColor`, `angle` | `speed` in degrees per second, `0` is static        |
| `CircularGradient` | `centerColor`                     | `edgeColor`, `centerX`, `centerY`, `sizeX`, `sizeY` |

## Build your own

Every effect above is a thin wrapper around `ShaderView`, which takes a WGSL fragment shader and handles the WebGPU canvas, render loop and uniform buffer.

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

| Prop                   | Type                   | Default | Description                                                          |
| ---------------------- | ---------------------- | ------- | -------------------------------------------------------------------- |
| `fragmentShader`       | `string`               | none    | WGSL fragment shader source                                          |
| `colors`               | `ColorInput[]`         | `[]`    | Up to 2 colors, mapped to `u.color0` and `u.color1`                  |
| `params`               | `number[]`             | `[]`    | Up to 8 floats, mapped to `u.params0.xyzw` and `u.params1.xyzw`      |
| `speed`                | `number`               | `1.0`   | Animation speed multiplier                                           |
| `isStatic`             | `boolean`              | `false` | Render once, then stop the animation loop                            |
| `transparent`          | `boolean`              | `false` | Clear to alpha `0`, for overlays                                     |
| `texture`              | `ImageSourcePropType`  | none    | Image the shader can sample, for effects on top of real photos       |
| `paramsSynchronizable` | `ParamsSynchronizable` | none    | Live floats written to `u.live` every frame, independent of `params` |

### Live input

React props are too slow for per-frame input such as a finger drag or an audio level. `ShaderViewWithPanGesture` feeds touch straight to the render loop: `u.live.xy` is the pointer in UV space and `u.live.z` is `1` while touching.

```tsx
import { ShaderViewWithPanGesture } from 'react-native-effects';

<ShaderViewWithPanGesture
  fragmentShader={myShader}
  initialParamsSynchronizable={[0.5, 0.5, 0, 0]}
  style={{ width: '100%', height: 300 }}
/>;
```

For scroll, audio or any other source, create your own channel with `useParamsSynchronizable` and pass it as `paramsSynchronizable`.

The [Custom Effects Guide](CUSTOM_EFFECTS.md) covers the uniform layout, the shader contract and live input in full, and includes a prompt you can paste into an AI assistant to generate an effect.

## Example app

The clip above is the [example app](example), a catalog of 45 effects built with `ShaderView`. Most of them, including everything in the clip except Liquid Chrome, are demos in `example/src`. The package does not export them, so treat them as source to copy from. Many react to tilt, touch, sound or the magnetometer.

```sh
yarn install
yarn example prebuild
yarn example ios      # or: yarn example android
```

Use `yarn example prebuild:clean` to start fresh after config changes. The app's photo and software credits are in [docs/credits.md](docs/credits.md).

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
