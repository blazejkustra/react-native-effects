import { useCallback, useMemo, useState } from 'react';
import {
  type GestureResponderEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BubbleWrap from '../components/bubblewrap/BubbleWrap';
import { useBubbleWrap } from '../hooks/useBubbleWrap';
import { usePopSound } from '../hooks/usePopSound';

/**
 * Photo: "Oberfläche Wohnzimmertisch" by Martin Lorenz, CC BY-SA 3.0, via
 * Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Oberfl%C3%A4che_Wohnzimmertisch.JPG),
 * rotated to portrait.
 */
const WALNUT = require('../../assets/bubblewrap/walnut.jpg');
const IMG_W = 853;
const IMG_H = 1280;

/**
 * A sheet of bubble wrap on a walnut table.
 *
 * Press a bubble and it pops: a snap and a thump synthesized on the spot,
 * never the same twice, and the dome crumples flat. Drag a finger (or
 * several) across the sheet to pop everything it rolls over.
 */
export default function BubbleWrapScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [popped, setPopped] = useState(0);
  const playPop = usePopSound();

  const onPop = useCallback(() => {
    playPop();
    if (Platform.OS === 'android') {
      Vibration.vibrate(12);
    }
    setPopped((n) => n + 1);
  }, [playPop]);

  const { paramsSynchronizable, grid, dragTo, releaseTouches, reset } =
    useBubbleWrap(width, height, onPop);

  const coverScale = useMemo<[number, number]>(() => {
    const screenAspect = width / height;
    const imgAspect = IMG_W / IMG_H;
    return screenAspect < imgAspect
      ? [screenAspect / imgAspect, 1]
      : [1, imgAspect / screenAspect];
  }, [width, height]);

  const onTouches = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.touches) {
      dragTo(String(t.identifier), t.pageX, t.pageY);
    }
  };

  const onNewSheet = () => {
    reset();
    setPopped(0);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <BubbleWrap
        style={StyleSheet.absoluteFill}
        surface={WALNUT}
        coverScale={coverScale}
        grid={grid}
        paramsSynchronizable={paramsSynchronizable}
      />
      <View
        style={StyleSheet.absoluteFill}
        onTouchStart={onTouches}
        onTouchMove={onTouches}
        onTouchEnd={releaseTouches}
        onTouchCancel={releaseTouches}
      />
      {popped >= 12 ? (
        <Pressable
          style={[styles.newSheet, { bottom: insets.bottom + 18 }]}
          onPress={onNewSheet}
          hitSlop={8}
        >
          <Text style={styles.newSheetText}>New sheet</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#3a2614',
  },
  newSheet: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(20, 12, 6, 0.55)',
  },
  newSheetText: {
    color: 'rgba(255, 244, 230, 0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
});
