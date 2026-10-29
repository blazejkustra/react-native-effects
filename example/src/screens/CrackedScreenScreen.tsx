import { type ComponentRef, useMemo, useRef } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import CrackedGlass from '../components/cracks/CrackedGlass';
import LockScreen from '../components/cracks/LockScreen';
import { useCrackedGlass } from '../components/cracks/useCrackedGlass';
import { useSnapshotTexture } from '../components/cracks/useSnapshotTexture';

/**
 * Wallpaper: "Seaside swing at dusk" by Georg Nietsch (Unsplash), CC0, via
 * Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Seaside_swing_at_dusk_(Unsplash).jpg).
 */
const WALLPAPER = require('../../assets/cracks/swing.jpg');
const NOTIFICATION = {
  title: 'Mom',
  body: 'Did you drop your phone again? Your screen looked weird on FaceTime',
};

/**
 * Tap anywhere and the cover glass breaks where you hit it. Long press to put
 * a fresh screen on.
 */
export default function CrackedScreenScreen() {
  const insets = useSafeAreaInsets();
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
          <LockScreen
            ref={lockRef}
            wallpaper={WALLPAPER}
            notification={NOTIFICATION}
            onLayout={schedule}
          />
          {uri ? (
            <CrackedGlass
              textureUri={uri}
              paramsSynchronizable={paramsSynchronizable}
              style={styles.fill}
              pointerEvents="none"
            />
          ) : null}
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
