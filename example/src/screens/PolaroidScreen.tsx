import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import PolaroidPrint, {
  PRINT_ASPECT,
} from '../components/polaroid/PolaroidPrint';
import { playWhirr } from '../components/polaroid/whirr';
import { usePolaroidShake } from '../hooks/usePolaroidShake';

/**
 * Photos, all via Wikimedia Commons:
 * table: "Weatherworn top of wooden table" (CC0);
 * beach: "Black Rock beach" by Carey Ciuro (CC BY 2.0);
 * lake: "Evening on Kathleen Lake" by Jakub Fryš (CC BY-SA 4.0);
 * mountains: "Mountain lake, Mylgval mountain cirque before sunset,
 * Caucasus Mountains" by Vyacheslav Argenberg (CC BY 4.0).
 */
const TABLE = require('../../assets/polaroid/table.jpg');
const PHOTOS = [
  require('../../assets/polaroid/photo-beach.jpg'),
  require('../../assets/polaroid/photo-lake.jpg'),
  require('../../assets/polaroid/photo-mountains.jpg'),
];

/** Real prints are readable in ~2 min and done in ~15; this is the demo cut. */
const DEVELOP_SECONDS = 20;
/** A hard shake develops this much faster (it does nothing in reality). */
const SHAKE_BOOST = 1.6;
const EJECT_MS = 1500;
const MAX_PRINTS = 2;

type PrintSpec = {
  id: number;
  photo: number;
  seed: number;
  angle: number;
  dx: number;
  dy: number;
};

function makePrint(id: number): PrintSpec {
  return {
    id,
    photo: id % PHOTOS.length,
    seed: Math.random(),
    angle: (Math.random() - 0.5) * 7,
    dx: (Math.random() - 0.5) * 24,
    dy: (Math.random() - 0.5) * 16,
  };
}

/**
 * A print that ejects from the bottom of the screen, then develops. The
 * newest one hangs from the fingers: it sways when the phone is shaken.
 */
function Print({
  spec,
  width,
  travel,
  shakeLevel,
  sway,
  isTop,
}: {
  spec: PrintSpec;
  width: number;
  travel: number;
  shakeLevel: React.RefObject<number>;
  sway: SharedValue<number>;
  isTop: boolean;
}) {
  const height = width / PRINT_ASPECT;
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, spec.seed, 0]);
  const rise = useSharedValue(travel);
  const angle = useSharedValue(0);
  const topFlag = useSharedValue(isTop ? 1 : 0);
  const dev = useRef(0);

  useEffect(() => {
    topFlag.value = withTiming(isTop ? 1 : 0, { duration: 400 });
  }, [isTop, topFlag]);

  useEffect(() => {
    rise.value = withTiming(0, {
      duration: EJECT_MS,
      easing: Easing.bezier(0.2, 0.0, 0.35, 1),
    });
    angle.value = withSpring(spec.angle, { damping: 14, stiffness: 60 });
  }, [rise, angle, spec.angle]);

  useEffect(() => {
    let last = Date.now();
    let frame = 0;
    const step = () => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const boost = isTop ? 1 + SHAKE_BOOST * (shakeLevel.current ?? 0) : 1;
      dev.current = Math.min(1, dev.current + (dt / DEVELOP_SECONDS) * boost);
      setParamsSynchronizable(
        dev.current,
        isTop ? sway.value / 9 : 0,
        spec.seed,
        0
      );
      if (dev.current < 1 || isTop) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isTop, setParamsSynchronizable, shakeLevel, spec.seed, sway]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: spec.dx },
      { translateY: rise.value + spec.dy },
      { rotate: `${angle.value + sway.value * topFlag.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[styles.print, { width, height }, style]}
      pointerEvents="none"
    >
      <View style={styles.paper}>
        <PolaroidPrint
          photo={PHOTOS[spec.photo]}
          paramsSynchronizable={paramsSynchronizable}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </Animated.View>
  );
}

/**
 * Polaroid instant print.
 *
 * Press the shutter: the motor whirrs and a print slides out of the bottom
 * edge onto the table. It starts as the milky blue-grey of the opacifier and
 * develops over about twenty seconds in the order the film does it. Shake the
 * phone and the print swings in your fingers, and develops a little faster.
 * Press again for the next shot.
 */
export default function PolaroidScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { level, sway } = usePolaroidShake();
  const nextId = useRef(0);
  const [prints, setPrints] = useState<PrintSpec[]>([]);
  const busy = useRef(false);

  const printWidth = Math.min(width * 0.8, 360);
  const printHeight = printWidth / PRINT_ASPECT;
  const printTop = (height - printHeight) * 0.42;
  const travel = height - printTop + 20;

  const shoot = useCallback(() => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setTimeout(() => {
      busy.current = false;
    }, EJECT_MS);
    playWhirr(EJECT_MS / 1000 - 0.25);
    const spec = makePrint(nextId.current++);
    setPrints((ps) => [...ps, spec].slice(-MAX_PRINTS));
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Image
        source={TABLE}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View style={styles.shade} pointerEvents="none" />

      <View
        style={[
          styles.stage,
          { top: printTop, left: (width - printWidth) / 2 },
        ]}
        pointerEvents="none"
      >
        {prints.map((p, i) => (
          <Print
            key={p.id}
            spec={p}
            width={printWidth}
            travel={travel}
            shakeLevel={level}
            sway={sway}
            isTop={i === prints.length - 1}
          />
        ))}
      </View>

      <Pressable
        onPress={shoot}
        accessibilityRole="button"
        accessibilityLabel="Take a photo"
        hitSlop={16}
        style={({ pressed }) => [
          styles.shutterRing,
          { bottom: insets.bottom + 28 },
          pressed && styles.shutterPressed,
        ]}
      >
        <View style={styles.shutter} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#2a1a10',
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 10, 4, 0.18)',
  },
  stage: {
    position: 'absolute',
  },
  print: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    backgroundColor: '#efeee9',
    borderRadius: 3,
  },
  paper: {
    flex: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  shutterRing: {
    position: 'absolute',
    right: 28,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#1b1b1b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
  },
  shutter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e2402c',
    borderWidth: 3,
    borderColor: '#b52d1d',
  },
});
