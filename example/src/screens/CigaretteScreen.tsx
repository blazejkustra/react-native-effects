import { useMemo } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import Cigarette, {
  CIG_ASPECT,
  FILTER_FRAC,
  HEADROOM,
  PANE_SCALE,
} from '../components/cigarette/Cigarette';
import Smoke from '../components/cigarette/Smoke';
import { useCigarettePhysics } from '../hooks/useCigarettePhysics';

/** The cigarette's width on screen, in points. */
const CIG_W = 68;
/** Where the unburnt tip sits, as a fraction of the screen's height from the top. */
const TIP_FRAC = 0.55;

/**
 * A cigarette smouldering in a dark room.
 *
 * Hold a finger anywhere to take a drag and let go to exhale; tap to flick
 * the ash. It burns down on its own, drops its ash when it gets long and
 * goes out at the filter — tap to light another. Tilt the phone and the
 * smoke keeps rising toward the real ceiling. No chrome: back is the native
 * edge swipe.
 */
export default function CigaretteScreen() {
  const { width, height } = useWindowDimensions();
  const { paramsSynchronizable, pressIn, pressOut } = useCigarettePhysics();

  const cigL = CIG_W * CIG_ASPECT;
  const viewH = cigL * HEADROOM;
  const tipTop = Math.round(height * TIP_FRAC);
  const layout = useMemo(
    () => ({
      left: Math.round(width / 2 - (CIG_W * PANE_SCALE) / 2),
      top: tipTop - (viewH - cigL),
      width: CIG_W * PANE_SCALE,
      height: viewH,
    }),
    [width, tipTop, viewH, cigL]
  );

  const smokeParams = useMemo(
    () => [
      0.5,
      1 - tipTop / height,
      CIG_W / height,
      (cigL * (1 - FILTER_FRAC)) / height,
    ],
    [tipTop, height, cigL]
  );

  return (
    <Pressable
      style={styles.root}
      onPressIn={pressIn}
      onPressOut={pressOut}
      delayLongPress={100000}
    >
      <StatusBar hidden />
      <Smoke
        params={smokeParams}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
      <Cigarette
        paramsSynchronizable={paramsSynchronizable}
        pointerEvents="none"
        style={[styles.cigarette, layout]}
      />
      <Text style={styles.hint}>hold to drag · tap to flick the ash</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  cigarette: {
    position: 'absolute',
  },
  hint: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.28)',
    fontSize: 13,
    letterSpacing: 0.4,
  },
});
