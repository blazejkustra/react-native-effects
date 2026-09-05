import { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';
import ParticleDispersion from '../components/dispersion/ParticleDispersion';

// Photo + subject data in one image: an orange tabby on fallen leaves
// (Wikimedia Commons, Hisashi, CC BY-SA 2.0), with its Vision "lift subject"
// mask and a distance-to-subject field packed into the right-hand panel.
const ATLAS = require('../../assets/dispersion/cat-atlas.png');
const PHOTO_W = 960;
const PHOTO_H = 2080;
const SUBJECT = { x: 480, y: 1166 };
const BACKDROP = '#6e625a';

// Timeline, ms. Slower than the reference clip on purpose: a small zoom, the
// background drifts off as dust over 5 s, then the cut-out settles in the
// middle while a light traces its silhouette for 4 s.
const ZOOM_MS = 420;
const ZOOM_TO = 1.05;
const DISSOLVE_DELAY_MS = 220;
const DISSOLVE_MS = 5000;
const RIM_DELAY_MS = 350;
const RIM_MS = 4000;
// The cut-out starts settling as soon as the visible glitter is gone, which
// is well before the last far-corner grains time out.
const LIFT_LEAD_MS = 1100;
const LIFT_MS = 900;

type Phase = 'idle' | 'running' | 'done';

const LABEL: Record<Phase, string> = {
  idle: 'Reveal the subject to find out.',
  running: 'Removing the background…',
  done: 'Yep. Cat.',
};

export default function ParticleDispersionScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('idle');
  // The question shows up once the background is gone.
  const [revealed, setRevealed] = useState(false);

  const progress = useSharedValue(0);
  const rim = useSharedValue(0);
  const zoom = useSharedValue(1);
  const seed = useSharedValue(0.37);
  const lifted = useSharedValue(0);
  // 8 floats: (progress, rim, zoom, seed) land in u.live, lift in u.liveData[0].
  const { paramsSynchronizable } = useParamsSynchronizable([
    0, 0, 1, 0.37, 0, 0, 0, 0,
  ]);
  useAnimatedReaction(
    () =>
      [
        progress.value,
        rim.value,
        zoom.value,
        seed.value,
        lifted.value,
      ] as const,
    ([p, r, z, s, l]) => {
      'worklet';
      paramsSynchronizable.setBlocking(() =>
        Float64Array.of(p, r, z, s, l, 0, 0, 0)
      );
    }
  );

  const reveal = useCallback(() => {
    setPhase('running');
    seed.value = Math.random();
    zoom.value = withTiming(ZOOM_TO, {
      duration: ZOOM_MS,
      easing: Easing.out(Easing.cubic),
    });
    lifted.value = withDelay(
      DISSOLVE_DELAY_MS + DISSOLVE_MS - LIFT_LEAD_MS,
      withTiming(1, { duration: LIFT_MS, easing: Easing.out(Easing.cubic) })
    );
    progress.value = withDelay(
      DISSOLVE_DELAY_MS,
      withTiming(
        1,
        { duration: DISSOLVE_MS, easing: Easing.linear },
        (finished) => {
          if (!finished) {
            return;
          }
          runOnJS(setRevealed)(true);
          rim.value = withDelay(
            RIM_DELAY_MS,
            withTiming(
              1,
              { duration: RIM_MS, easing: Easing.inOut(Easing.sin) },
              (done) => {
                if (done) {
                  runOnJS(setPhase)('done');
                }
              }
            )
          );
        }
      )
    );
  }, [lifted, progress, rim, seed, zoom]);

  const reset = useCallback(() => {
    progress.value = 0;
    rim.value = 0;
    lifted.value = 0;
    zoom.value = withTiming(1, { duration: 300 });
    setRevealed(false);
    setPhase('idle');
  }, [lifted, progress, rim, zoom]);

  const onPrimary = phase === 'idle' ? reveal : phase === 'done' ? reset : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="#0000" />
      <ParticleDispersion
        style={StyleSheet.absoluteFill}
        paramsSynchronizable={paramsSynchronizable}
        atlas={ATLAS}
        photoWidth={PHOTO_W}
        photoHeight={PHOTO_H}
        subject={SUBJECT}
        backdrop={BACKDROP}
      />

      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={[styles.back, { top: insets.top + 6 }]}
      >
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>

      {revealed && (
        <Animated.View
          entering={FadeIn.duration(600)}
          exiting={FadeOut.duration(200)}
          style={[styles.header, { top: insets.top + 40 }]}
        >
          <Text style={styles.title}>Is this a cat?</Text>
        </Animated.View>
      )}

      <View style={[styles.bar, { bottom: insets.bottom + 16 }]}>
        <Animated.Text
          key={phase}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.status}
          numberOfLines={2}
        >
          {LABEL[phase]}
        </Animated.Text>
        <Pressable
          onPress={onPrimary ?? undefined}
          disabled={!onPrimary}
          style={({ pressed }) => [
            styles.primary,
            !onPrimary && styles.primaryBusy,
            pressed && styles.primaryPressed,
          ]}
        >
          <Text style={styles.primaryText}>
            {phase === 'idle' ? 'Reveal' : phase === 'done' ? 'Again' : '…'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKDROP },
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
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontFamily: SERIF,
    fontSize: 34,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: 'rgba(22, 18, 16, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  status: {
    flex: 1,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    lineHeight: 18,
  },
  primary: {
    minWidth: 78,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBusy: { backgroundColor: 'rgba(255,255,255,0.35)' },
  primaryPressed: { opacity: 0.8 },
  primaryText: { color: '#1e1917', fontSize: 15, fontWeight: '600' },
});
