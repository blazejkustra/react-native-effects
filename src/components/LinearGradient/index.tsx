import { StyleSheet, type ViewProps } from 'react-native';
import { Canvas } from 'react-native-wgpu';
import { colorToVec4, type ColorInput } from '../../utils/colors';
import { TRIANGLE_VERTEX_SHADER } from '../../shaders/TRIANGLE_VERTEX_SHADER';
import { useWGPUSetup } from '../../hooks/useWGPUSetup';
import { useEffect, useRef } from 'react';
import { createSynchronizable, scheduleOnRuntime } from 'react-native-worklets';
import { LINEAR_GRADIENT_SHADER } from './shader';

type CanvasProps = ViewProps & {
  transparent?: boolean;
};

type Props = CanvasProps & {
  /**
   * The color of the start of the gradient.
   */
  startColor: string | number;
  /**
   * The color of the end of the gradient.
   */
  endColor: string | number;
  /**
   * The angle of the gradient in degrees (0-360).
   */
  angle: number;
};

type GradientParams = {
  startColor: ColorInput;
  endColor: ColorInput;
  angle: number;
  alive: boolean;
};

export default function LinearGradient({
  startColor,
  endColor,
  angle,
  style,
  ...canvasProps
}: Props) {
  const { canvasRef, runtime, resources } = useWGPUSetup();

  const propsSync = useRef(
    createSynchronizable<GradientParams>({
      startColor,
      endColor,
      angle,
      alive: true,
    })
  ).current;

  // Update synchronizable when props change
  useEffect(() => {
    propsSync.setBlocking((prev) => ({
      ...prev,
      startColor,
      endColor,
      angle,
    }));
  }, [startColor, endColor, angle, propsSync]);

  // Signal cleanup on unmount
  useEffect(() => {
    return () => {
      propsSync.setBlocking((prev) => ({ ...prev, alive: false }));
    };
  }, [propsSync]);

  // Start render loop when GPU resources are ready
  useEffect(() => {
    if (!resources) {
      return;
    }

    const { device, context, presentationFormat } = resources;

    scheduleOnRuntime(runtime, () => {
      'worklet';

      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({ code: TRIANGLE_VERTEX_SHADER }),
          entryPoint: 'main',
        },
        fragment: {
          module: device.createShaderModule({
            code: LINEAR_GRADIENT_SHADER,
          }),
          entryPoint: 'main',
          targets: [{ format: presentationFormat }],
        },
        primitive: { topology: 'triangle-list' },
      });

      function animate() {
        const props = propsSync.getDirty();
        if (!props.alive) {
          return;
        }

        const startColorRGBA = colorToVec4(props.startColor);
        const endColorRGBA = colorToVec4(props.endColor);
        const angleInRadians = (props.angle * Math.PI) / 180;

        const canvas = context.canvas as typeof context.canvas & {
          width: number;
          height: number;
        };
        const width = canvas.width || 1;
        const height = canvas.height || 1;
        const aspect = width / height;

        const uniformBuffer = device.createBuffer({
          size: 48,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const uniformData = new Float32Array([
          startColorRGBA.r,
          startColorRGBA.g,
          startColorRGBA.b,
          startColorRGBA.a,
          endColorRGBA.r,
          endColorRGBA.g,
          endColorRGBA.b,
          endColorRGBA.a,
          angleInRadians,
          aspect,
        ]);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });

        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();
        const passEncoder = commandEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: textureView,
              clearValue: [0, 0, 0, 1],
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

        requestAnimationFrame(animate);
      }

      requestAnimationFrame(animate);
    });
  }, [resources, runtime, propsSync]);

  return (
    <Canvas ref={canvasRef} style={[styles.webgpu, style]} {...canvasProps} />
  );
}

const styles = StyleSheet.create({
  webgpu: {
    flex: 1,
  },
});
