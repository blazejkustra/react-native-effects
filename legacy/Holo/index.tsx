import {
  StyleSheet,
  type ViewProps,
  type ImageSourcePropType,
  Image,
} from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { TRIANGLE_VERTEX_SHADER } from '../../src/shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../src/hooks/useWGPUSetup';
import { useCallback, useEffect, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { runOnUI } from 'react-native-reanimated';
import { HOLO_SHADER } from './shader';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The image source to display.
   */
  source: ImageSourcePropType;
  /**
   * Animated value for the X position of the touch (-1 to 1)
   */
  touchX?: SharedValue<number>;
  /**
   * Animated value for the Y position of the touch (-1 to 1)
   */
  touchY?: SharedValue<number>;
};

export default function Holo({
  source,
  touchX,
  touchY,
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();

  const [imageBitmap, setImageBitmap] = useState<any>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        const resolved = Image.resolveAssetSource(source);
        if (!resolved) {
          throw new Error('Failed to resolve image source');
        }

        const url = resolved.uri;
        const response = await fetch(url);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        setImageBitmap(bitmap);
      } catch (error) {
        console.error('Error loading image:', error);
      }
    };

    loadImage();
  }, [source]);

  const drawHolo = useCallback(() => {
    'worklet';
    const { device, context, presentationFormat } = sharedContext.get();
    if (!device || !context || !presentationFormat || !imageBitmap) {
      return;
    }

    const uniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const width = context.canvas.width ?? 1;
    const height = context.canvas.height ?? 1;
    const aspect = width / height;

    const uniformData = new Float32Array([
      width,
      height,
      aspect,
      0.0,

      touchX?.value ?? 0,
      touchY?.value ?? 0,
      0.0,
      0.0,
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const texture = device.createTexture({
      size: [imageBitmap.width, imageBitmap.height, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture },
      [imageBitmap.width, imageBitmap.height]
    );

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: HOLO_SHADER }),
        entryPoint: 'main',
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
          },
        },
        {
          binding: 1,
          resource: sampler,
        },
        {
          binding: 2,
          resource: texture.createView(),
        },
      ],
    });

    const commandEncoder = device.createCommandEncoder();

    const textureView = context.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    context.present();
  }, [sharedContext, imageBitmap, touchX, touchY]);

  useEffect(() => {
    if (!imageBitmap) {
      return;
    }

    if (!touchX || !touchY) {
      return;
    }

    function listenToAnimatedValues() {
      touchX?.addListener(0, () => {
        drawHolo();
      });
      touchY?.addListener(0, () => {
        drawHolo();
      });
    }

    function stopListeningToAnimatedValues() {
      touchX?.removeListener(0);
      touchY?.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [imageBitmap, drawHolo, touchX, touchY]);

  return (
    <Canvas ref={canvasRef} style={[styles.webgpu, style]} {...canvasProps} />
  );
}

Holo.displayName = 'Holo';

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
