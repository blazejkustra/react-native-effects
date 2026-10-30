import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { useParamsSynchronizable } from 'react-native-effects';
import NameDropWave, { HOME_ATLAS } from '../components/namedrop/NameDropWave';
import PosterReveal from '../components/namedrop/PosterReveal';
import ContactPoster, {
  type ExchangeChoice,
  type PosterHandle,
} from '../components/namedrop/ContactPoster';

/** Downward drag (pt) that counts as bringing the other phone close. */
const TRIGGER_DRAG = 70;
/** Seconds from contact until the poster is fully on screen. */
const REVEAL_SECONDS = 2.15;
const RESET_AFTER_CHOICE_MS = 1600;

type Phase = 'home' | 'exchanging' | 'poster';

type NameDropDevHooks = {
  __nameDrop?: () => void;
  __nameDropWaveAt?: (seconds: number) => void;
  __nameDropSpeed?: (factor: number | null) => void;
};

let playbackSpeed = 1;

async function snapshotPoster(view: PosterHandle) {
  const raw = await captureRef(view, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });
  return raw.startsWith('file://') ? raw : `file://${raw}`;
}

/**
 * NameDrop: drag down from the top of the home screen (or tap it) to bring
 * the other iPhone close. A milky glow wells out of the Dynamic Island, the
 * home screen bulges and blurs beneath it like a liquid lens, a bright ripple
 * runs down the glass, and the other person's "Share Your Contact" poster
 * swells out of the island into focus. Tap the poster to go back.
 */
export default function NameDropScreen() {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('home');
  const [choice, setChoice] = useState<ExchangeChoice>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const live = useParamsSynchronizable([0, 0, 0, 0]);
  const setLive = live.setParamsSynchronizable;
  const posterRef = useRef<PosterHandle>(null);
  const clock = useRef(0);
  const frame = useRef<number | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cover = useSharedValue(1);

  const stopClock = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, []);

  useEffect(() => stopClock, [stopClock]);

  const play = useCallback(() => {
    stopClock();
    clock.current = 0;
    setChoice(null);
    setPhase('exchanging');
    cover.value = 1;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      clock.current += (Math.min(50, now - last) / 1000) * playbackSpeed;
      last = now;
      setLive(clock.current, 0, 0, 0);
      if (clock.current < REVEAL_SECONDS) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      frame.current = null;
      setPhase('poster');
      cover.value = 0;
    };
    frame.current = requestAnimationFrame(tick);
  }, [stopClock, cover, setLive]);

  const goHome = useCallback(() => {
    stopClock();
    clock.current = 0;
    setLive(0, 0, 0, 0);
    setPhase('home');
    cover.value = withTiming(1, { duration: 320 });
  }, [stopClock, cover, setLive]);

  const choose = useCallback(
    (picked: 'share' | 'receive') => {
      setChoice(picked);
      resetTimer.current = setTimeout(goHome, RESET_AFTER_CHOICE_MS);
    },
    [goHome]
  );

  const captureSnapshot = useCallback(() => {
    if (!posterRef.current) return;
    snapshotPoster(posterRef.current)
      .then(setSnapshot)
      .catch((e) => console.warn('[NameDrop] poster snapshot failed:', e));
  }, []);

  // `__nameDrop()` plays the exchange, `__nameDropWaveAt(seconds)` freezes
  // it at one moment and `__nameDropSpeed(factor | null)` slows it down.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as NameDropDevHooks;
    g.__nameDrop = play;
    g.__nameDropWaveAt = (seconds) => {
      stopClock();
      clock.current = seconds;
      setLive(seconds, 0, 0, 0);
      const done = seconds >= REVEAL_SECONDS;
      setPhase(done ? 'poster' : 'exchanging');
      cover.value = done ? 0 : 1;
    };
    g.__nameDropSpeed = (factor) => {
      playbackSpeed = factor ?? 1;
    };
    return () => {
      delete g.__nameDrop;
      delete g.__nameDropWaveAt;
      delete g.__nameDropSpeed;
    };
  }, [play, stopClock, cover, setLive]);

  const approach = Gesture.Pan()
    .runOnJS(true)
    .enabled(phase === 'home')
    .activeOffsetY(12)
    .onUpdate((e) => {
      if (e.translationY > TRIGGER_DRAG && frame.current === null) play();
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(phase === 'home')
    .onEnd(play);
  const homeGesture = Gesture.Exclusive(approach, tap);

  const coverStyle = useAnimatedStyle(() => ({ opacity: cover.value }));

  return (
    <View style={styles.root}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={goHome}
        disabled={phase !== 'poster'}
      >
        <ContactPoster
          ref={posterRef}
          width={width}
          height={height}
          choice={choice}
          onChoose={choose}
          onAvatarLoad={captureSnapshot}
        />
      </Pressable>
      <GestureDetector gesture={homeGesture}>
        <Animated.View
          style={[StyleSheet.absoluteFill, coverStyle]}
          pointerEvents={phase === 'poster' ? 'none' : 'auto'}
        >
          <View style={[StyleSheet.absoluteFill, styles.clip]}>
            <Image
              source={HOME_ATLAS}
              style={{ width: width * 3, height }}
              resizeMode="stretch"
            />
          </View>
          <NameDropWave
            style={StyleSheet.absoluteFill}
            paramsSynchronizable={live.paramsSynchronizable}
          />
          {snapshot !== null && (
            <PosterReveal
              style={StyleSheet.absoluteFill}
              paramsSynchronizable={live.paramsSynchronizable}
              snapshotUri={snapshot}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  clip: {
    overflow: 'hidden',
  },
});
