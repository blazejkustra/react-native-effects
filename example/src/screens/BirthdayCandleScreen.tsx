import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CandleFlame from '../components/candle/CandleFlame';
import { useAudioReactive } from '../hooks/useAudioReactive';
import { useCandlePhysics } from '../hooks/useCandlePhysics';

const CAKE = require('../../assets/candle/cake.jpg');

/**
 * The cake photo, in its own pixels. The flame and wick in the original have
 * been painted out; the shader puts them back at `WICK_TIP`, which is where the
 * photographed wick ended. `CANDLE_TOP` is where the wax starts.
 */
const IMG_W = 730;
const IMG_H = 1043;
const WICK_TIP = { x: 378, y: 290 };
const CANDLE_TOP_Y = 313;
/** Flame size in image pixels, matched to the flame that was painted out. */
const FLAME_H = 124;
const FLAME_W = 26;
const WICK_R = 1.8;

/**
 * Breath → the mic's RMS level, boosted, weighted toward the low bins. A puff
 * of air on a phone mic is a broadband rumble with its energy at the bottom
 * of the spectrum; speech and music sit higher, so they bend the flame less
 * than they would on RMS alone. Both gains are set for a phone held at
 * blowing distance — not something a simulator can tune.
 */
const BREATH_GAIN = 4.0;
const BASS_WEIGHT = 1.2;

/**
 * A birthday candle you blow out.
 *
 * A photograph of a slice of cake, with the candle's flame rendered live on
 * top of it. The mic starts listening as soon as the screen opens: blow on
 * the phone and the flame bends, gutters, and goes out, leaving a red wick
 * and a wisp of smoke. Tap anywhere to light it again. Tilt the phone and the
 * flame stays pointing at the ceiling. Chrome-free on purpose — back is the
 * native edge swipe.
 */
export default function BirthdayCandleScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [everOut, setEverOut] = useState(false);
  const onOut = useCallback(() => setEverOut(true), []);
  const { paramsSynchronizable, setBreath, light } = useCandlePhysics({
    onOut,
  });

  const onFrame = useCallback(
    (rms: number, bass: number) => {
      const breath = Math.min(
        1,
        rms * BREATH_GAIN * Math.min(1, 0.4 + bass * BASS_WEIGHT)
      );
      setBreath(breath);
    },
    [setBreath]
  );
  const { start, listening, error } = useAudioReactive({
    onFrame,
    analyserSmoothing: 0.5,
  });

  // Open the screen, blow — no button to find first.
  useEffect(() => {
    start();
  }, [start]);

  // The photo covers the screen (scaled to the larger ratio, centred), and
  // the flame's geometry is derived from the same transform so the wick lands
  // exactly on the photographed candle on any screen size.
  const layout = useMemo(() => {
    const scale = Math.max(width / IMG_W, height / IMG_H);
    const w = IMG_W * scale;
    const h = IMG_H * scale;
    const left = (width - w) / 2;
    const top = (height - h) / 2;
    const wickX = (left + WICK_TIP.x * scale) / width;
    const wickY = 1 - (top + WICK_TIP.y * scale) / height;
    const params = [
      wickX,
      wickY,
      (FLAME_H * scale) / height,
      (FLAME_W * scale) / height,
      ((CANDLE_TOP_Y - WICK_TIP.y) * scale) / height,
      (WICK_R * scale) / height,
      0,
      0,
    ];
    return { image: { left, top, width: w, height: h }, params };
  }, [width, height]);

  const onPress = useCallback(() => {
    light();
  }, [light]);

  let caption = 'Blow on your phone';
  if (error) {
    caption = error;
  } else if (!listening) {
    caption = 'Waiting for the microphone…';
  } else if (everOut) {
    caption = 'Tap to light it again';
  }

  return (
    <Pressable style={styles.root} onPress={onPress}>
      <StatusBar hidden />
      <View style={styles.photo} pointerEvents="none">
        <Image source={CAKE} style={[styles.image, layout.image]} />
      </View>
      <CandleFlame
        params={layout.params}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
      <Text
        style={[
          styles.caption,
          error ? styles.captionError : null,
          { bottom: insets.bottom + 28, width },
        ]}
      >
        {caption}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0908',
  },
  photo: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
  },
  caption: {
    position: 'absolute',
    left: 0,
    paddingHorizontal: 32,
    textAlign: 'center',
    color: 'rgba(255, 240, 220, 0.62)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  captionError: {
    color: 'rgba(255, 150, 130, 0.85)',
  },
});
