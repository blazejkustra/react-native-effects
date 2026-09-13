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
import { BackButton } from '../components/BackButton';
import Magic8Ball from '../components/magic8ball/Magic8Ball';
import { useMagic8BallPhysics } from '../hooks/useMagic8BallPhysics';

/** Ball radius as a fraction of the screen height, and of its width. */
const RADIUS_H = 0.25;
const RADIUS_W = 0.47;
/** Where the ball's centre sits, in screen uv (y-up). */
const CENTER_Y = 0.5;
/** The window, in ball radii. */
const WINDOW_R = 0.46;
const WINDOW_Y = -0.04;

/**
 * The answer text block, in window radii. The die hangs point-down, so its
 * width falls away toward the bottom: the text has to live in the upper third,
 * where there is room for a phrase, and stay narrow enough not to poke out
 * through the sloping sides.
 *
 * TEXT_WIDTH is what makes that true, and it is deliberately narrower than the
 * die's top edge. The box is a rectangle over a triangle, so it has to be cut
 * to the width the triangle still has at the BOTTOM line of the block, not at
 * the top — sized to the top edge, a second line runs out through both sloping
 * sides. Nothing measures at runtime: the answers carry their own line breaks,
 * and these four numbers are chosen so the longest of them fits.
 */
const TEXT_WIDTH = 0.84;
const TEXT_TOP = 0.33;
const TEXT_HEIGHT = 0.44;
const FONT_SCALE = 0.165;

/**
 * The classic twenty, said short — and broken into lines HERE, by hand.
 *
 * Two constraints, and they fight. The answer is printed on a triangle that
 * narrows as it goes down, so a line has room for about six characters at a
 * size anyone can read. And React Native's own answer to that,
 * `adjustsFontSizeToFit`, does not wrap a phrase that is too wide — it shrinks
 * it, past `minimumFontScale`, so NO CHANCE came out two thirds the size of
 * LIKELY and the screen looked broken. It also hides the real capacity from
 * you while you tune, because everything appears to fit.
 *
 * So the line breaks are data. Every line below is six characters or fewer,
 * every answer is at most two lines, and the font is fixed: nothing measures,
 * nothing shrinks, and every answer is exactly as big as every other one.
 * Adding an answer means counting its characters.
 */
const ANSWERS = [
  'YES',
  'YES\nINDEED',
  'NO\nDOUBT',
  'FOR\nSURE',
  'OF\nCOURSE',
  'LIKELY',
  'LOOKS\nGOOD',
  'GOOD\nSIGNS',
  'REPLY\nHAZY',
  'ASK\nLATER',
  'ASK\nAGAIN',
  "CAN'T\nSAY",
  'NO',
  'NOT\nNOW',
  'DOUBT\nIT',
  'NO\nCHANCE',
  'FORGET\nIT',
  'NO WAY',
  'BAD\nSIGNS',
  'NOT\nSURE',
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

  const { paramsSynchronizable, shake, rise, drift, spinDeg } =
    useMagic8BallPhysics({ onSubmerged });

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
      // From the middle of the text box down to the middle of the window,
      // which is the point the shader turns and scales the die about.
      dieOriginDy: (TEXT_TOP - TEXT_HEIGHT / 2) * wrPt,
    };
  }, [radius, width, height]);

  const answerStyle = useAnimatedStyle(() => {
    const r = rise.value;
    return {
      // Deep in the ink the shader shows a blurred triangle and no text at
      // all; text only makes sense once the die is close to the glass.
      opacity: interpolate(r, [0.55, 0.95], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: drift.value.x * geom.wrPt },
        { translateY: drift.value.y * geom.wrPt },
        // The shader turns and scales the die about the middle of the window,
        // not about this box — so step the origin down there, turn, scale, and
        // step back. Rotating about the text's own centre instead would slide
        // the words off the face they are printed on.
        { translateY: geom.dieOriginDy },
        { rotate: `${spinDeg.value}deg` },
        { scale: interpolate(r, [0.55, 1], [0.92, 1], Extrapolation.CLAMP) },
        { translateY: -geom.dieOriginDy },
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
          numberOfLines={2}
          allowFontScaling={false}
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

      {/* No title block: the object is the screen, and a heading over it
          only competes with the ball for the same dark space. */}
      <View
        style={[styles.backWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>
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
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
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
    // The lettering on a real answer die is raised, and the shader's key comes
    // from up and to the left — so it casts down and to the right.
    textShadowColor: 'rgba(2, 6, 26, 0.85)',
    textShadowOffset: { width: 1, height: 1.2 },
    textShadowRadius: 1.5,
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
