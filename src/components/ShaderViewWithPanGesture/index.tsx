import { useCallback, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  createSynchronizable,
  type Synchronizable,
} from 'react-native-worklets';
import ShaderView from '../ShaderView';
import { useParamsSynchronizable } from '../../hooks/useParamsSynchronizable';
import type { ShaderViewProps } from '../ShaderView/types';

/**
 * A {@link ShaderView} that feeds touch input into the shader's `u.params1`:
 *
 *   - `params1.x` → pointer X, normalized 0..1 (left → right)
 *   - `params1.y` → pointer Y, normalized 0..1 (bottom → top, matching UV space)
 *   - `params1.z` → 1.0 while touching, 0.0 when released
 *   - `params1.w` → 0.0 (reserved)
 *
 * Dragging moves the pointer **relatively** — it pushes from where the pointer
 * already is rather than jumping under the finger — and a fling lets it glide to
 * a stop. The position is **remembered**: it stays wherever it ended and is
 * never reset; only the "touched" flag (`params1.z`) toggles on release. A
 * shader can read `params1.xy` as a stable resting position and use `params1.z`
 * purely for touch-driven emphasis, so the effect never snaps back.
 *
 * The resting value before the first touch is `[0, 0, 0, 0]` by default; pass
 * `initialParamsSynchronizable` to seed it — e.g. `[0.5, 0.5, 0, 0]` to start a
 * pointer at screen center.
 *
 * The drag runs as a **worklet on the UI thread** and writes the synchronizable
 * directly, so pointer updates never hop to the JS thread — matching the rest of
 * the library, which renders off the JS thread. The render runtime reads the
 * same synchronizable each frame.
 */
export type ShaderViewWithPanGestureProps = Omit<
  ShaderViewProps,
  'paramsSynchronizable'
> & {
  /**
   * Initial value for the gesture channel (`u.params1`) before the first touch.
   * Defaults to `[0, 0, 0, 0]`. Use e.g. `[0.5, 0.5, 0, 0]` to rest a pointer at
   * screen center.
   */
  initialParamsSynchronizable?: readonly [number, number, number, number];
};

export default function ShaderViewWithPanGesture({
  style,
  initialParamsSynchronizable = [0, 0, 0, 0],
  ...props
}: ShaderViewWithPanGestureProps) {
  const { paramsSynchronizable } = useParamsSynchronizable(
    initialParamsSynchronizable
  );

  // View size, read inside the gesture worklets to normalize pointer coords.
  const sizeRef = useRef<Synchronizable<Float64Array> | null>(null);
  if (sizeRef.current === null) {
    sizeRef.current = createSynchronizable<Float64Array>(Float64Array.of(1, 1));
  }
  const sizeSynchronizable = sizeRef.current;

  // Generation of the current post-release glide; bumped to cancel an old one.
  const momentumRef = useRef<Synchronizable<Float64Array> | null>(null);
  if (momentumRef.current === null) {
    momentumRef.current = createSynchronizable<Float64Array>(
      Float64Array.of(0)
    );
  }
  const momentumSynchronizable = momentumRef.current;

  // Pointer position when the current drag began — the pan moves the pointer
  // relative to this, so a drag pushes from where it was rather than jumping.
  const panStartRef = useRef<Synchronizable<Float64Array> | null>(null);
  if (panStartRef.current === null) {
    panStartRef.current = createSynchronizable<Float64Array>(
      Float64Array.of(0, 0)
    );
  }
  const panStartSynchronizable = panStartRef.current;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      sizeSynchronizable.setBlocking(() =>
        Float64Array.of(width || 1, height || 1)
      );
    },
    [sizeSynchronizable]
  );

  // Worklet: runs on the UI thread and writes the normalized pointer straight
  // into the synchronizable the render runtime reads, so a pointer move never
  // touches the JS thread.
  const writePointer = (nx: number, ny: number, active: number) => {
    'worklet';
    const x = Math.min(1, Math.max(0, nx));
    const y = Math.min(1, Math.max(0, ny));
    paramsSynchronizable.setBlocking(() => Float64Array.of(x, y, active, 0));
  };

  const stopMomentum = () => {
    'worklet';
    const next = (momentumSynchronizable.getDirty()[0] || 0) + 1;
    momentumSynchronizable.setBlocking(() => Float64Array.of(next));
  };

  // Drop the touched flag in place — safety net for a gesture cancelled with no
  // onEnd, so the flag never sticks.
  const releaseFlag = () => {
    'worklet';
    const p = paramsSynchronizable.getDirty();
    const x = p[0] || 0;
    const y = p[1] || 0;
    paramsSynchronizable.setBlocking(() => Float64Array.of(x, y, 0, 0));
  };

  // After release, drift from the last position along the fling velocity and
  // decay to a stop — a little inertia. Runs on the UI thread via rAF, like the
  // render loop, writing each frame into the same synchronizable.
  const startMomentum = (velX: number, velY: number) => {
    'worklet';
    const s = sizeSynchronizable.getDirty();
    const w = s[0] || 1;
    const h = s[1] || 1;

    // Flick speed in normalized units/sec, scaled to a subtle glide (Y flipped).
    const SCALE = 0.12;
    let vx = (velX / w) * SCALE;
    let vy = (-velY / h) * SCALE;

    const p = paramsSynchronizable.getDirty();
    let x = p[0] || 0;
    let y = p[1] || 0;

    // Claim this glide; a newer one bumps the generation and this loop bails.
    const gen = (momentumSynchronizable.getDirty()[0] || 0) + 1;
    momentumSynchronizable.setBlocking(() => Float64Array.of(gen));

    const FRICTION = 2; // 1/s — higher stops sooner
    let last = -1;

    // Plain closure (no 'worklet') so its accumulators and self-reference
    // survive across frames; a serialized worklet would snapshot them by value.
    const step = (now: number) => {
      if ((momentumSynchronizable.getDirty()[0] || 0) !== gen) {
        return;
      }
      const dt = last < 0 ? 0 : (now - last) / 1000;
      last = now;

      x = Math.min(1, Math.max(0, x + vx * dt));
      y = Math.min(1, Math.max(0, y + vy * dt));
      const decay = Math.exp(-FRICTION * dt);
      vx = vx * decay;
      vy = vy * decay;

      paramsSynchronizable.setBlocking(() => Float64Array.of(x, y, 0, 0));

      if (Math.abs(vx) + Math.abs(vy) > 0.0008) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  };

  // Drag moves the pointer *relatively*: grab anywhere and push it from where it
  // is, rather than snapping it under the finger. A plain tap leaves it put.
  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      stopMomentum();
      const p = paramsSynchronizable.getDirty();
      const sx = p[0] || 0;
      const sy = p[1] || 0;
      panStartSynchronizable.setBlocking(() => Float64Array.of(sx, sy));
      writePointer(sx, sy, 1);
    })
    .onUpdate((e) => {
      'worklet';
      const s = sizeSynchronizable.getDirty();
      const w = s[0] || 1;
      const h = s[1] || 1;
      const start = panStartSynchronizable.getDirty();
      // Add the drag delta; Y is flipped to match the shader's UV space.
      writePointer(
        (start[0] || 0) + e.translationX / w,
        (start[1] || 0) - e.translationY / h,
        1
      );
    })
    .onEnd((e) => {
      'worklet';
      const p = paramsSynchronizable.getDirty();
      writePointer(p[0] || 0, p[1] || 0, 0);
      startMomentum(e.velocityX, e.velocityY);
    })
    .onFinalize(() => {
      'worklet';
      releaseFlag();
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.fill, style]}
        onLayout={onLayout}
        collapsable={false}
      >
        <ShaderView
          {...props}
          paramsSynchronizable={paramsSynchronizable}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
