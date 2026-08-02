import { AppState, PixelRatio, StyleSheet } from 'react-native';
import { Canvas, installWebGPU } from 'react-native-webgpu';
import { useEffect, useRef, useState } from 'react';
import { createSynchronizable, scheduleOnRuntime } from 'react-native-worklets';
import { colorToVec4 } from '../../utils/colors';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import {
  LIVE_FLOAT_COUNT,
  UNIFORM_BUFFER_SIZE,
  UNIFORM_FLOAT_COUNT,
} from '../../shaders/uniforms';
import type { ShaderViewProps } from './types';

// Synchronizable layout: [c0r,c0g,c0b,c0a, c1r,c1g,c1b,c1a, speed, p0..p7, alive]
// Total: 4 + 4 + 1 + 8 + 1 = 18 floats
const SYNC_SIZE = 18;
const IDX_SPEED = 8;
const IDX_PARAMS = 9; // 9..16
const IDX_ALIVE = 17;

export default function ShaderView({
  fragmentShader,
  colors = [],
  speed = 1.0,
  params = [],
  isStatic = false,
  transparent = false,
  paramsSynchronizable,
  style,
  ...viewProps
}: ShaderViewProps) {
  const { canvasRef, runtime, resources, onCanvasLayout } = useWGPUSetup();

  // Pause the render loop while the app is backgrounded. The rAF loop otherwise
  // keeps churning frames against a surface that's offscreen (and often
  // transiently invalid), wasting battery/GPU. We only pause on a true
  // 'background' transition — iOS 'inactive' (app switcher peek, notification
  // pulldown) is left running to avoid flicker on brief, foreground interruptions.
  const [appActive, setAppActive] = useState(
    () => (AppState.currentState ?? 'active') !== 'background'
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state !== 'background');
    });
    return () => subscription.remove();
  }, []);

  const propsSync = useRef(
    createSynchronizable<Float64Array>(new Float64Array(SYNC_SIZE))
  ).current;

  // Convert props to flat floats and push to synchronizable
  useEffect(() => {
    const data = new Float64Array(SYNC_SIZE);

    // color0 (indices 0-3)
    if (colors[0] !== undefined) {
      const c0 = colorToVec4(colors[0]);
      data[0] = c0.r;
      data[1] = c0.g;
      data[2] = c0.b;
      data[3] = c0.a;
    }

    // color1 (indices 4-7)
    if (colors[1] !== undefined) {
      const c1 = colorToVec4(colors[1]);
      data[4] = c1.r;
      data[5] = c1.g;
      data[6] = c1.b;
      data[7] = c1.a;
    }

    // speed
    data[IDX_SPEED] = speed;

    // params (indices 9-16)
    for (let i = 0; i < 8; i++) {
      data[IDX_PARAMS + i] = params[i] ?? 0;
    }

    // alive
    data[IDX_ALIVE] = 1;

    propsSync.setBlocking(() => data);
  }, [colors, speed, params, propsSync]);

  // Signal cleanup on unmount
  useEffect(() => {
    return () => {
      propsSync.setBlocking((prev) => {
        prev[IDX_ALIVE] = 0;
        return prev;
      });
    };
  }, [propsSync]);

  // Start render loop when GPU resources are ready and the app is foregrounded.
  // When the app backgrounds, `appActive` flips false and this effect's cleanup
  // tears the loop down (via the `cancelled` token below); on return to the
  // foreground it re-runs and starts a fresh loop.
  useEffect(() => {
    if (!resources || !appActive) {
      return;
    }

    const { device, context, presentationFormat } = resources;
    const dpr = PixelRatio.get();

    // Per-run cancellation token. On Fast Refresh / dep change / unmount, React
    // runs this effect's cleanup, which flips the flag and stops *this* loop —
    // otherwise the old worklet RAF loop keeps running forever alongside the new
    // one, stacking a duplicate render loop on every Metro reload.
    const cancelled = createSynchronizable<Float64Array>(new Float64Array(1));

    scheduleOnRuntime(runtime, () => {
      'worklet';

      // Worklet runtimes start without the WebGPU flag constants
      // (GPUBufferUsage, GPUTextureUsage, ...). installWebGPU() captures them
      // into this runtime so they're available below. Idempotent / safe no-op
      // if already installed.
      installWebGPU();

      // Create pipeline once
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
          entryPoint: 'main',
        },
        fragment: {
          module: device.createShaderModule({ code: fragmentShader }),
          entryPoint: 'main',
          targets: [{ format: presentationFormat }],
        },
        primitive: { topology: 'triangle-list' },
      });

      // Create uniform buffer + bind group once, reuse via writeBuffer
      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      const uniformData = new Float32Array(UNIFORM_FLOAT_COUNT);
      let accumulatedTime = 0;
      let lastTimestamp = 0;
      let warned = false;
      let bufferDestroyed = false;

      // Free this loop's uniform buffer when the loop ends (alive=0 / superseded
      // by Fast Refresh / unmount). On a fragmentShader change the effect
      // re-runs and schedules a fresh loop with a new buffer while the device
      // persists, so without this the old buffer leaks every shader swap.
      function destroyBuffer() {
        if (bufferDestroyed) {
          return;
        }
        bufferDestroyed = true;
        try {
          uniformBuffer.destroy();
        } catch {
          // The device may already have been destroyed on unmount — the buffer
          // is gone either way, so there's nothing to recover.
          return;
        }
      }

      function render(timestamp: number) {
        const props = propsSync.getDirty();
        if (props[IDX_ALIVE] === 0) {
          destroyBuffer();
          return;
        }

        // This loop was superseded (Fast Refresh / unmount) — bail without
        // scheduling another frame so it can be garbage-collected.
        if (cancelled.getDirty()[0] === 1) {
          destroyBuffer();
          return;
        }

        // Compute dt
        const dt = lastTimestamp === 0 ? 0 : (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        // Accumulate time with speed
        const currentSpeed = props[IDX_SPEED]!;
        accumulatedTime += dt * currentSpeed;

        // Resolution
        const canvas = context.canvas as typeof context.canvas & {
          width: number;
          height: number;
        };
        const width = canvas.width || 1;
        const height = canvas.height || 1;
        const aspect = width / height;

        // Fill uniform data (7 × vec4 = 28 floats)
        // resolution: vec4<f32>
        uniformData[0] = width;
        uniformData[1] = height;
        uniformData[2] = aspect;
        uniformData[3] = dpr;

        // time: vec4<f32>
        uniformData[4] = accumulatedTime;
        uniformData[5] = dt;
        uniformData[6] = 0;
        uniformData[7] = 0;

        // color0: vec4<f32>
        uniformData[8] = props[0]!;
        uniformData[9] = props[1]!;
        uniformData[10] = props[2]!;
        uniformData[11] = props[3]!;

        // color1: vec4<f32>
        uniformData[12] = props[4]!;
        uniformData[13] = props[5]!;
        uniformData[14] = props[6]!;
        uniformData[15] = props[7]!;

        // params0: vec4<f32>
        uniformData[16] = props[IDX_PARAMS]!;
        uniformData[17] = props[IDX_PARAMS + 1]!;
        uniformData[18] = props[IDX_PARAMS + 2]!;
        uniformData[19] = props[IDX_PARAMS + 3]!;

        // params1: vec4<f32> — static params[4..7]
        uniformData[20] = props[IDX_PARAMS + 4]!;
        uniformData[21] = props[IDX_PARAMS + 5]!;
        uniformData[22] = props[IDX_PARAMS + 6]!;
        uniformData[23] = props[IDX_PARAMS + 7]!;

        // live + liveData — off-thread input (touch/scroll/audio) from
        // paramsSynchronizable, written into its own slots so it never collides
        // with the static params. The channel's length is fixed at creation
        // (min 4 floats, up to LIVE_FLOAT_COUNT); unattached slots stay 0.
        if (paramsSynchronizable) {
          const live = paramsSynchronizable.getDirty();
          const liveCount = Math.min(live.length, LIVE_FLOAT_COUNT);
          for (let i = 0; i < liveCount; i++) {
            uniformData[24 + i] = live[i]!;
          }
        }

        // GPU work can throw when the surface is transiently invalid — the app
        // backgrounded, the view detached, or the device was lost. Swallow the
        // failed frame so the loop survives and recovers when the surface comes
        // back (rather than the worklet crashing or the loop dying silently).
        try {
          device.queue.writeBuffer(uniformBuffer, 0, uniformData);

          const commandEncoder = device.createCommandEncoder();
          const textureView = context.getCurrentTexture().createView();
          const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
              {
                view: textureView,
                clearValue: transparent ? [0, 0, 0, 0] : [0, 0, 0, 1],
                loadOp: 'clear',
                storeOp: 'store',
              },
            ],
          });

          passEncoder.setPipeline(pipeline);
          passEncoder.setBindGroup(0, bindGroup);
          passEncoder.draw(3);
          passEncoder.end();

          device.queue.submit([commandEncoder.finish()]);
          context.present();
        } catch (e) {
          // Warn once to avoid spamming the console every frame on a persistent
          // failure (e.g. a lost device).
          if (!warned) {
            warned = true;
            console.warn('[react-native-effects] render frame failed:', e);
          }
        }

        // Always reschedule animated loops, even after a caught failure, so the
        // effect self-heals once the surface is valid again.
        if (!isStatic) {
          requestAnimationFrame(render);
        }
      }

      requestAnimationFrame(render);
    });

    return () => {
      cancelled.setBlocking(() => Float64Array.of(1));
    };
  }, [
    resources,
    appActive,
    runtime,
    propsSync,
    paramsSynchronizable,
    fragmentShader,
    isStatic,
    transparent,
  ]);

  return (
    <Canvas
      ref={canvasRef}
      transparent={transparent}
      style={[styles.canvas, style]}
      {...viewProps}
      onLayout={(event) => {
        onCanvasLayout(event);
        viewProps.onLayout?.(event);
      }}
    />
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
});
