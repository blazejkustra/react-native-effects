let warned = false;

// Substrings that identify a CPU/software WebGPU adapter, matched
// case-insensitively against the adapter's reported info. The iOS simulator
// reports "Apple iOS simulator GPU" / "Metal driver" and is intentionally NOT
// matched — it renders through the host's real GPU.
const SOFTWARE_ADAPTER_HINTS = [
  'swiftshader', // Android emulator default; Chrome's software fallback
  'llvmpipe', // Mesa software GL
  'lavapipe', // Mesa software Vulkan
  'microsoft basic render', // Windows WARP
  'basic render driver',
  'software',
];

/**
 * Logs a one-time dev warning when WebGPU resolved to a software (CPU) adapter
 * instead of a real GPU. This is the classic "why is my shader at 5fps" footgun
 * on Android emulators, which commonly default to SwiftShader.
 *
 * No-op in production and on hardware-accelerated adapters (including the iOS
 * simulator, which renders via the host's Metal GPU).
 */
export function warnIfNotHardwareAccelerated(adapter: GPUAdapter): void {
  if (warned || !__DEV__) {
    return;
  }

  const info = adapter.info;
  const fingerprint = [
    info?.vendor,
    info?.architecture,
    info?.device,
    info?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // `isFallbackAdapter` is part of the WebGPU spec but not surfaced by
  // react-native-webgpu's types (and undefined at runtime there), so read it
  // defensively in case a future/other backend does report it.
  const isFallback =
    (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter === true;

  const isSoftware =
    isFallback ||
    SOFTWARE_ADAPTER_HINTS.some((hint) => fingerprint.includes(hint));

  if (!isSoftware) {
    return;
  }

  warned = true;
  console.warn(
    `[react-native-effects] WebGPU is using a software (CPU) adapter${
      fingerprint ? ` — "${fingerprint.trim()}"` : ''
    }. Shader effects will run slowly. This is expected on most emulators; ` +
      'test performance on a physical device with a real GPU.'
  );
}
