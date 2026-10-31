import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import { CardArt } from '../components/wallet/CardArt';
import CardSurface, { CARD_RADIUS } from '../components/wallet/CardSurface';
import PayGlyph from '../components/wallet/PayGlyph';
import { playChime } from '../components/wallet/chime';
import { useHoldTilt } from '../hooks/useHoldTilt';

const CARD_ASPECT = 1.586;
const GLYPH_SIZE = 44;
const ACCENT = '#7FD6BE';

/** The reveal, in seconds from the tap. */
const FLOW = {
  ring: [0.1, 1.5],
  spark: [1.5, 1.8],
  settle: [2.2, 2.8],
  end: 4,
} as const;

type Stage = 'idle' | 'sweep' | 'revealed';

type DebugGlobal = { __walletSeek?: (t: number | null) => void };

function ramp(t: number, [a, b]: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

const STAGE_LABEL: Record<Stage, string> = {
  idle: 'Tap to reveal your card',
  sweep: 'Catching the light',
  revealed: 'There it is',
};

/**
 * A brushed titanium card under a moving light. Tap anywhere: the card lifts,
 * a glint runs over it and a ring draws in the sheet below, then a chime and
 * a haptic land and the card settles back. Tilting the phone slides the light
 * across the brushed metal.
 *
 * Dev builds: `__walletTilt(x, y)` stands in for the motion sensor and
 * `__walletSeek(seconds)` freezes the flow at a moment (`null` resumes).
 */
export default function WalletPayScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tilt = useHoldTilt('__walletTilt');
  const card = useParamsSynchronizable([0, 0, 0, 0]);
  const glyph = useParamsSynchronizable([0, 0, 0, 0]);
  const startedAt = useRef<number | null>(null);
  const frozenAt = useRef<number | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const lift = useSharedValue(0);

  const cardWidth = width - 32;
  const cardHeight = cardWidth / CARD_ASPECT;
  const cardTop = insets.top + 92;

  const setCard = card.setParamsSynchronizable;
  const setGlyph = glyph.setParamsSynchronizable;

  useEffect(() => {
    let frame = 0;
    let revealed = false;
    let shown: Stage = 'idle';
    const step = () => {
      const t0 = startedAt.current;
      const t =
        frozenAt.current ?? (t0 === null ? -1 : (Date.now() - t0) / 1000);
      const running = t >= 0 && t < FLOW.end;

      const glint = running ? ramp(t, [0.05, 1.5]) : 0;
      const up = running
        ? easeOut(ramp(t, [0, 0.35])) * (1 - ramp(t, FLOW.settle))
        : 0;
      lift.value = up;
      setCard(tilt.current.x, tilt.current.y, glint, up);

      if (running) {
        setGlyph(ramp(t, FLOW.ring), ramp(t, FLOW.spark), 0, 0);
        if (!revealed && t >= FLOW.spark[0]) {
          revealed = true;
          Vibration.vibrate(40);
          playChime();
        }
      } else {
        setGlyph(0, 0, 0, 0);
        startedAt.current = null;
        revealed = false;
      }

      let next: Stage = 'idle';
      if (running) {
        next = t < FLOW.spark[0] ? 'sweep' : 'revealed';
      }
      if (next !== shown) {
        shown = next;
        setStage(next);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lift, setCard, setGlyph, tilt]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    (globalThis as DebugGlobal).__walletSeek = (t) => {
      frozenAt.current = t;
    };
    return () => {
      delete (globalThis as DebugGlobal).__walletSeek;
    };
  }, []);

  const reveal = useCallback(() => {
    if (startedAt.current === null) {
      startedAt.current = Date.now();
    }
  }, []);

  const tap = Gesture.Tap().runOnJS(true).onEnd(reveal);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -6 * lift.value },
      { scale: 1 + 0.035 * lift.value },
    ],
    shadowOpacity: 0.35 + 0.35 * lift.value,
    shadowRadius: 18 + 18 * lift.value,
  }));

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.root} collapsable={false}>
        <StatusBar barStyle="light-content" />

        <Animated.View
          style={[
            styles.card,
            { top: cardTop, width: cardWidth, height: cardHeight },
            cardStyle,
          ]}
          pointerEvents="none"
        >
          <View style={styles.cardClip}>
            <CardSurface
              paramsSynchronizable={card.paramsSynchronizable}
              style={StyleSheet.absoluteFill}
            />
            <CardArt />
          </View>
        </Animated.View>

        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}
          pointerEvents="none"
        >
          <Text style={styles.sheetTitle}>Sterling Titanium</Text>
          <Text style={styles.sheetBody}>
            A made-up card for showing off a light effect. Nothing here is
            connected to a bank.
          </Text>
          <View style={styles.status}>
            <View style={styles.glyph}>
              <PayGlyph
                paramsSynchronizable={glyph.paramsSynchronizable}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <Text style={styles.label}>{STAGE_LABEL[stage]}</Text>
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  card: {
    position: 'absolute',
    left: 16,
    borderRadius: CARD_RADIUS,
    backgroundColor: '#0e0f11',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
  },
  cardClip: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 26,
    paddingHorizontal: 24,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    backgroundColor: '#16211E',
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetBody: {
    marginTop: 6,
    color: '#9DB0AA',
    fontSize: 15,
    lineHeight: 21,
  },
  status: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: GLYPH_SIZE,
  },
  glyph: {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
  },
  label: {
    color: ACCENT,
    fontSize: 17,
    fontWeight: '600',
  },
});
