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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import {
  CardArt,
  StackCard,
  type StackCardSpec,
} from '../components/wallet/CardArt';
import CardSurface, { CARD_RADIUS } from '../components/wallet/CardSurface';
import PayGlyph from '../components/wallet/PayGlyph';
import { playChime } from '../components/wallet/chime';
import { useHoldTilt } from '../hooks/useHoldTilt';

const CARD_ASPECT = 1.586;
const GLYPH_SIZE = 84;

/** The flow, in seconds from the double click. */
const FLOW = {
  faceIn: [0.15, 0.35],
  nod: [0.35, 0.8],
  ringIn: [0.75, 0.95],
  checkDraw: [1.2, 1.45],
  faceOut: [1.7, 1.85],
  readerIn: [1.85, 2.1],
  paid: 4.4,
  doneIn: [4.4, 4.75],
  settle: [4.6, 5.2],
  end: 7.2,
  doneOut: [7.2, 7.5],
} as const;

type Stage = 'idle' | 'auth' | 'reader' | 'done';

type DebugGlobal = { __walletSeek?: (t: number | null) => void };

function ramp(t: number, [a, b]: readonly [number, number]): number {
  return Math.max(0, Math.min(1, (t - a) / (b - a)));
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

function stageAt(t: number): Stage {
  if (t < FLOW.readerIn[0]) {
    return 'auth';
  }
  if (t < FLOW.paid) {
    return 'reader';
  }
  if (t < FLOW.doneOut[1]) {
    return 'done';
  }
  return 'idle';
}

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  auth: 'Pay with Face ID',
  reader: 'Hold Near Reader',
  done: 'Done',
};

/**
 * Apple Pay, the double-click-to-pay sheet.
 *
 * A brushed titanium card waits at the top, the other cards stacked at the
 * bottom, and the side-button hint. Double-tap anywhere (standing in for the
 * double click): the card lifts and a glint runs over it, Face ID scans and
 * checks, Hold Near Reader pulses, then the payment lands with a haptic, a
 * chime and the blue Done check, and the card settles back. Tilting the
 * phone slides the light across the brushed metal.
 *
 * Dev builds: `__walletTilt(x, y)` stands in for the motion sensor and
 * `__walletSeek(seconds)` freezes the flow at a moment (`null` resumes).
 */
export default function WalletPayScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tilt = useHoldTilt('__walletTilt');
  const card = useParamsSynchronizable([0, 0, 0, 0]);
  const glyph = useParamsSynchronizable([0, 0, 0, 0, 0, 0, 0, 0]);
  const startedAt = useRef<number | null>(null);
  const frozenAt = useRef<number | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const lift = useSharedValue(0);
  const nudge = useSharedValue(0);

  const cardWidth = width - 32;
  const cardHeight = cardWidth / CARD_ASPECT;
  const cardTop = insets.top + 68;

  useEffect(() => {
    nudge.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 420, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 700 })
      ),
      -1
    );
  }, [nudge]);

  const setCard = card.setParamsSynchronizable;
  const setGlyph = glyph.setParamsSynchronizable;

  useEffect(() => {
    let frame = 0;
    let spin = 0;
    let last = Date.now();
    let shown: Stage = 'idle';
    let paid = false;
    const step = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      spin += dt * 6;
      const t0 = startedAt.current;
      const t = frozenAt.current ?? (t0 === null ? -1 : (now - t0) / 1000);
      const running = t >= 0 && t < FLOW.doneOut[1];

      const glint = running ? ramp(t, [0.05, 0.95]) : 0;
      const up = running
        ? easeOut(ramp(t, [0, 0.35])) * (1 - ramp(t, FLOW.settle))
        : 0;
      lift.value = up;
      setCard(tilt.current.x, tilt.current.y, glint, up);

      if (running) {
        const faceAmt = ramp(t, FLOW.faceIn) * (1 - ramp(t, FLOW.faceOut));
        const ring = ramp(t, FLOW.ringIn);
        const check =
          ramp(t, FLOW.checkDraw) - ramp(t, [FLOW.faceOut[0], 1.82]);
        const reader =
          ramp(t, FLOW.readerIn) * (1 - ramp(t, [FLOW.paid, FLOW.paid + 0.2]));
        const done = ramp(t, FLOW.doneIn) * (1 - ramp(t, FLOW.doneOut));
        const nod =
          Math.sin((t - FLOW.nod[0]) * 10) *
          ramp(t, [FLOW.nod[0], FLOW.nod[0] + 0.1]) *
          (1 - ramp(t, [FLOW.nod[1] - 0.1, FLOW.nod[1]]));
        setGlyph(faceAmt, ring, Math.max(0, check), reader, done, spin, nod, 0);
        if (!paid && t >= FLOW.paid) {
          paid = true;
          Vibration.vibrate(40);
          playChime();
        }
      } else {
        setGlyph(0, 0, 0, 0, 0, spin, 0, 0);
        startedAt.current = null;
      }

      const next = running ? stageAt(t) : 'idle';
      if (next !== shown) {
        shown = next;
        if (next === 'auth') {
          paid = false;
        }
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

  const pay = useCallback(() => {
    if (startedAt.current === null) {
      startedAt.current = Date.now();
    }
  }, []);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(350)
    .runOnJS(true)
    .onEnd(pay);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -6 * lift.value },
      { scale: 1 + 0.035 * lift.value },
    ],
    shadowOpacity: 0.35 + 0.35 * lift.value,
    shadowRadius: 18 + 18 * lift.value,
  }));

  const hintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nudge.value }],
  }));

  const label = STAGE_LABEL[stage];
  const sideTop = cardTop + cardHeight + 28;
  const sideHeight = height * 0.075;

  return (
    <GestureDetector gesture={doubleTap}>
      <View style={styles.root} collapsable={false}>
        <StatusBar barStyle="light-content" />

        <View style={[styles.stack, { width: cardWidth }]} pointerEvents="none">
          {STACK.map((spec, i) => (
            <StackCard
              key={spec.name}
              spec={spec}
              width={cardWidth}
              height={cardHeight}
              top={height - insets.bottom - 132 + i * 46}
            />
          ))}
        </View>

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

        {stage === 'idle' && (
          <View
            style={[styles.side, { top: sideTop, height: sideHeight }]}
            pointerEvents="none"
          >
            <Animated.View style={[styles.sideRow, hintStyle]}>
              <Text style={styles.sideText}>{'Double Click\nto Pay'}</Text>
              <View style={[styles.sidePill, { height: sideHeight }]} />
            </Animated.View>
          </View>
        )}

        <View
          style={[styles.status, { top: cardTop + cardHeight + 64 }]}
          pointerEvents="none"
        >
          <PayGlyph
            paramsSynchronizable={glyph.paramsSynchronizable}
            style={styles.glyph}
          />
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const STACK: StackCardSpec[] = [
  { name: 'coral', color: '#f0604a', ink: '#fff6f2', mark: 'VISA' },
  { name: 'Northwind Bank', color: '#1d3f8f', ink: '#e8eeff', mark: 'VISA' },
  { name: 'Savings', color: '#e4e4e8', ink: '#2b2b30', mark: '●●' },
];

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  stack: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
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
  side: {
    position: 'absolute',
    right: 0,
    justifyContent: 'center',
  },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    marginRight: 14,
    lineHeight: 21,
  },
  sidePill: {
    width: 6,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: '#fff',
  },
  status: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  glyph: {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
  },
  label: {
    marginTop: 16,
    color: 'rgba(235, 235, 245, 0.62)',
    fontSize: 19,
    fontWeight: '400',
    letterSpacing: -0.2,
    minHeight: 26,
  },
});
