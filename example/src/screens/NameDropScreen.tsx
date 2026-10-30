import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';
import NameDropWave from '../components/namedrop/NameDropWave';
import ContactPoster, {
  type ExchangeChoice,
} from '../components/namedrop/ContactPoster';

/** A real iPhone home screen screenshot, its status bar painted out. */
const HOME_SCREEN = require('../../assets/crt/home-screen.jpg');
/** The Dynamic Island centre on the iPhone 18 Pro Max, pt. */
const ISLAND_CENTER = { x: 220, y: 32 };
/** Drag distance (pt) that brings the other phone close enough. */
const TRIGGER_DRAG = 70;
const PEEK_REST = 16;
const PEEK_TOUCH = 34;
const CARD_DELAY_MS = 520;
const WAVE_SECONDS = 3;

type Phase = 'idle' | 'exchanging';

/**
 * NameDrop: drag the other phone (peeking in at the top edge) down onto this
 * one. The screen dims, a liquid bloom of light pours out of the Dynamic
 * Island and ripples across the screen, and the other person's Contact
 * Poster unfolds from the island with Receive Only / Share. Tap outside the
 * poster to part the phones.
 */
export default function NameDropScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [choice, setChoice] = useState<ExchangeChoice>(null);
  const wave = useParamsSynchronizable([0, 0, 0, 0]);
  const setWave = wave.setParamsSynchronizable;
  const waveStart = useRef(0);
  const waveStrength = useRef({ value: 0, target: 0 });
  const frame = useRef<number | null>(null);
  const isTogether = useRef(false);

  const dim = useSharedValue(0);
  const card = useSharedValue(0);
  const settle = useSharedValue(1);
  const peek = useSharedValue(PEEK_REST);

  const runWave = useCallback(() => {
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = waveStrength.current;
      s.value += (s.target - s.value) * (1 - Math.exp(-6 * dt));
      const t = (now - waveStart.current) / 1000;
      setWave(Math.min(t, WAVE_SECONDS), s.value, 0, 0);
      const idle = s.target === 0 && s.value < 0.005;
      frame.current = idle ? null : requestAnimationFrame(tick);
    };
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  }, [setWave]);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const startWave = useCallback(
    (strength: number) => {
      waveStart.current = performance.now();
      waveStrength.current = { value: strength, target: strength };
      runWave();
    },
    [runWave]
  );

  const connect = useCallback(() => {
    if (isTogether.current) return;
    isTogether.current = true;
    setPhase('exchanging');
    setChoice(null);
    peek.value = withSpring(PEEK_TOUCH, { damping: 16, stiffness: 180 });
    dim.value = withTiming(0.62, { duration: 380 });
    startWave(1);
    settle.value = 1;
    card.value = withDelay(
      CARD_DELAY_MS,
      withSpring(1, { damping: 18, stiffness: 150, mass: 1 })
    );
  }, [peek, dim, card, settle, startWave]);

  const choose = useCallback(
    (picked: 'share' | 'receive') => {
      setChoice(picked);
      settle.value = withSequence(
        withTiming(0.955, { duration: 140, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 160 })
      );
      if (picked === 'share') startWave(0.75);
    },
    [settle, startWave]
  );

  const part = useCallback(() => {
    if (!isTogether.current) return;
    isTogether.current = false;
    setPhase('idle');
    card.value = withTiming(0, {
      duration: 340,
      easing: Easing.in(Easing.cubic),
    });
    dim.value = withTiming(0, { duration: 420 });
    peek.value = withSpring(PEEK_REST, { damping: 18, stiffness: 160 });
    waveStrength.current.target = 0;
    runWave();
  }, [card, dim, peek, runWave]);

  // `__nameDrop()` brings the phones together without the drag;
  // `__nameDropWaveAt(seconds)` freezes the light at one moment.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as {
      __nameDrop?: () => void;
      __nameDropWaveAt?: (seconds: number) => void;
    };
    g.__nameDrop = connect;
    g.__nameDropWaveAt = (seconds) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setWave(seconds, 1, 0, 0);
    };
    return () => {
      delete g.__nameDrop;
      delete g.__nameDropWaveAt;
    };
  }, [connect, setWave]);

  const approach = Gesture.Pan()
    .runOnJS(true)
    .enabled(phase === 'idle')
    .onChange((e) => {
      peek.value = PEEK_REST + Math.max(0, e.translationY) * 0.45;
      if (e.translationY > TRIGGER_DRAG) connect();
    })
    .onEnd(() => {
      if (!isTogether.current) {
        peek.value = withSpring(PEEK_REST, { damping: 18, stiffness: 160 });
      }
    });
  const tapPeek = Gesture.Tap().runOnJS(true).onEnd(connect);
  const approachGesture = Gesture.Race(approach, tapPeek);

  const cardWidth = width - 20;
  const cardHeight = Math.round(height * 0.74);
  const cardTop = insets.top - 6;

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const peekStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: peek.value }],
  }));
  const cardStyle = useAnimatedStyle(() => {
    const p = card.value;
    const rise = (1 - p) * -(cardTop + cardHeight * 0.5 - ISLAND_CENTER.y);
    return {
      opacity: Math.min(1, p * 2.5),
      transform: [
        { translateY: rise },
        { scaleX: (0.22 + 0.78 * p) * settle.value },
        { scaleY: (0.06 + 0.94 * p) * settle.value },
      ],
    };
  });

  return (
    <View style={styles.root}>
      <Image
        source={HOME_SCREEN}
        style={{ width, height }}
        resizeMode="cover"
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
        pointerEvents="none"
      />
      <NameDropWave
        style={StyleSheet.absoluteFill}
        origin={ISLAND_CENTER}
        paramsSynchronizable={wave.paramsSynchronizable}
        pointerEvents="none"
      />
      {phase === 'exchanging' && (
        <Pressable style={StyleSheet.absoluteFill} onPress={part} />
      )}
      <Animated.View
        style={[
          styles.cardWrap,
          { top: cardTop, width: cardWidth, height: cardHeight },
          cardStyle,
        ]}
        pointerEvents={phase === 'exchanging' ? 'box-none' : 'none'}
      >
        <ContactPoster
          width={cardWidth}
          height={cardHeight}
          choice={choice}
          onChoose={choose}
        />
      </Animated.View>
      <GestureDetector gesture={approachGesture}>
        <View style={styles.approachZone}>
          <Animated.View style={[styles.otherPhone, peekStyle]}>
            <View style={styles.otherPhoneGlass} />
          </Animated.View>
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
  dim: {
    backgroundColor: '#000',
  },
  cardWrap: {
    position: 'absolute',
    left: 10,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
  },
  hidden: {
    opacity: 0,
  },
  approachZone: {
    position: 'absolute',
    top: 0,
    left: 120,
    right: 120,
    height: 120,
    alignItems: 'center',
    zIndex: 90,
  },
  otherPhone: {
    position: 'absolute',
    top: -90,
    width: 380,
    height: 90,
    borderBottomLeftRadius: 58,
    borderBottomRightRadius: 58,
    backgroundColor: '#2a2a2e',
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: '#9a9aa1',
    overflow: 'hidden',
  },
  otherPhoneGlass: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 0,
    bottom: 5,
    borderBottomLeftRadius: 52,
    borderBottomRightRadius: 52,
    backgroundColor: '#050506',
  },
});
