import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { colorToVec4 } from '../../utils/colors';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { useCallback, useEffect } from 'react';
import { runOnUI, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { LINEAR_GRADIENT_SHADER } from './shader';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The color of the start of the gradient.
   */
  startColor: string | number | SharedValue<string> | SharedValue<number>;
  /**
   * The color of the end of the gradient.
   */
  endColor: string | number | SharedValue<string> | SharedValue<number>;
  /**
   * The angle of the gradient in degrees (0-360).
   */
  angle: number | SharedValue<number>;
};

export default function LinearGradient({
  startColor,
  endColor,
  angle,
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();

  // Convert angle to radians
  const angleInRadians = useDerivedValue(() => {
    const angleValue = typeof angle === 'number' ? angle : angle.get();
    return (angleValue * Math.PI) / 180;
  });

  const animatedStartColor = useDerivedValue(() =>
    typeof startColor === 'number' || typeof startColor === 'string'
      ? startColor
      : startColor.get()
  );

  const animatedEndColor = useDerivedValue(() =>
    typeof endColor === 'number' || typeof endColor === 'string'
      ? endColor
      : endColor.get()
  );

  const drawLinearGradient = useCallback(() => {
    'worklet';

    const { device, context, presentationFormat } = sharedContext.get();
    if (!device || !context || !presentationFormat) {
      return;
    }

    const uniformBuffer = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const startColorRGBA = colorToVec4(animatedStartColor.get());
    const endColorRGBA = colorToVec4(animatedEndColor.get());

    const width = context.canvas.width ?? 1;
    const height = context.canvas.height ?? 1;
    const aspect = width / height;

    const uniformData = new Float32Array([
      startColorRGBA.r,
      startColorRGBA.g,
      startColorRGBA.b,
      startColorRGBA.a,
      endColorRGBA.r,
      endColorRGBA.g,
      endColorRGBA.b,
      endColorRGBA.a,
      angleInRadians.get(),
      aspect,
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: TRIANGLE_VERTEX_SHADER,
        }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({
          code: LINEAR_GRADIENT_SHADER,
        }),
        entryPoint: 'main',
        targets: [
          {
            format: presentationFormat,
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
  }, [sharedContext, animatedStartColor, animatedEndColor, angleInRadians]);

  useEffect(() => {
    function listenToAnimatedValues() {
      angleInRadians.addListener(0, () => {
        drawLinearGradient();
      });
      animatedStartColor.addListener(0, () => {
        drawLinearGradient();
      });
      animatedEndColor.addListener(0, () => {
        drawLinearGradient();
      });
    }

    function stopListeningToAnimatedValues() {
      angleInRadians.removeListener(0);
      animatedStartColor.removeListener(0);
      animatedEndColor.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [
    angleInRadians,
    animatedStartColor,
    animatedEndColor,
    drawLinearGradient,
    sharedContext,
  ]);

  return (
    <Canvas ref={canvasRef} style={[styles.webgpu, style]} {...canvasProps} />
  );
}

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
