import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { useCallback, useEffect } from 'react';
import { runOnUI, useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { CAMPFIRE_SHADER } from './shader';
import { useClock } from '../../hooks/useClock';
import { colorToVec4, type ColorInput } from '../../utils/colors';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The color tint for the campfire effect.
   * Can be a hex number, hex string, rgb/rgba string, or named color.
   * @default '#ffffff'
   */
  color?: ColorInput | SharedValue<ColorInput>;
  /**
   * The speed of the animation.
   * @default 1.0
   */
  speed?: number | SharedValue<number>;
  /**
   * The size of the sparks.
   * @default 1.0
   */
  sparkSize?: number | SharedValue<number>;
  /**
   * The intensity of the fire effect.
   * @default 1.0
   */
  fireIntensity?: number | SharedValue<number>;
  /**
   * The intensity of the smoke effect.
   * @default 1.0
   */
  smokeIntensity?: number | SharedValue<number>;
};

export default function Campfire({
  color = '#ffffff',
  speed = 1.0,
  sparkSize = 1.0,
  fireIntensity = 1.0,
  smokeIntensity = 1.0,
  style,
  ...canvasProps
}: Props) {
  const { sharedContext, canvasRef } = useWGPUSetup();
  const clock = useClock();

  const animatedColor = useDerivedValue(() =>
    typeof color === 'number' || typeof color === 'string' ? color : color.get()
  );

  const animatedSpeed = useDerivedValue(() =>
    typeof speed === 'number' ? speed : speed.get()
  );

  const animatedSparkSize = useDerivedValue(() =>
    typeof sparkSize === 'number' ? sparkSize : sparkSize.get()
  );

  const animatedFireIntensity = useDerivedValue(() =>
    typeof fireIntensity === 'number' ? fireIntensity : fireIntensity.get()
  );

  const animatedSmokeIntensity = useDerivedValue(() =>
    typeof smokeIntensity === 'number' ? smokeIntensity : smokeIntensity.get()
  );

  const drawCampfire = useCallback(() => {
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

      animatedSpeed.get(),
      animatedSparkSize.get(),
      animatedFireIntensity.get(),
      animatedSmokeIntensity.get(),
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({ code: CAMPFIRE_SHADER }),
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
  }, [
    animatedColor,
    animatedSpeed,
    animatedSparkSize,
    animatedFireIntensity,
    animatedSmokeIntensity,
    clock,
    sharedContext,
  ]);

  useEffect(() => {
    function listenToAnimatedValues() {
      clock.addListener(0, () => {
        drawCampfire();
      });
      animatedColor.addListener(0, () => {
        drawCampfire();
      });
      animatedSpeed.addListener(0, () => {
        drawCampfire();
      });
      animatedSparkSize.addListener(0, () => {
        drawCampfire();
      });
      animatedFireIntensity.addListener(0, () => {
        drawCampfire();
      });
      animatedSmokeIntensity.addListener(0, () => {
        drawCampfire();
      });
    }

    function stopListeningToAnimatedValues() {
      clock.removeListener(0);
      animatedColor.removeListener(0);
      animatedSpeed.removeListener(0);
      animatedSparkSize.removeListener(0);
      animatedFireIntensity.removeListener(0);
      animatedSmokeIntensity.removeListener(0);
    }

    runOnUI(listenToAnimatedValues)();
    return runOnUI(stopListeningToAnimatedValues);
  }, [
    clock,
    animatedColor,
    animatedSpeed,
    animatedSparkSize,
    animatedFireIntensity,
    animatedSmokeIntensity,
    drawCampfire,
    sharedContext,
  ]);

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

Campfire.displayName = 'Campfire';

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
