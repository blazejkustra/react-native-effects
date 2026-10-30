import { useMemo } from 'react';
import { StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import LavaLamp from '../components/lavalamp/LavaLamp';
import { useLavaLamp } from '../hooks/useLavaLamp';

/**
 * Photo: "Lava lamp (yellow)" by DMGualtieri, CC BY-SA 4.0, via Wikimedia
 * Commons (https://commons.wikimedia.org/wiki/File:Lava_lamp_(yellow).jpg).
 * Its glass is redrawn by the shader; the cap, base and room are the photo.
 */
const LAMP = require('../../assets/lavalamp/lava-lamp.jpg');
const IMG_W = 1280;
const IMG_H = 1795;

/**
 * A lava lamp on a table in the evening. The wax heats at the bottom, rises,
 * cools and sinks at a lava lamp's own pace. Tilt the phone and the wax
 * drifts along real gravity.
 */
export default function LavaLampScreen() {
  const { width, height } = useWindowDimensions();
  const { paramsSynchronizable } = useLavaLamp();

  const coverScale = useMemo<[number, number]>(() => {
    const screenAspect = width / height;
    const imgAspect = IMG_W / IMG_H;
    return screenAspect < imgAspect
      ? [screenAspect / imgAspect, 1]
      : [1, imgAspect / screenAspect];
  }, [width, height]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LavaLamp
        style={StyleSheet.absoluteFill}
        photo={LAMP}
        coverScale={coverScale}
        paramsSynchronizable={paramsSynchronizable}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#120c08',
  },
});
