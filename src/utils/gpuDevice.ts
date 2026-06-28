let devicePromise: Promise<GPUDevice | null> | null = null;

/**
 * Lazily requests a single GPUDevice shared by every ShaderView.
 *
 * Requesting an adapter + device per view is expensive (real GPU/memory cost and
 * slower init), and a screen that mounts several effects would otherwise spin up
 * N devices on the one background runtime. The promise is cached for the lifetime
 * of the JS runtime so every view awaits the same device.
 *
 * If the device is ever lost, the cache is cleared so the next ShaderView mount
 * requests a fresh one instead of awaiting a dead device forever.
 */
export function getSharedGPUDevice(): Promise<GPUDevice | null> {
  if (devicePromise) {
    return devicePromise;
  }

  const promise = (async () => {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return null;
    }

    const device = await adapter.requestDevice();
    device.lost?.then(() => {
      // Only clear if we're still the cached promise, so we don't clobber a
      // newer device that a later mount may already have requested.
      if (devicePromise === promise) {
        devicePromise = null;
      }
    });
    return device;
  })();

  devicePromise = promise;
  return promise;
}
