import { PixelRatio, type LayoutChangeEvent } from 'react-native';
import {
  useCanvasRef,
  type CanvasRef,
  type RNCanvasContext,
} from 'react-native-webgpu';
import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleOnRuntime, type WorkletRuntime } from 'react-native-worklets';
import { BackgroundRuntime } from '../utils/backgroundRuntime';
import { warnIfNotHardwareAccelerated } from '../utils/warnIfNotHardwareAccelerated';

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
  // Kept so the device can be released on unmount.
  const deviceRef = useRef<GPUDevice | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter || cancelled) {
        return;
      }

      // Surface the "software adapter = slow" footgun (most notably SwiftShader
      // on Android emulators) once, during development.
      warnIfNotHardwareAccelerated(adapter);

      const device = await adapter.requestDevice();
      if (cancelled) {
        // Unmounted mid-init: the worklet never used this device, so it's safe
        // to drop it right here on the JS thread.
        device.destroy();
        return;
      }
      deviceRef.current = device;

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
      const device = deviceRef.current;
      deviceRef.current = null;
      if (device) {
        // Release the device (and all GPU resources created from it: pipeline,
        // buffers, ...) on the render runtime — the thread that used it — after
        // the render loop has been signalled to stop, so we don't race an
        // in-flight frame. Any frame that does slip through hits a destroyed
        // device and is swallowed by the render loop's try/catch.
        scheduleOnRuntime(runtime, () => {
          'worklet';
          device.destroy();
        });
      }
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
