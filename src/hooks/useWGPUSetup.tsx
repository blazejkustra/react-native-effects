import { PixelRatio, type LayoutChangeEvent } from 'react-native';
import {
  useCanvasRef,
  type CanvasRef,
  type RNCanvasContext,
} from 'react-native-webgpu';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type WorkletRuntime } from 'react-native-worklets';
import { BackgroundRuntime } from '../utils/backgroundRuntime';
import { getSharedGPUDevice } from '../utils/gpuDevice';

type GPUResources = {
  device: GPUDevice;
  context: RNCanvasContext;
  presentationFormat: GPUTextureFormat;
};

type CanvasWithSize = RNCanvasContext['canvas'] & {
  width: number;
  height: number;
};

type WGPUSetupResult = {
  canvasRef: React.RefObject<CanvasRef>;
  runtime: WorkletRuntime;
  resources: GPUResources | null;
  /** Wire to `<Canvas onLayout>` so the surface resizes on rotation/layout change. */
  onCanvasLayout: (event: LayoutChangeEvent) => void;
};

export function useWGPUSetup(): WGPUSetupResult {
  const canvasRef = useCanvasRef();
  const [resources, setResources] = useState<GPUResources | null>(null);
  const runtime = BackgroundRuntime;

  // Physical-pixel size the surface is currently configured for. Used to drive
  // resize (and to skip redundant reconfigures when the layout pass reports the
  // same size).
  const configuredSizeRef = useRef<{ width: number; height: number } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Shared across every ShaderView — see getSharedGPUDevice. Returns null if
      // no adapter is available.
      const device = await getSharedGPUDevice();
      if (!device || cancelled) {
        return;
      }

      const context = canvasRef.current!.getContext('webgpu')!;
      const canvas = context.canvas as CanvasWithSize;
      const dpr = PixelRatio.get();
      const width = Math.max(1, Math.round(canvas.width * dpr));
      const height = Math.max(1, Math.round(canvas.height * dpr));
      canvas.width = width;
      canvas.height = height;

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });
      configuredSizeRef.current = { width, height };

      if (!cancelled) {
        setResources({ device, context, presentationFormat });
      }
    })();

    return () => {
      cancelled = true;
      // The device is shared across all ShaderViews and lives for the JS
      // runtime's lifetime, so it must NOT be destroyed here. This view's own
      // GPU resources (the uniform buffer) are torn down by the render loop when
      // it stops; the pipeline/shader modules are released once the loop's
      // worklet closure is garbage-collected.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize the drawing buffer and reconfigure the surface whenever the view's
  // layout changes (most notably device rotation). Without this the buffer keeps
  // its original dimensions and the shader renders stretched / wrong-aspect. The
  // render loop reads `canvas.width/height` each frame, so the resolution uniform
  // picks up the new size on the next frame. No-op until GPU resources are ready
  // (initial sizing is handled by the setup effect above).
  const onCanvasLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!resources) {
        return;
      }
      const { width, height } = event.nativeEvent.layout;
      const dpr = PixelRatio.get();
      const w = Math.max(1, Math.round(width * dpr));
      const h = Math.max(1, Math.round(height * dpr));

      const prev = configuredSizeRef.current;
      if (prev && prev.width === w && prev.height === h) {
        return;
      }

      const canvas = resources.context.canvas as CanvasWithSize;
      canvas.width = w;
      canvas.height = h;
      resources.context.configure({
        device: resources.device,
        format: resources.presentationFormat,
        alphaMode: 'premultiplied',
      });
      configuredSizeRef.current = { width: w, height: h };
    },
    [resources]
  );

  return { canvasRef, runtime, resources, onCanvasLayout };
}
