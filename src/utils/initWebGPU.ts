import { scheduleOnRuntime, type WorkletRuntime } from 'react-native-worklets';

/**
 * Installs WebGPU globals on the given worklet runtime.
 *
 * Worklet runtimes run on a separate JS context that lacks browser-like globals.
 * This function captures WebGPU constants and `navigator.gpu` from the RN thread
 * and injects them into the worklet's `globalThis` so that WebGPU code can run
 * as if it were in a browser environment.
 *
 * @param runtime - The worklet runtime to initialize
 */
export function initWebGPU(runtime: WorkletRuntime) {
  const navigator = globalThis.navigator as NavigatorGPU;
  const GPUBufferUsage = globalThis.GPUBufferUsage;
  const GPUColorWrite = globalThis.GPUColorWrite;
  const GPUMapMode = globalThis.GPUMapMode;
  const GPUShaderStage = globalThis.GPUShaderStage;
  const GPUTextureUsage = globalThis.GPUTextureUsage;

  scheduleOnRuntime(runtime, () => {
    'worklet';

    if (globalThis.self) {
      return;
    }
    globalThis.self = globalThis;
    globalThis.navigator = { gpu: navigator.gpu } as unknown as Navigator;
    globalThis.GPUBufferUsage = GPUBufferUsage;
    globalThis.GPUColorWrite = GPUColorWrite;
    globalThis.GPUMapMode = GPUMapMode;
    globalThis.GPUShaderStage = GPUShaderStage;
    globalThis.GPUTextureUsage = GPUTextureUsage;
    globalThis.setImmediate =
      globalThis.requestAnimationFrame as typeof setImmediate;
  });
}

declare global {
  var self: typeof globalThis;
  var _WORKLET: boolean | undefined;
  var performance: { now(): number };

  interface Navigator {
    gpu: GPU;
  }
}
