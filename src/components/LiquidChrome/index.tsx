import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { useCallback, useEffect } from 'react';
import { runOnUI, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { LIQUID_CHROME_SHADER } from './shader';
import { useClock } from '../../hooks/useClock';
import { colorToVec4, type ColorInput } from '../../utils/colors';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The base color for the liquid chrome effect.
   * Can be a hex number, hex string, rgb/rgba string, or named color.
   * @default '#1a1a1a'
   */
  baseColor?: ColorInput | SharedValue<ColorInput>;
  /**
   * The speed of the animation.
   * @default 0.2
   */
  speed?: number | SharedValue<number>;
  /**
   * The amplitude of the wave effect.
   * @default 0.3
   */
  amplitude?: number | SharedValue<number>;
  /**
   * The frequency of the effect on the X axis.
   * @default 3
   */
  frequencyX?: number | SharedValue<number>;
  /**
   * The frequency of the effect on the Y axis.
   * @default 3
   */
  frequencyY?: number | SharedValue<number>;
};

export default function LiquidChrome({
  baseColor = '#1a1a1a',
  speed = 0.2,
  amplitude = 0.3,
  frequencyX = 3,
  frequencyY = 3,
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();
  const clock = useClock();

  const animatedBaseColor = useDerivedValue(() =>
    typeof baseColor === 'number' || typeof baseColor === 'string'
      ? baseColor
      : baseColor.get()
  );

  const animatedSpeed = useDerivedValue(() =>
    typeof speed === 'number' ? speed : speed.get()
  );

  const animatedAmplitude = useDerivedValue(() =>
    typeof amplitude === 'number' ? amplitude : amplitude.get()
  );

  const animatedFrequencyX = useDerivedValue(() =>
    typeof frequencyX === 'number' ? frequencyX : frequencyX.get()
  );

  const animatedFrequencyY = useDerivedValue(() =>
    typeof frequencyY === 'number' ? frequencyY : frequencyY.get()
  );

  const drawLiquidChrome = useCallback(() => {
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

    const time = (clock.get() / 1000) * animatedSpeed.get();
    const baseColorRGBA = colorToVec4(animatedBaseColor.get());

    const uniformData = new Float32Array([
      width,
      height,
      aspect,
      0,

      time,
      0,
      0,
      0,

      baseColorRGBA.r,
      baseColorRGBA.g,
      baseColorRGBA.b,
      baseColorRGBA.a,

      animatedAmplitude.get(),
      animatedFrequencyX.get(),
      animatedFrequencyY.get(),
      0,
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: LIQUID_CHROME_SHADER }),
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
          clearValue: [1, 1, 1, 1],
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
    animatedAmplitude,
    animatedBaseColor,
    animatedFrequencyX,
    animatedFrequencyY,
    animatedSpeed,
    clock,
    sharedContext,
  ]);

  useEffect(() => {
    function listenToAnimatedValues() {
      clock.addListener(0, () => {
        drawLiquidChrome();
      });
      animatedBaseColor.addListener(0, () => {
        drawLiquidChrome();
      });
      animatedSpeed.addListener(0, () => {
        drawLiquidChrome();
      });
      animatedAmplitude.addListener(0, () => {
        drawLiquidChrome();
      });
      animatedFrequencyX.addListener(0, () => {
        drawLiquidChrome();
      });
      animatedFrequencyY.addListener(0, () => {
        drawLiquidChrome();
      });
    }

    function stopListeningToAnimatedValues() {
      clock.removeListener(0);
      animatedBaseColor.removeListener(0);
      animatedSpeed.removeListener(0);
      animatedAmplitude.removeListener(0);
      animatedFrequencyX.removeListener(0);
      animatedFrequencyY.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [
    clock,
    animatedBaseColor,
    animatedSpeed,
    animatedAmplitude,
    animatedFrequencyX,
    animatedFrequencyY,
    drawLiquidChrome,
    sharedContext,
  ]);

  return (
    <Canvas ref={canvasRef} {...canvasProps} style={[styles.webgpu, style]} />
  );
}

LiquidChrome.displayName = 'LiquidChrome';

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
