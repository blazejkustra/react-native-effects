import { PixelRatio } from 'react-native';
import {
  useCanvasRef,
  type CanvasRef,
  type RNCanvasContext,
} from 'react-native-wgpu';
import { useEffect, useState } from 'react';
import type { WorkletRuntime } from 'react-native-worklets';
import { initWebGPU } from '../utils/initWebGPU';
import { BackgroundRuntime } from '../utils/backgroundRuntime';

type GPUResources = {
  device: GPUDevice;
  context: RNCanvasContext;
  presentationFormat: GPUTextureFormat;
};

type WGPUSetupResult = {
  canvasRef: React.RefObject<CanvasRef>;
  runtime: WorkletRuntime;
  resources: GPUResources | null;
};

export function useWGPUSetup(): WGPUSetupResult {
  const canvasRef = useCanvasRef();
  const [resources, setResources] = useState<GPUResources | null>(null);
  const runtime = BackgroundRuntime;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter || cancelled) {
        return;
      }

      const device = await adapter.requestDevice();
      if (cancelled) {
        return;
      }

      const context = canvasRef.current!.getContext('webgpu')!;
      const canvas = context.canvas as typeof context.canvas & {
        width: number;
        height: number;
      };
      const dpr = PixelRatio.get();
      canvas.width = canvas.width * dpr;
      canvas.height = canvas.height * dpr;

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });

      initWebGPU(runtime);

      if (!cancelled) {
        setResources({ device, context, presentationFormat });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { canvasRef, runtime, resources };
}
