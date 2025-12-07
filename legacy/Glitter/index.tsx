import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { TRIANGLE_VERTEX_SHADER } from '../../src/shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../src/hooks/useWGPUSetup';
import { useCallback, useEffect } from 'react';
import { runOnUI, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { GLITTER_SHADER } from './shader';
import { useClock } from '../../src/hooks/useClock';

import { colorToVec4, type ColorInput } from '../../src/utils/colors';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * Scale of the sparkles (affects size/frequency).
   * @default 50.0
   */
  scale?: number | SharedValue<number>;
  /**
   * Animation speed multiplier.
   * @default 0.005
   */
  speed?: number | SharedValue<number>;
  /**
   * Brightness/intensity of the sparkles.
   * @default 5.0
   */
  intensity?: number | SharedValue<number>;
  /**
   * How sparse the glitter is (0-1, higher = more sparse).
   * @default 0.0
   */
  density?: number | SharedValue<number>;
  /**
   * First color for tinting sparkles.
   * @default '#ffffff'
   */
  colorA?: ColorInput | SharedValue<ColorInput>;
  /**
   * Second color for tinting sparkles.
   * @default '#ffffff'
   */
  colorB?: ColorInput | SharedValue<ColorInput>;
};

export default function Glitter({
  scale = 50.0,
  speed = 1,
  intensity = 2.0,
  density = 0.1,
  colorA = '#ffffff',
  colorB = '#ffffff',
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();
  const clock = useClock();

  const animatedScale = useDerivedValue(() =>
    typeof scale === 'number' ? scale : scale.get()
  );
  const animatedSpeed = useDerivedValue(() =>
    typeof speed === 'number' ? speed : speed.get()
  );
  const animatedIntensity = useDerivedValue(() =>
    typeof intensity === 'number' ? intensity : intensity.get()
  );
  const animatedDensity = useDerivedValue(() =>
    typeof density === 'number' ? density : density.get()
  );
  const animatedColorA = useDerivedValue(() =>
    typeof colorA === 'number' || typeof colorA === 'string'
      ? colorA
      : colorA.get()
  );
  const animatedColorB = useDerivedValue(() =>
    typeof colorB === 'number' || typeof colorB === 'string'
      ? colorB
      : colorB.get()
  );

  const drawGlitter = useCallback(() => {
    'worklet';
    const { device, context, presentationFormat } = sharedContext.get();
    if (!device || !context || !presentationFormat) {
      return;
    }

    const uniformBuffer = device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const width = context.canvas.width ?? 1;
    const height = context.canvas.height ?? 1;
    const aspect = width / height;
    const time = clock.get() / 1000;

    const colorARGBA = colorToVec4(animatedColorA.get());
    const colorBRGBA = colorToVec4(animatedColorB.get());

    const uniformData = new Float32Array([
      width,
      height,
      aspect,
      0.0,

      time,
      0.0,
      0.0,
      0.0,

      animatedScale.get(),
      animatedSpeed.get(),
      animatedIntensity.get(),
      animatedDensity.get(),

      colorARGBA.r,
      colorARGBA.g,
      colorARGBA.b,
      colorARGBA.a,

      colorBRGBA.r,
      colorBRGBA.g,
      colorBRGBA.b,
      colorBRGBA.a,
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: GLITTER_SHADER }),
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
      ],
    });

    const commandEncoder = device.createCommandEncoder();

    const textureView = context.getCurrentTexture().createView();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: [0, 0, 0, 0],
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
  }, [
    clock,
    sharedContext,
    animatedScale,
    animatedSpeed,
    animatedIntensity,
    animatedDensity,
    animatedColorA,
    animatedColorB,
  ]);

  useEffect(() => {
    function listenToAnimatedValues() {
      clock.addListener(0, () => {
        drawGlitter();
      });
      animatedScale.addListener(0, () => {
        drawGlitter();
      });
      animatedSpeed.addListener(0, () => {
        drawGlitter();
      });
      animatedIntensity.addListener(0, () => {
        drawGlitter();
      });
      animatedDensity.addListener(0, () => {
        drawGlitter();
      });
      animatedColorA.addListener(0, () => {
        drawGlitter();
      });
      animatedColorB.addListener(0, () => {
        drawGlitter();
      });
    }

    function stopListeningToAnimatedValues() {
      clock.removeListener(0);
      animatedScale.removeListener(0);
      animatedSpeed.removeListener(0);
      animatedIntensity.removeListener(0);
      animatedDensity.removeListener(0);
      animatedColorA.removeListener(0);
      animatedColorB.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [
    clock,
    drawGlitter,
    sharedContext,
    animatedScale,
    animatedSpeed,
    animatedIntensity,
    animatedDensity,
    animatedColorA,
    animatedColorB,
  ]);

  return (
    <Canvas
      ref={canvasRef}
      style={[styles.webgpu, style]}
      transparent
      {...canvasProps}
    />
  );
}

Glitter.displayName = 'Glitter';

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
