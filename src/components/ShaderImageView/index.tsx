import { AppState, Image, PixelRatio, StyleSheet } from 'react-native';
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
import type { ShaderImageViewProps } from './types';

// Same layout as ShaderView: [c0rgba, c1rgba, speed, p0..p7, alive]
const SYNC_SIZE = 18;
const IDX_SPEED = 8;
const IDX_PARAMS = 9; // 9..16
const IDX_ALIVE = 17;

type LoadedTexture = {
  texture: GPUTexture;
  width: number;
  height: number;
};

/**
 * Fullscreen-triangle blit used to build the mip chain: each level is drawn by
 * sampling the level above it with a linear filter.
 */
const MIPMAP_SHADER = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0)
  );
  var o: VSOut;
  o.pos = vec4<f32>(p[vid], 0.0, 1.0);
  o.uv = vec2<f32>((p[vid].x + 1.0) * 0.5, (1.0 - p[vid].y) * 0.5);
  return o;
}

@group(0) @binding(0) var src: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSampleLevel(tex, src, uv, 0.0);
}
`;

/** Number of mip levels a texture of this size can hold. */
function mipLevelsFor(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/**
 * Fills mip levels 1..n by successively downsampling level 0. WebGPU has no
 * `generateMipmap`, so each level is a render pass.
 *
 * Without a mip chain a shader that minifies the image heavily — anything that
 * warps or compresses UVs, which is exactly what these shaders are for — has
 * nothing but level 0 to sample and the result aliases into shimmering noise.
 */
function generateMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  format: GPUTextureFormat,
  levels: number
) {
  if (levels < 2) {
    return;
  }

  const module = device.createShaderModule({ code: MIPMAP_SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const encoder = device.createCommandEncoder();
  for (let level = 1; level < levels; level++) {
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sampler },
        {
          binding: 1,
          resource: texture.createView({
            baseMipLevel: level - 1,
            mipLevelCount: 1,
          }),
        },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}

/**
 * Resolve any React Native image source down to a URI the network stack can
 * fetch. `require()`d assets go through the asset registry (a Metro URL in dev,
 * a bundled `file://` / `asset://` path in release).
 */
function resolveImageUri(source: unknown): string | null {
  if (typeof source === 'string') {
    return source;
  }
  if (typeof source === 'number') {
    return Image.resolveAssetSource(source)?.uri ?? null;
  }
  if (Array.isArray(source)) {
    return resolveImageUri(source[0]);
  }
  if (source && typeof source === 'object' && 'uri' in source) {
    const { uri } = source as { uri?: string };
    return uri ?? null;
  }
  return null;
}

/**
 * A {@link ShaderView} that also binds an image as a sampled texture, so the
 * fragment shader can read real pixels instead of generating everything
 * procedurally.
 *
 * On top of the uniform block at `@binding(0)`, the shader gets:
 *
 * ```wgsl
 * @group(0) @binding(1) var imageSampler: sampler;
 * @group(0) @binding(2) var image: texture_2d<f32>;
 * ```
 *
 * The shader **must** reference both — the pipeline is created with
 * `layout: 'auto'`, so a binding the shader never reads is not part of the
 * generated layout and the bind group would fail to build.
 *
 * The image is fetched and decoded on the JS thread (that is where
 * `RNWebGPU.createImageBitmap` lives), uploaded once with
 * `copyExternalImageToTexture`, and the resulting `GPUTexture` is handed to the
 * off-thread render loop the same way the device and canvas context already
 * are.
 */
export default function ShaderImageView({
  fragmentShader,
  image,
  colors = [],
  speed = 1.0,
  params = [],
  isStatic = false,
  transparent = false,
  paramsSynchronizable,
  onImageLoad,
  onImageError,
  style,
  ...viewProps
}: ShaderImageViewProps) {
  const { canvasRef, runtime, resources, onCanvasLayout } = useWGPUSetup();
  const [loaded, setLoaded] = useState<LoadedTexture | null>(null);

  // Keep the latest callbacks in refs so swapping an inline arrow prop never
  // re-triggers the (expensive) texture upload.
  const onImageLoadRef = useRef(onImageLoad);
  onImageLoadRef.current = onImageLoad;
  const onImageErrorRef = useRef(onImageError);
  onImageErrorRef.current = onImageError;

  // See ShaderView — the rAF loop is paused while the app is backgrounded.
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

  useEffect(() => {
    const data = new Float64Array(SYNC_SIZE);

    if (colors[0] !== undefined) {
      const c0 = colorToVec4(colors[0]);
      data[0] = c0.r;
      data[1] = c0.g;
      data[2] = c0.b;
      data[3] = c0.a;
    }

    if (colors[1] !== undefined) {
      const c1 = colorToVec4(colors[1]);
      data[4] = c1.r;
      data[5] = c1.g;
      data[6] = c1.b;
      data[7] = c1.a;
    }

    data[IDX_SPEED] = speed;

    for (let i = 0; i < 8; i++) {
      data[IDX_PARAMS + i] = params[i] ?? 0;
    }

    data[IDX_ALIVE] = 1;

    propsSync.setBlocking(() => data);
  }, [colors, speed, params, propsSync]);

  useEffect(() => {
    return () => {
      propsSync.setBlocking((prev) => {
        prev[IDX_ALIVE] = 0;
        return prev;
      });
    };
  }, [propsSync]);

  // Fetch → decode → upload. Runs on the JS runtime because that is where the
  // native module installs `RNWebGPU.createImageBitmap`; the GPUTexture it
  // produces is a host object and crosses into the render runtime by closure,
  // exactly like the GPUDevice does.
  useEffect(() => {
    if (!resources) {
      return;
    }

    const uri = resolveImageUri(image);
    if (!uri) {
      onImageErrorRef.current?.(
        new Error('[react-native-effects] could not resolve the image source')
      );
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(uri);
        const buffer = await response.arrayBuffer();
        const bitmap = await RNWebGPU.createImageBitmap(buffer);
        if (cancelled) {
          return;
        }

        const { device } = resources;
        const width = Math.max(1, bitmap.width);
        const height = Math.max(1, bitmap.height);

        const format: GPUTextureFormat = 'rgba8unorm';
        const levels = mipLevelsFor(width, height);
        const texture = device.createTexture({
          size: [width, height, 1],
          format,
          mipLevelCount: levels,
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });

        device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture },
          [width, height]
        );
        generateMipmaps(device, texture, format, levels);

        if (cancelled) {
          return;
        }

        setLoaded({ texture, width, height });
        onImageLoadRef.current?.({ width, height });
      } catch (e) {
        if (!cancelled) {
          onImageErrorRef.current?.(e);
          console.warn('[react-native-effects] image upload failed:', e);
        }
      }
    })();

    return () => {
      cancelled = true;
      // The previous texture is deliberately NOT destroyed here. The render
      // loop that holds it stops asynchronously, so an explicit destroy races
      // with in-flight GPU work; letting the driver reclaim it once the loop's
      // worklet closure is collected is the safe trade (same reasoning as the
      // pipeline / shader modules in ShaderView).
    };
  }, [resources, image]);

  // Start the render loop once the GPU resources AND the texture are ready —
  // the bind group cannot be built before the texture exists.
  useEffect(() => {
    if (!resources || !loaded || !appActive) {
      return;
    }

    const { device, context, presentationFormat } = resources;
    const { texture } = loaded;
    const dpr = PixelRatio.get();

    const cancelled = createSynchronizable<Float64Array>(new Float64Array(1));

    scheduleOnRuntime(runtime, () => {
      'worklet';

      installWebGPU();

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

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: texture.createView() },
        ],
      });

      const uniformData = new Float32Array(UNIFORM_FLOAT_COUNT);
      let accumulatedTime = 0;
      let lastTimestamp = 0;
      let warned = false;
      let bufferDestroyed = false;

      function destroyBuffer() {
        if (bufferDestroyed) {
          return;
        }
        bufferDestroyed = true;
        try {
          uniformBuffer.destroy();
        } catch {
          return;
        }
      }

      function render(timestamp: number) {
        const props = propsSync.getDirty();
        if (props[IDX_ALIVE] === 0) {
          destroyBuffer();
          return;
        }

        if (cancelled.getDirty()[0] === 1) {
          destroyBuffer();
          return;
        }

        const dt = lastTimestamp === 0 ? 0 : (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        const currentSpeed = props[IDX_SPEED]!;
        accumulatedTime += dt * currentSpeed;

        const canvas = context.canvas as typeof context.canvas & {
          width: number;
          height: number;
        };
        const width = canvas.width || 1;
        const height = canvas.height || 1;
        const aspect = width / height;

        uniformData[0] = width;
        uniformData[1] = height;
        uniformData[2] = aspect;
        uniformData[3] = dpr;

        uniformData[4] = accumulatedTime;
        uniformData[5] = dt;
        uniformData[6] = 0;
        uniformData[7] = 0;

        uniformData[8] = props[0]!;
        uniformData[9] = props[1]!;
        uniformData[10] = props[2]!;
        uniformData[11] = props[3]!;

        uniformData[12] = props[4]!;
        uniformData[13] = props[5]!;
        uniformData[14] = props[6]!;
        uniformData[15] = props[7]!;

        uniformData[16] = props[IDX_PARAMS]!;
        uniformData[17] = props[IDX_PARAMS + 1]!;
        uniformData[18] = props[IDX_PARAMS + 2]!;
        uniformData[19] = props[IDX_PARAMS + 3]!;

        uniformData[20] = props[IDX_PARAMS + 4]!;
        uniformData[21] = props[IDX_PARAMS + 5]!;
        uniformData[22] = props[IDX_PARAMS + 6]!;
        uniformData[23] = props[IDX_PARAMS + 7]!;

        if (paramsSynchronizable) {
          const live = paramsSynchronizable.getDirty();
          const liveCount = Math.min(live.length, LIVE_FLOAT_COUNT);
          for (let i = 0; i < liveCount; i++) {
            uniformData[24 + i] = live[i]!;
          }
        }

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
          if (!warned) {
            warned = true;
            console.warn('[react-native-effects] render frame failed:', e);
          }
        }

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
    loaded,
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
