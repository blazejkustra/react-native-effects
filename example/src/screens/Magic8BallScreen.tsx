import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import Magic8Ball from '../components/magic8ball/Magic8Ball';
import { useMagic8BallPhysics } from '../hooks/useMagic8BallPhysics';

/** Ball radius as a fraction of the screen height, and of its width. */
const RADIUS_H = 0.25;
const RADIUS_W = 0.42;
/** Where the ball's centre sits, in screen uv (y-up). */
const CENTER_Y = 0.48;
/** The window, in ball radii. */
const WINDOW_R = 0.46;
const WINDOW_Y = -0.04;

/**
 * The answer text block, in window radii. The die hangs point-down, so its
 * width falls away toward the bottom: the text has to live in the upper third,
 * where there is room for a phrase, and stay narrow enough not to poke out
 * through the sloping sides.
 */
const TEXT_WIDTH = 1.15;
const TEXT_TOP = 0.34;
const TEXT_HEIGHT = 0.42;
const FONT_SCALE = 0.14;

/** The classic twenty, minus the duplicates. */
const ANSWERS = [
  'IT IS CERTAIN',
  'WITHOUT A DOUBT',
  'YES — DEFINITELY',
  'YOU MAY RELY ON IT',
  'MOST LIKELY',
  'OUTLOOK GOOD',
  'YES',
  'SIGNS POINT TO YES',
  'REPLY HAZY, TRY AGAIN',
  'ASK AGAIN LATER',
  'BETTER NOT TELL YOU NOW',
  'CANNOT PREDICT NOW',
  'CONCENTRATE AND ASK AGAIN',
  "DON'T COUNT ON IT",
  'MY REPLY IS NO',
  'MY SOURCES SAY NO',
  'OUTLOOK NOT SO GOOD',
  'VERY DOUBTFUL',
];

/**
 * A Magic 8-ball.
 *
 * Shake the phone and the fluid churns, dragging the answer off the window and
 * back into the ink. Once it settles, buoyancy floats a new one up along
 * whichever way is really up — so tip the phone and the answer arrives from a
 * different corner — and it bumps the glass once before it comes to rest.
 * Tapping the ball shakes it too, which is the only way to see any of this on
 * a simulator with no accelerometer.
 */
export default function Magic8BallScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [answer, setAnswer] = useState(ANSWERS[6]);
  // Read inside the callback below without making it a dependency, so the
  // physics loop never sees a new identity.
  const answerRef = useRef(answer);
  answerRef.current = answer;

  const onSubmerged = useCallback(() => {
    // Never the same answer twice in a row — a shake that changes nothing
    // reads as a bug, not as fate.
    const others = ANSWERS.filter((a) => a !== answerRef.current);
    setAnswer(others[Math.floor(Math.random() * others.length)] as string);
  }, []);

  const { paramsSynchronizable, shake, rise, drift } = useMagic8BallPhysics({
    onSubmerged,
  });

  // Radius is a fraction of the height, but a short wide screen has to cap it
  // on width or the ball runs off the sides.
  const radius = useMemo(
    () => Math.min(RADIUS_H, (RADIUS_W * width) / height),
    [width, height]
  );

  const params = useMemo(
    () => [0.5, CENTER_Y, radius, WINDOW_R, WINDOW_Y, 0, 0, 0],
    [radius]
  );

  // The text has to land on a die the shader placed, so it is positioned by
  // the same numbers the shader gets: ball radius in points, then the window
  // centre and radius in ball radii.
  const geom = useMemo(() => {
    const radPt = radius * height;
    const wrPt = WINDOW_R * radPt;
    return {
      wrPt,
      centerX: 0.5 * width,
      centerY: (1 - (CENTER_Y + WINDOW_Y * radius)) * height,
    };
  }, [radius, width, height]);

  const answerStyle = useAnimatedStyle(() => {
    const r = rise.value;
    return {
      // Deep in the ink the shader shows a blurred triangle and no text at
      // all; text only makes sense once the die is close to the glass.
      opacity: interpolate(r, [0.45, 0.92], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: drift.value.x * geom.wrPt },
        { translateY: drift.value.y * geom.wrPt },
        { scale: interpolate(r, [0.45, 1], [0.76, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Magic8Ball
        params={params}
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.answerBox,
          {
            width: TEXT_WIDTH * geom.wrPt,
            left: geom.centerX - (TEXT_WIDTH * geom.wrPt) / 2,
            top: geom.centerY - TEXT_TOP * geom.wrPt,
            height: TEXT_HEIGHT * geom.wrPt,
          },
          answerStyle,
        ]}
      >
        <Text
          style={[
            styles.answer,
            {
              fontSize: FONT_SCALE * geom.wrPt,
              lineHeight: FONT_SCALE * geom.wrPt * 1.15,
            },
          ]}
          numberOfLines={4}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {answer}
        </Text>
      </Animated.View>

      {/* Tapping the ball shakes it. A sibling rather than a wrapper, so the
          back button stays its own element instead of being swallowed into
          one accessibility node. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => shake(1)}
        accessibilityRole="button"
        accessibilityLabel="Shake the ball"
      />

      <Header
        title="Magic 8-ball"
        subtitle="Shake the phone — the answer floats up through the ink"
        transparent
      />
      <Text style={[styles.caption, { bottom: insets.bottom + 28, width }]}>
        Ask something, then shake it
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08090c',
  },
  answerBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answer: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  caption: {
    position: 'absolute',
    // Never eat a tap meant for the ball underneath.
    pointerEvents: 'none',
    left: 0,
    paddingHorizontal: 32,
    textAlign: 'center',
    color: 'rgba(220, 232, 255, 0.55)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
