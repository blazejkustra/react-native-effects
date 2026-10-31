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
import Magic8Ball from '../components/magic8ball/Magic8Ball';
import { useMagic8BallPhysics } from '../hooks/useMagic8BallPhysics';

/** Orb radius as a fraction of the screen height, and of its width. */
const RADIUS_H = 0.25;
const RADIUS_W = 0.47;
/** Where the orb's centre sits, in screen uv (y-up). */
const CENTER_Y = 0.52;
/** The clearing the answer shows through, in orb radii. */
const REVEAL_R = 0.6;
const REVEAL_Y = 0;

/** The answer text block, in reveal radii. */
const TEXT_WIDTH = 1.5;
const TEXT_HEIGHT = 0.72;
const FONT_SCALE = 0.22;

const ANSWERS = [
  'YES',
  'YES\nINDEED',
  'NO\nDOUBT',
  'FOR\nSURE',
  'OF\nCOURSE',
  'LIKELY',
  'LOOKS\nGOOD',
  'GOOD\nSIGNS',
  'ALL\nHAZY',
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
 * A mystic glass orb.
 *
 * Shake the phone and the mist closes over the answer. Once it settles, a
 * clearing rises along whichever way is really up and a new answer shows
 * through. Tapping the orb shakes it too, for a simulator with no
 * accelerometer.
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

  // A short wide screen has to cap the radius on width.
  const radius = useMemo(
    () => Math.min(RADIUS_H, (RADIUS_W * width) / height),
    [width, height]
  );

  const params = useMemo(
    () => [0.5, CENTER_Y, radius, REVEAL_R, REVEAL_Y, 0, 0, 0],
    [radius]
  );

  // The text has to land on the clearing the shader opens, so it is placed by
  // the same numbers.
  const geom = useMemo(() => {
    const radPt = radius * height;
    const wrPt = REVEAL_R * radPt;
    return {
      wrPt,
      centerX: 0.5 * width,
      centerY: (1 - (CENTER_Y + REVEAL_Y * radius)) * height,
    };
  }, [radius, width, height]);

  const answerStyle = useAnimatedStyle(() => {
    const r = rise.value;
    return {
      opacity: interpolate(r, [0.55, 0.95], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: drift.value.x * geom.wrPt },
        { translateY: drift.value.y * geom.wrPt },
        { rotate: `${spinDeg.value}deg` },
        { scale: interpolate(r, [0.55, 1], [0.92, 1], Extrapolation.CLAMP) },
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
            top: geom.centerY - (TEXT_HEIGHT / 2) * geom.wrPt,
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

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => shake(1)}
        accessibilityRole="button"
        accessibilityLabel="Shake the orb"
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
    backgroundColor: '#050a0b',
  },
  answerBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answer: {
    color: '#fff6e0',
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 214, 140, 0.75)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  caption: {
    position: 'absolute',
    pointerEvents: 'none',
    left: 0,
    paddingHorizontal: 32,
    textAlign: 'center',
    color: 'rgba(226, 240, 234, 0.62)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});
