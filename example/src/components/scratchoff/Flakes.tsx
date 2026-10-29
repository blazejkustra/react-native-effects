import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

/** Floats per flake in the shared state: x, y, angle (deg), size, life 0..1. */
export const FLAKE_STRIDE = 5;
export const FLAKE_COUNT = 48;

function Flake({
  index,
  state,
}: {
  index: number;
  state: SharedValue<number[]>;
}) {
  const style = useAnimatedStyle(() => {
    const o = index * FLAKE_STRIDE;
    const s = state.value;
    const life = s[o + 4] ?? 0;
    const size = s[o + 3] ?? 0;
    const angle = s[o + 2] ?? 0;
    const facing = Math.abs(Math.cos((angle * Math.PI) / 90));
    return {
      opacity: life > 0 ? Math.min(1, life * 3) : 0,
      width: size,
      height: size * 0.7,
      backgroundColor: `rgb(${150 + 90 * facing}, ${152 + 90 * facing}, ${158 + 90 * facing})`,
      transform: [
        { translateX: s[o] ?? 0 },
        { translateY: s[o + 1] ?? 0 },
        { rotate: `${angle}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.flake, style]} />;
}

/**
 * Crumbs of latex flicked off by the finger: small silver chips that tumble
 * (their shade flips as they turn) and fall away under gravity.
 */
export default function Flakes({ state }: { state: SharedValue<number[]> }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: FLAKE_COUNT }, (_, i) => (
        <Flake key={i} index={i} state={state} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flake: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 1,
  },
});
