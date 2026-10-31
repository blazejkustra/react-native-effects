import { type ComponentRef, useMemo, useRef } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import CrackedGlass from '../components/cracks/CrackedGlass';
import EffectCaption from '../components/cracks/EffectCaption';
import LockScreen from '../components/cracks/LockScreen';
import { useCrackedGlass } from '../components/cracks/useCrackedGlass';
import { useSnapshotTexture } from '../components/cracks/useSnapshotTexture';

/**
 * Wallpaper: "Seaside swing at dusk" by Georg Nietsch (Unsplash), CC0, via
 * Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Seaside_swing_at_dusk_(Unsplash).jpg).
 */
const WALLPAPER = require('../../assets/cracks/swing.jpg');

/**
 * Tap anywhere and the glass breaks where you hit it. Long press to put a
 * fresh pane on.
 */
export default function CrackedScreenScreen() {
  const lockRef = useRef<ComponentRef<typeof View>>(null);
  const { uri, schedule } = useSnapshotTexture(lockRef);
  const { paramsSynchronizable, hit, reset } = useCrackedGlass();

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(400)
      .onEnd((e, success) => {
        if (success) {
          hit(e.x, e.y);
        }
      });
    const hold = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(650)
      .onStart(reset);
    return Gesture.Exclusive(hold, tap);
  }, [hit, reset]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <GestureDetector gesture={gesture}>
        <View style={styles.fill} collapsable={false}>
          <LockScreen ref={lockRef} wallpaper={WALLPAPER} onLayout={schedule} />
          {uri ? (
            <CrackedGlass
              textureUri={uri}
              paramsSynchronizable={paramsSynchronizable}
              style={styles.fill}
              pointerEvents="none"
            />
          ) : null}
          <EffectCaption />
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
