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
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { captureRef } from 'react-native-view-shot';
import { useParamsSynchronizable } from 'react-native-effects';
import NameDropWave, { SCENE_ATLAS } from '../components/namedrop/NameDropWave';
import PosterReveal from '../components/namedrop/PosterReveal';
import DuskPoster, {
  type PosterHandle,
} from '../components/namedrop/DuskPoster';

/** Downward drag (pt) that starts the wave. */
const TRIGGER_DRAG = 70;
/** Seconds from the start until the poster is fully on screen. */
const REVEAL_SECONDS = 2.42;

type Phase = 'home' | 'wave' | 'poster';

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
 * An animation over a misty morning scene: drag down from the top (or tap) and
 * a coloured glow climbs the screen and pools under the cut-out, a liquid wave
 * of light bursts out of it, and a poster swells into focus. Tap it to go back.
 */
export default function NameDropScreen() {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('home');
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const { paramsSynchronizable } = useParamsSynchronizable([0, 0, 0, 0]);
  const posterRef = useRef<PosterHandle>(null);
  const isPlaying = useRef(false);
  const clock = useSharedValue(0);
  const cover = useSharedValue(1);

  useAnimatedReaction(
    () => clock.value,
    (seconds) => {
      paramsSynchronizable.setBlocking(new Float64Array([seconds, 0, 0, 0]));
    }
  );

  const stopClock = useCallback(() => {
    cancelAnimation(clock);
    isPlaying.current = false;
  }, [clock]);

  useEffect(() => stopClock, [stopClock]);

  const showPoster = useCallback(() => {
    isPlaying.current = false;
    setPhase('poster');
  }, []);

  const play = useCallback(() => {
    stopClock();
    isPlaying.current = true;
    setPhase('wave');
    cover.value = 1;
    clock.value = 0;
    clock.value = withTiming(
      REVEAL_SECONDS,
      {
        duration: (REVEAL_SECONDS * 1000) / playbackSpeed,
        easing: Easing.linear,
      },
      (finished) => {
        if (!finished) return;
        cover.value = 0;
        scheduleOnRN(showPoster);
      }
    );
  }, [stopClock, cover, clock, showPoster]);

  const goHome = useCallback(() => {
    stopClock();
    clock.value = 0;
    setPhase('home');
    cover.value = withTiming(1, { duration: 320 });
  }, [stopClock, cover, clock]);

  const captureSnapshot = useCallback(() => {
    if (!posterRef.current) return;
    snapshotPoster(posterRef.current)
      .then(setSnapshot)
      .catch((e) => console.warn('[Wave Reveal] poster snapshot failed:', e));
  }, []);

  // `__nameDrop()` plays the wave, `__nameDropWaveAt(seconds)` freezes
  // it at one moment and `__nameDropSpeed(factor | null)` slows it down.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as NameDropDevHooks;
    g.__nameDrop = play;
    g.__nameDropWaveAt = (seconds) => {
      stopClock();
      clock.value = seconds;
      const done = seconds >= REVEAL_SECONDS;
      setPhase(done ? 'poster' : 'wave');
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
  }, [play, stopClock, cover, clock]);

  const approach = Gesture.Pan()
    .runOnJS(true)
    .enabled(phase === 'home')
    .activeOffsetY(12)
    .onUpdate((e) => {
      if (e.translationY > TRIGGER_DRAG && !isPlaying.current) play();
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
        <DuskPoster
          ref={posterRef}
          width={width}
          height={height}
          onImageLoad={captureSnapshot}
        />
      </Pressable>
      <GestureDetector gesture={homeGesture}>
        <Animated.View
          style={[StyleSheet.absoluteFill, coverStyle]}
          pointerEvents={phase === 'poster' ? 'none' : 'auto'}
        >
          <View style={[StyleSheet.absoluteFill, styles.clip]}>
            <Image
              source={SCENE_ATLAS}
              style={{ width: width * 3, height }}
              resizeMode="stretch"
            />
          </View>
          <NameDropWave
            style={StyleSheet.absoluteFill}
            paramsSynchronizable={paramsSynchronizable}
          />
          {snapshot !== null && (
            <PosterReveal
              style={StyleSheet.absoluteFill}
              paramsSynchronizable={paramsSynchronizable}
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
