import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import InkBloom from '../components/InkBloom';
import { BackButton } from '../components/BackButton';

// One bloom lasts this long before the next drop falls. Kept in sync with the
// `duration` prop below so the shader's age matches the driving timeline. The
// shader never fades the dye out; by the end of this window the spent cloud has
// simply settled below the bottom of the tank, so the next drop starts on clear
// water without anything having been faded away.
const DURATION_S = 15;

export default function InkBloomScreen() {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 1, height: 1 });

  // Live channel: (progress 0..1, dropX, dropY, driven). Writing `driven = 1`
  // hands the bloom's clock and origin to this screen so a tap can restart it.
  const { paramsSynchronizable } = useParamsSynchronizable([0, 0.5, 0.88, 1]);

  const progress = useSharedValue(0);
  const dropX = useSharedValue(0.5);
  const dropY = useSharedValue(0.88);

  // Bridge the Reanimated timeline into the shader on the UI thread — the render
  // loop reads it off-thread every frame, so no React re-render per frame.
  useAnimatedReaction(
    () => progress.value,
    (p) => {
      'worklet';
      paramsSynchronizable.setBlocking(() =>
        Float64Array.of(p, dropX.value, dropY.value, 1)
      );
    }
  );

  // `start` and `nextDrop` are mutually recursive (a finished bloom seeds the
  // next one), so the timing callback goes through a ref.
  const startRef = useRef<(x: number, y: number) => void>(() => {});

  const nextDrop = useCallback(() => {
    startRef.current(
      0.5 + (Math.random() - 0.5) * 0.26,
      0.86 + (Math.random() - 0.5) * 0.06
    );
  }, []);

  const start = useCallback(
    (x: number, y: number) => {
      dropX.value = x;
      dropY.value = y;
      progress.value = 0;
      progress.value = withTiming(
        1,
        { duration: DURATION_S * 1000, easing: Easing.linear },
        (finished) => {
          'worklet';
          if (finished) {
            runOnJS(nextDrop)();
          }
        }
      );
    },
    [dropX, dropY, progress, nextDrop]
  );

  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    nextDrop();
  }, [nextDrop]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width: Math.max(width, 1), height: Math.max(height, 1) });
  }, []);

  // Tap anywhere to drop fresh ink there. Touch y is measured from the top;
  // shader UV is y-up, so flip it.
  const onDrop = useCallback(
    (px: number, py: number) => {
      start(
        Math.min(0.95, Math.max(0.05, px / size.width)),
        Math.min(0.95, Math.max(0.15, 1 - py / size.height))
      );
    },
    [size.width, size.height, start]
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <InkBloom
        style={StyleSheet.absoluteFill}
        paramsSynchronizable={paramsSynchronizable}
        duration={DURATION_S}
      />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={(e) =>
          onDrop(e.nativeEvent.locationX, e.nativeEvent.locationY)
        }
      />

      <View
        style={[styles.topBar, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>

      <Animated.View
        style={[styles.hintWrap, { bottom: insets.bottom + 28 }]}
        pointerEvents="none"
      >
        <Text style={styles.hintTitle}>Ink in water</Text>
        <Text style={styles.hint}>tap anywhere to drop ink</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Matches the unlit corners of the tank, so mounting does not flash.
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    left: 22,
    zIndex: 10,
  },
  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // The tank is lit now, not black, so the caption needs a shadow to stay
  // legible over the brighter water.
  hintTitle: {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginBottom: 6,
    textShadowColor: 'rgba(0,20,26,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  hint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,20,26,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
