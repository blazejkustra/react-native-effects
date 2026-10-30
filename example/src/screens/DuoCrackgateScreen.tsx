import { useEffect, useMemo, useRef } from 'react';
import { StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
const RESET_HOLD_MS = 600;
/** A beat after the panel opens, so the failure plays on a lit screen. */
const FOLD_SETTLE_MS = 700;

/**
 * The iPhone Duo "crackgate" inner display failure. The lock screen looks
 * fine for a moment, then the hinge gives out on its own. Folding or
 * unfolding the phone (a window size change) replays it, a tap pushes the
 * damage one stage further or replays a dead panel, and a long press puts a
 * fresh panel in. On phones without a fold the hinge is the centre line.
 */
export default function DuoCrackgateScreen() {
  const { width, height } = useWindowDimensions();
  const { paramsSynchronizable, play, advance, reset } = useHingeFailure();

  useEffect(play, [play]);

  const lastSize = useRef({ width, height });
  useEffect(() => {
    const prev = lastSize.current;
    if (prev.width === width && prev.height === height) {
      return;
    }
    lastSize.current = { width, height };
    reset();
    const id = setTimeout(play, FOLD_SETTLE_MS);
    return () => clearTimeout(id);
  }, [width, height, play, reset]);

  const gesture = useMemo(() => {
    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(RESET_HOLD_MS)
      .onStart(reset);
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_event, success) => success && advance());
    return Gesture.Exclusive(hold, tap);
  }, [advance, reset]);

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
});
