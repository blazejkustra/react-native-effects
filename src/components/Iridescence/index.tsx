import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { useCallback, useEffect } from 'react';
import { runOnUI, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { IRIDESCENCE_SHADER } from './shader';
import { useClock } from '../../hooks/useClock';
import { colorToVec4, type ColorInput } from '../../utils/colors';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The color multiplier for the iridescent effect.
   * Can be a hex number, hex string, rgb/rgba string, or named color.
   * @default '#ffffff'
   */
  color?: ColorInput | SharedValue<ColorInput>;
  /**
   * The speed of the animation.
   * @default 1.0
   */
  speed?: number;
  /**
   * The amplitude of the effect (currently unused in shader but kept for API compatibility).
   * @default 0.1
   */
  amplitude?: number;
};

export default function Iridescence({
  color = '#ffffff',
  speed = 1.0,
  amplitude = 0.1,
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();
  const clock = useClock();

  const animatedColor = useDerivedValue(() =>
    typeof color === 'number' || typeof color === 'string' ? color : color.get()
  );

  const drawIridescence = useCallback(() => {
    'worklet';
    const { device, context, presentationFormat } = sharedContext.get();
    if (!device || !context || !presentationFormat) {
      return;
    }

    const uniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const width = context.canvas.width ?? 1;
    const height = context.canvas.height ?? 1;
    const aspect = width / height;

    const time = clock.get() / 1000;
    const colorRGBA = colorToVec4(animatedColor.get());

    const uniformData = new Float32Array([
      width,
      height,
      aspect,
      0.0,

      time,
      0.0,
      0.0,
      0.0,

      colorRGBA.r,
      colorRGBA.g,
      colorRGBA.b,
      colorRGBA.a,

      amplitude,
      speed,
      0.0,
      0.0,
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: IRIDESCENCE_SHADER }), // UV test
        entryPoint: 'main',
        targets: [{ format: presentationFormat }],
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
  }, [amplitude, animatedColor, clock, sharedContext, speed]);

  useEffect(() => {
    function listenToAnimatedValues() {
      clock.addListener(0, () => {
        drawIridescence();
      });
      animatedColor.addListener(0, () => {
        drawIridescence();
      });
    }

    function stopListeningToAnimatedValues() {
      clock.removeListener(0);
      animatedColor.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [clock, animatedColor, drawIridescence, sharedContext]);

  return (
    <Canvas
      ref={canvasRef}
      {...canvasProps}
      style={[styles.webgpu, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

Iridescence.displayName = 'Iridescence';

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
