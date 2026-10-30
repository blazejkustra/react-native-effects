import { useMemo } from 'react';
import {
  type GestureResponderEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ferrofluid from '../components/ferrofluid/Ferrofluid';
import { useFerrofluidField } from '../hooks/useFerrofluidField';

/**
 * Photo: "Marble Kymi Euboea Greece" by Jebulon, CC0, via Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Marble_Kymi_Euboea_Greece.jpg),
 * rotated to portrait.
 */
const MARBLE = require('../../assets/ferrofluid/marble.jpg');
const IMG_W = 853;
const IMG_H = 1280;

/**
 * Ferrofluid that answers a real magnet.
 *
 * A puddle of black ferrofluid on a marble counter. Bring a magnet close to
 * the phone and the magnetometer picks it up: the fluid creeps toward it and
 * stands up into a field of sharp spikes that grow with the field. Without a
 * magnetometer, touch and hold: the finger is the magnet. "Recalibrate" takes
 * a fresh Earth-field baseline (do it with the magnet away).
 */
export default function FerrofluidScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { paramsSynchronizable, setTouch, calibrate, sensorAvailable } =
    useFerrofluidField(width, height);

  const coverScale = useMemo<[number, number]>(() => {
    const screenAspect = width / height;
    const imgAspect = IMG_W / IMG_H;
    return screenAspect < imgAspect
      ? [screenAspect / imgAspect, 1]
      : [1, imgAspect / screenAspect];
  }, [width, height]);

  const onTouch = (e: GestureResponderEvent) => {
    setTouch({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  };
  const onRelease = () => setTouch(null);

  const hint =
    sensorAvailable === false
      ? 'Touch and hold to bring in a magnet'
      : 'Hold a magnet near your phone';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <Ferrofluid
        style={StyleSheet.absoluteFill}
        surface={MARBLE}
        coverScale={coverScale}
        paramsSynchronizable={paramsSynchronizable}
      />
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={onRelease}
        onResponderTerminate={onRelease}
      />
      <View
        style={[styles.footer, { bottom: insets.bottom + 22 }]}
        pointerEvents="box-none"
      >
        <Text style={styles.hint}>{hint}</Text>
        {sensorAvailable ? (
          <Pressable onPress={calibrate} hitSlop={10}>
            <Text style={styles.calibrate}>Recalibrate</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#d9d6d1',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 10,
  },
  hint: {
    color: 'rgba(30, 30, 34, 0.62)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  calibrate: {
    color: 'rgba(30, 30, 34, 0.45)',
    fontSize: 13,
    fontWeight: '600',
  },
});
