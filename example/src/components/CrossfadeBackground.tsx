import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

type Props = {
  /**
   * Identifies the background currently being shown. When it changes, the new
   * background fades in over the old one.
   */
  activeKey: string;
  /**
   * Pure mapping from a key to its background element. Must return the same
   * element for the same key every render so an outgoing layer keeps rendering
   * (its key/position stays stable, so its ShaderView is never torn down).
   */
  renderLayer: (key: string) => ReactNode;
  /** Crossfade duration in ms. Long enough to hide the new shader's warm-up. */
  duration?: number;
};

/**
 * Crossfades between full-screen shader backgrounds without the one-frame blank
 * that a plain component swap causes.
 *
 * A bare swap unmounts the old ShaderView and mounts a new one, which needs a
 * few frames (device handoff → render-loop effect → first rAF → present) before
 * it paints — so the fresh opaque Canvas flashes its flat background color. Here
 * the outgoing layer stays mounted and rendering at full opacity while the new
 * layer fades in on top; once the fade finishes the stale layer is dropped, so
 * only the active background keeps a render loop alive at rest.
 */
export default function CrossfadeBackground({
  activeKey,
  renderLayer,
  duration = 400,
}: Props) {
  // Keys currently mounted, bottom-to-top. The last entry is the active layer
  // fading in; earlier entries are outgoing layers held opaque underneath until
  // the fade completes.
  const [layers, setLayers] = useState<string[]>([activeKey]);
  const opacity = useSharedValue(1);
  const prevActive = useRef(activeKey);

  const collapseTo = useCallback((keep: string) => {
    setLayers((prev) => (prev.length === 1 ? prev : [keep]));
  }, []);

  useEffect(() => {
    if (prevActive.current === activeKey) {
      return;
    }
    prevActive.current = activeKey;

    // Keep the outgoing layer(s) mounted beneath; append the new active key on
    // top so it stacks above and reconciles into its own stable position.
    setLayers((prev) => [...prev.filter((k) => k !== activeKey), activeKey]);

    opacity.value = 0;
    opacity.value = withTiming(1, { duration }, (finished) => {
      'worklet';
      if (finished) {
        runOnJS(collapseTo)(activeKey);
      }
    });
  }, [activeKey, duration, opacity, collapseTo]);

  const topStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layers.map((key, i) => {
        const isTop = i === layers.length - 1;
        if (!isTop) {
          return (
            <View key={key} style={StyleSheet.absoluteFill}>
              {renderLayer(key)}
            </View>
          );
        }
        return (
          <Animated.View key={key} style={[StyleSheet.absoluteFill, topStyle]}>
            {renderLayer(key)}
          </Animated.View>
        );
      })}
    </View>
  );
}
