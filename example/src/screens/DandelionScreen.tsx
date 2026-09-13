import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Dandelion from '../components/dandelion/Dandelion';
import { useAudioReactive } from '../hooks/useAudioReactive';
import { useDandelionPhysics } from '../hooks/useDandelionPhysics';

/**
 * Photo: "Taraxacum seedhead Paslieres 2013-05-09 n01" by Marie-Lan Nguyen,
 * CC BY 2.5, via Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Taraxacum_seedhead_Paslieres_2013-05-09_n01.jpg).
 * Built into a three-panel atlas by `assets/dandelion/tools/build-atlas.sh`:
 * the photo (extended upward with more bokeh so the seeds have sky), the
 * photo with the head painted out, and the head mask + hair matte.
 */
const ATLAS = require('../../assets/dandelion/dandelion-atlas.jpg');
const PANEL_W = 1000;
const PANEL_H = 2174;
const HEAD = { x: 503, y: 1321, r: 395 };

/**
 * Breath → the mic's RMS level, boosted, weighted toward the low bins. A puff
 * of air on a phone mic is a broadband rumble with its energy at the bottom
 * of the spectrum; speech and music sit higher. Same gains as the candle —
 * set for a phone at blowing distance, not something a simulator can tune.
 */
const BREATH_GAIN = 4.0;
const BASS_WEIGHT = 1.2;
const MIC_WARMUP_MS = 400;

/**
 * A dandelion clock you blow on.
 *
 * A photograph of a seed head; the mic listens from the moment the screen
 * opens. A gentle puff takes a few seeds off the windward side, a held breath
 * strips the head bald, and the loose seeds ride the breath up and away.
 * They do not come back — tap anywhere to grow a new head.
 */
export default function DandelionScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { paramsSynchronizable, setBreath, reset, getDetached } =
    useDandelionPhysics();
  // Coarse view of the sim for the caption: 'full', 'some', or 'bald'.
  const [state, setState] = useState<'full' | 'some' | 'bald'>('full');

  // The analyser's first frames read its zero-filled buffers, which look like a
  // full-scale blast (every sample at -1). A candle only flickers at that; a
  // dandelion would lose a tenth of its seeds before anyone breathed. Ignore
  // the mic for its first few hundred ms.
  const micStartedAt = useRef<number | null>(null);
  const onFrame = useCallback(
    (rms: number, bass: number) => {
      const now = Date.now();
      if (micStartedAt.current === null) {
        micStartedAt.current = now;
      }
      if (now - micStartedAt.current < MIC_WARMUP_MS) {
        return;
      }
      setBreath(
        Math.min(1, rms * BREATH_GAIN * Math.min(1, 0.4 + bass * BASS_WEIGHT))
      );
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

  // The sim lives in a ref and ticks at 60 Hz; the caption only needs to know
  // roughly how much is left, so poll it slowly instead of re-rendering per frame.
  useEffect(() => {
    const id = setInterval(() => {
      const d = getDetached();
      setState(d >= 0.97 ? 'bald' : d > 0.02 ? 'some' : 'full');
    }, 400);
    return () => clearInterval(id);
  }, [getDetached]);

  const onPress = useCallback(() => {
    if (getDetached() > 0.02) {
      reset();
      setState('full');
    }
  }, [getDetached, reset]);

  let caption = 'Blow on your phone';
  if (error) {
    caption = error;
  } else if (!listening) {
    caption = 'Waiting for the microphone…';
  } else if (state === 'bald') {
    caption = 'Tap to grow it back';
  } else if (state === 'some') {
    caption = 'Keep blowing, or tap to start over';
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="#0000" />
      <Dandelion
        style={StyleSheet.absoluteFill}
        paramsSynchronizable={paramsSynchronizable}
        atlas={ATLAS}
        panelWidth={PANEL_W}
        panelHeight={PANEL_H}
        head={HEAD}
      />
      {/* Tap anywhere to grow it back. A layer rather than a wrapping Pressable,
          so Back and the caption stay separate accessibility nodes. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityLabel="Grow the dandelion back"
      />
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { top: insets.top + 6 }]}
      >
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <Text
        style={[
          styles.caption,
          error ? styles.captionError : null,
          { bottom: insets.bottom + 28, width },
        ]}
      >
        {caption}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#3f6a2a',
  },
  back: {
    position: 'absolute',
    left: 14,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 36,
    marginTop: -4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 6,
  },
  caption: {
    position: 'absolute',
    left: 0,
    paddingHorizontal: 32,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 8,
  },
  captionError: {
    color: 'rgba(255, 190, 170, 0.95)',
  },
});
