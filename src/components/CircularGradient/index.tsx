import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { colorToVec4 } from '../../utils/colors';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { useCallback, useEffect } from 'react';
import { runOnUI, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { CIRCULAR_GRADIENT_SHADER } from './shader';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The color of the center of the gradient.
   */
  centerColor: string | number | SharedValue<string> | SharedValue<number>;
  /**
   * The color of the edge of the gradient.
   */
  edgeColor?: string | number | SharedValue<string> | SharedValue<number>;
  /**
   * The size of the gradient.
   */
  size?: number | SharedValue<number>;
  /**
   * The size of the gradient on the x-axis.
   */
  sizeX?: number | SharedValue<number>;
  /**
   * The size of the gradient on the y-axis.
   */
  sizeY?: number | SharedValue<number>;
  /**
   * The center of the gradient on the x-axis.
   */
  centerX?: number | SharedValue<number>;
  /**
   * The center of the gradient on the y-axis.
   */
  centerY?: number | SharedValue<number>;
};

export default function CircularGradient({
  centerColor,
  edgeColor = 'rgba(0,0,0,0)',
  sizeX = 0.5,
  sizeY = 0.5,
  centerX = 0.5,
  centerY = 0.5,
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();

  const animatedSizeX = useDerivedValue(() =>
    typeof sizeX === 'number' ? sizeX : sizeX.get()
  );
  const animatedSizeY = useDerivedValue(() =>
    typeof sizeY === 'number' ? sizeY : sizeY.get()
  );
  const animatedCenterX = useDerivedValue(() =>
    typeof centerX === 'number' ? centerX : centerX.get()
  );
  const animatedCenterY = useDerivedValue(() =>
    typeof centerY === 'number' ? centerY : centerY.get()
  );
  const animatedEdgeColor = useDerivedValue(() =>
    typeof edgeColor === 'number' || typeof edgeColor === 'string'
      ? edgeColor
      : edgeColor.get()
  );
  const animatedCenterColor = useDerivedValue(() =>
    typeof centerColor === 'number' || typeof centerColor === 'string'
      ? centerColor
      : centerColor.get()
  );

  const drawCircularGradient = useCallback(() => {
    'worklet';

    const { device, context, presentationFormat } = sharedContext.get();
    if (!device || !context || !presentationFormat) {
      return;
    }

    const uniformBuffer = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const edgeColorRGBA = colorToVec4(animatedEdgeColor.get());
    const centerColorRGBA = colorToVec4(animatedCenterColor.get());

    const uniformData = new Float32Array([
      animatedCenterX.get(),
      animatedCenterY.get(),
      animatedSizeX.get(),
      animatedSizeY.get(),
      centerColorRGBA.r,
      centerColorRGBA.g,
      centerColorRGBA.b,
      centerColorRGBA.a,
      edgeColorRGBA.r,
      edgeColorRGBA.g,
      edgeColorRGBA.b,
      edgeColorRGBA.a,
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
          code: CIRCULAR_GRADIENT_SHADER,
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
  }, [
    sharedContext,
    animatedEdgeColor,
    animatedCenterColor,
    animatedCenterX,
    animatedCenterY,
    animatedSizeX,
    animatedSizeY,
  ]);

  useEffect(() => {
    function listenToAnimatedValues() {
      animatedCenterX.addListener(0, () => {
        drawCircularGradient();
      });
      animatedCenterY.addListener(0, () => {
        drawCircularGradient();
      });
      animatedSizeX.addListener(0, () => {
        drawCircularGradient();
      });
      animatedSizeY.addListener(0, () => {
        drawCircularGradient();
      });
      animatedEdgeColor.addListener(0, () => {
        drawCircularGradient();
      });
      animatedCenterColor.addListener(0, () => {
        drawCircularGradient();
      });
    }

    function stopListeningToAnimatedValues() {
      animatedCenterX.removeListener(0);
      animatedCenterY.removeListener(0);
      animatedSizeX.removeListener(0);
      animatedSizeY.removeListener(0);
      animatedEdgeColor.removeListener(0);
      animatedCenterColor.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [
    animatedCenterColor,
    animatedCenterX,
    animatedCenterY,
    animatedEdgeColor,
    animatedSizeX,
    animatedSizeY,
    drawCircularGradient,
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
