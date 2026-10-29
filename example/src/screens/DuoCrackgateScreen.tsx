import { useEffect, useMemo, useRef } from 'react';
import { StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import HingeFailure from '../components/cracks/HingeFailure';
import LockScreen from '../components/cracks/LockScreen';
import { useHingeFailure } from '../components/cracks/useHingeFailure';

/**
 * Wallpaper: "Palm silhouettes" by Prakash G (User:Prakashsrivaths), CC BY-SA
 * 4.0, via Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Palm_silhouettes.jpg).
 */
const WALLPAPER = require('../../assets/cracks/palms.jpg');
const CLOCK_ORANGE = '#F79A2E';
const FLEX_MS = 700;
/** A beat after the panel opens, so the failure plays on a lit screen. */
const FOLD_SETTLE_MS = 900;
/** Opening the phone always gets as far as the white row. */
const OPEN_MIN_STAGE = 2;

/**
 * The iPhone Duo "crackgate" inner display failure. Every fold or unfold of
 * the phone (a window size change), or a press and hold that flexes the
 * panel, takes the damage further. Double tap for a new panel.
 */
export default function DuoCrackgateScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { paramsSynchronizable, advance, setFlexing, reset } =
    useHingeFailure();

  const lastSize = useRef({ width, height });
  useEffect(() => {
    const prev = lastSize.current;
    if (prev.width === width && prev.height === height) {
      return;
    }
    lastSize.current = { width, height };
    const opened = width > height;
    const id = setTimeout(
      () => advance(opened ? OPEN_MIN_STAGE : 0),
      FOLD_SETTLE_MS
    );
    return () => clearTimeout(id);
  }, [width, height, advance]);

  const gesture = useMemo(() => {
    const flex = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(FLEX_MS)
      .maxDistance(60)
      .onBegin(() => setFlexing(true))
      .onStart(() => advance())
      .onFinalize(() => setFlexing(false));
    const fresh = Gesture.Tap().runOnJS(true).numberOfTaps(2).onEnd(reset);
    return Gesture.Exclusive(fresh, flex);
  }, [advance, reset, setFlexing]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <GestureDetector gesture={gesture}>
        <View style={styles.fill} collapsable={false}>
          <LockScreen
            wallpaper={WALLPAPER}
            landscape={width > height}
            clockColor={CLOCK_ORANGE}
            dim={0.4}
            liveClock
          />
          <HingeFailure
            paramsSynchronizable={paramsSynchronizable}
            style={styles.fill}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>
      <View style={[styles.backWrap, { top: insets.top + 30 }]}>
        <BackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
});
