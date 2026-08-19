import { useMemo } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Flame from '../components/lighter/Flame';
import Lighter, {
  CASE_W,
  FLAME_H,
  FLAME_W,
  WICK_X,
  WICK_Y,
} from '../components/lighter/Lighter';
import { useLighterPhysics } from '../hooks/useLighterPhysics';

/** How far the lighter's bounding box sits above the bottom of the screen. */
const BOX_BOTTOM = 132;

/**
 * A lighter you can strike.
 *
 * Tap anywhere to spark the wheel and catch the flame; tap again to snuff it
 * and watch the smoke go up. Tilt the phone and the flame keeps pointing at
 * the ceiling, trailing a beat behind the twist. Chrome-free on purpose — the
 * whole screen is the lighter and the dark room around it (back = native edge
 * swipe).
 */
export default function LighterScreen() {
  const { width, height } = useWindowDimensions();
  const { paramsSynchronizable, toggle } = useLighterPhysics();

  // The case is centred on screen; the box extends to the right of it to make
  // room for the hinge, so the box's own left edge is offset from centre.
  const boxLeft = Math.round(width / 2 - CASE_W / 2);

  const flameParams = useMemo(
    () => [
      (boxLeft + WICK_X) / width,
      (BOX_BOTTOM + WICK_Y) / height,
      FLAME_H / height,
      FLAME_W / height,
    ],
    [boxLeft, width, height]
  );

  return (
    <Pressable style={styles.root} onPress={toggle}>
      <StatusBar hidden />
      <Flame
        params={flameParams}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
      <Lighter
        paramsSynchronizable={paramsSynchronizable}
        left={boxLeft}
        bottom={BOX_BOTTOM}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
});
