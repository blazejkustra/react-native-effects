import { useCallback, useMemo } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import SnowGlobe from '../components/snowglobe/SnowGlobe';
import { useSnowGlobePhysics } from '../hooks/useSnowGlobePhysics';

/** Sphere radius as a fraction of the screen height, and of its width. */
const RADIUS_H = 0.205;
const RADIUS_W = 0.4;
/** Where the sphere's centre sits, in screen uv (y-up). */
const CENTER_Y = 0.465;
/** Plinth height, in globe radii. */
const BASE_H = 0.34;

/**
 * A snow globe.
 *
 * Shake the phone and the snow lifts off the drift, swirls, and takes several
 * seconds to come back down. Tilt it and the flakes fall toward whatever is
 * really downhill while the trees stay glued to the base — and the snow that
 * has already landed stays where it lay until the tilt passes the angle a
 * heap of snow can hold, then slides and banks up the low side. Tapping
 * the glass gives it a stir too, which is the only way to see any of this on
 * a simulator with no accelerometer.
 */
export default function SnowGlobeScreen() {
  const { width, height } = useWindowDimensions();
  const { paramsSynchronizable, shake } = useSnowGlobePhysics();

  const params = useMemo(() => {
    // Radius is a fraction of the height, but a short wide screen has to cap
    // it on width or the sphere runs off the sides.
    const radius = Math.min(RADIUS_H, (RADIUS_W * width) / height);
    return [0.5, CENTER_Y, radius, BASE_H, 0, 0, 0, 0];
  }, [width, height]);

  const onPress = useCallback(() => shake(0.85), [shake]);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SnowGlobe
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
      {/* Tapping the glass stirs it. A sibling rather than a wrapper, so the
          back button stays its own element instead of being swallowed into
          one accessibility node. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Shake the globe"
      />
      <Header
        title="Snow globe"
        subtitle="Shake the phone — the snow falls with real gravity"
        transparent
      />
      <Text style={[styles.caption, { bottom: insets.bottom + 28, width }]}>
        Shake it, or tap the glass
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08090c',
  },
  caption: {
    position: 'absolute',
    // Never eat a tap meant for the glass underneath.
    pointerEvents: 'none',
    left: 0,
    paddingHorizontal: 32,
    textAlign: 'center',
    color: 'rgba(220, 232, 255, 0.55)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
