import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
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
import PolaroidCamera, {
  CAMERA_BODY_HEIGHT,
  type PolaroidCameraHandle,
} from '../components/polaroid/PolaroidCamera';
import SquareCropper, {
  type SquareCropperHandle,
} from '../components/polaroid/SquareCropper';
import {
  playFilmWhirr,
  playShutterClick,
  stopCameraSound,
} from '../components/polaroid/cameraSound';
import { usePolaroidShake } from '../hooks/usePolaroidShake';

/**
 * Photos, all via Wikimedia Commons:
 * table: "Oberfläche Wohnzimmertisch" by Martin Lorenz (CC BY-SA 3.0);
 * beach: "Black Rock beach" by Carey Ciuro (CC BY 2.0);
 * lake: "Evening on Kathleen Lake" by Jakub Fryš (CC BY-SA 4.0);
 * mountains: "Mountain lake, Mylgval mountain cirque before sunset,
 * Caucasus Mountains" by Vyacheslav Argenberg (CC BY 4.0).
 */
const TABLE = require('../../assets/camera/table.jpg');
const PHOTOS = [
  require('../../assets/camera/photo-beach.jpg'),
  require('../../assets/camera/photo-lake.jpg'),
  require('../../assets/camera/photo-mountains.jpg'),
];

/** Real prints are readable in ~2 min and done in ~15; this is the demo cut. */
const DEVELOP_SECONDS = 20;
/** A hard shake develops this much faster (it does nothing in reality). */
const SHAKE_BOOST = 1.6;
const EJECT_MS = 1500;
const MAX_PRINTS = 8;
/**
 * Mounting a ShaderView and uploading its texture touch the shared GPU device
 * off the render thread, and Dawn segfaults if another view submits a frame at
 * that moment. Prints on the table stop rendering around each new one.
 */
const GPU_PAUSE_LEAD_MS = 150;
const GPU_PAUSE_MS = 700;

type PrintSpec = {
  id: number;
  photo: ImageSourcePropType;
  seed: number;
  angle: number;
  dx: number;
  dy: number;
  z: number;
};

type DragBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type DebugGlobal = { __polaroidPhoto?: (uri: string) => void };

function makePrint(
  id: number,
  z: number,
  photo: ImageSourcePropType
): PrintSpec {
  return {
    id,
    z,
    photo,
    seed: Math.random(),
    angle: (Math.random() - 0.5) * 16,
    dx: (Math.random() - 0.5) * 56,
    dy: (Math.random() - 0.5) * 44,
  };
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * One print on the table. It ejects from the camera, develops on its own
 * clock and can be dragged around; the print on top hangs from the fingers
 * and sways when the phone is shaken.
 */
function Print({
  spec,
  width,
  height,
  travel,
  bounds,
  shakeLevel,
  sway,
  isTop,
  paused,
  onLift,
}: {
  spec: PrintSpec;
  width: number;
  height: number;
  travel: number;
  bounds: DragBounds;
  shakeLevel: React.RefObject<number>;
  sway: SharedValue<number>;
  isTop: boolean;
  paused: boolean;
  onLift: (id: number) => void;
}) {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, spec.seed, 0]);
  const [developed, setDeveloped] = useState(false);
  const rise = useSharedValue(travel);
  const angle = useSharedValue(0);
  const topFlag = useSharedValue(isTop ? 1 : 0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lift = useSharedValue(0);
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
      const boost = 1 + SHAKE_BOOST * (shakeLevel.current ?? 0);
      dev.current = Math.min(1, dev.current + (dt / DEVELOP_SECONDS) * boost);
      if (dev.current === 1) {
        setParamsSynchronizable(1, 0, spec.seed, 0);
        setDeveloped(true);
        return;
      }
      setParamsSynchronizable(dev.current, sway.value / 9, spec.seed, 0);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [setParamsSynchronizable, shakeLevel, spec.seed, sway]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      runOnJS(onLift)(spec.id);
      lift.value = withTiming(1, { duration: 120 });
    })
    .onChange((e) => {
      dragX.value = clamp(dragX.value + e.changeX, bounds.minX, bounds.maxX);
      dragY.value = clamp(dragY.value + e.changeY, bounds.minY, bounds.maxY);
    })
    .onFinalize(() => {
      lift.value = withTiming(0, { duration: 200 });
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: spec.dx + dragX.value },
      { translateY: rise.value + spec.dy + dragY.value },
      { rotate: `${angle.value + sway.value * topFlag.value}deg` },
      { scale: 1 + lift.value * 0.04 },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.print, { width, height, zIndex: spec.z }, style]}
      >
        <View style={styles.paper} pointerEvents="none">
          <PolaroidPrint
            photo={spec.photo}
            paramsSynchronizable={paramsSynchronizable}
            isStatic={developed || paused}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * An instant print.
 *
 * Press the shutter: it clicks, the camera takes a real photo (or a bundled
 * one on the simulator or without permission), the film rolls and a print
 * slides out onto the table. It starts as the milky blue-grey of the
 * opacifier and develops over about twenty seconds in the order the film does
 * it. Shake the phone and the top print swings in your fingers while every wet
 * print develops a little faster. Prints pile up, newest on top, and can be dragged
 * apart; a finished print is frozen and costs no GPU time.
 * `__polaroidPhoto(uri)` prints any image in dev builds, through the same
 * square crop a real photo takes.
 */
export default function PolaroidScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { level, sway } = usePolaroidShake();
  const camera = useRef<PolaroidCameraHandle>(null);
  const cropper = useRef<SquareCropperHandle>(null);
  const nextId = useRef(0);
  const nextZ = useRef(0);
  const busy = useRef(false);
  const left = useRef(false);
  const [prints, setPrints] = useState<PrintSpec[]>([]);
  const [bundledIndex, setBundledIndex] = useState(0);
  const [pausedBelowId, setPausedBelowId] = useState(0);

  const printWidth = Math.min(width * 0.66, 300);
  const printHeight = printWidth / PRINT_ASPECT;
  const bodyTop = height - CAMERA_BODY_HEIGHT - insets.bottom;
  const printTop = Math.max(
    insets.top + 24,
    (bodyTop - printHeight) * 0.5 + insets.top * 0.3
  );
  const printLeft = (width - printWidth) / 2;
  const travel = bodyTop - printTop;
  const topZ = Math.max(...prints.map((p) => p.z));

  const bounds: DragBounds = {
    minX: -printLeft - printWidth * 0.4,
    maxX: printLeft + printWidth * 0.4,
    minY: -printTop - printHeight * 0.3,
    maxY: bodyTop - printTop - printHeight * 0.45,
  };

  const addPrint = useCallback((photo: ImageSourcePropType) => {
    const spec = makePrint(nextId.current++, ++nextZ.current, photo);
    setPausedBelowId(spec.id);
    setTimeout(() => {
      if (left.current) {
        return;
      }
      playFilmWhirr();
      setPrints((ps) => [...ps, spec].slice(-MAX_PRINTS));
    }, GPU_PAUSE_LEAD_MS);
    setTimeout(() => setPausedBelowId(0), GPU_PAUSE_LEAD_MS + GPU_PAUSE_MS);
  }, []);

  const liftPrint = useCallback((id: number) => {
    const z = ++nextZ.current;
    setPrints((ps) => ps.map((p) => (p.id === id ? { ...p, z } : p)));
  }, []);

  const squarePhoto = useCallback(async () => {
    const uri = await camera.current?.takePhoto();
    return uri ? cropper.current?.crop(uri) : null;
  }, []);

  const shoot = useCallback(async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    camera.current?.blink();
    playShutterClick();
    const photo = await squarePhoto().catch(() => null);
    setTimeout(() => {
      busy.current = false;
    }, EJECT_MS);
    if (photo) {
      addPrint({ uri: photo });
      return;
    }
    addPrint(PHOTOS[bundledIndex % PHOTOS.length]!);
    setBundledIndex(bundledIndex + 1);
  }, [addPrint, bundledIndex, squarePhoto]);

  useEffect(() => {
    left.current = false;
    return () => {
      left.current = true;
      stopCameraSound();
    };
  }, []);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const debug = globalThis as DebugGlobal;
    debug.__polaroidPhoto = (uri) => {
      cropper.current?.crop(uri).then((photo) => addPrint({ uri: photo }));
    };
    return () => {
      delete debug.__polaroidPhoto;
    };
  }, [addPrint]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SquareCropper ref={cropper} />
      <Image
        source={TABLE}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <View style={styles.shade} pointerEvents="none" />

      <View
        collapsable={false}
        style={[
          styles.stage,
          {
            top: printTop,
            left: printLeft,
            width: printWidth,
            height: printHeight,
          },
        ]}
      >
        {prints.map((p) => (
          <Print
            key={p.id}
            spec={p}
            width={printWidth}
            height={printHeight}
            travel={travel}
            bounds={bounds}
            shakeLevel={level}
            sway={sway}
            isTop={p.z === topZ}
            paused={p.id < pausedBelowId}
            onLift={liftPrint}
          />
        ))}
      </View>

      <PolaroidCamera
        ref={camera}
        fallbackPhoto={PHOTOS[bundledIndex % PHOTOS.length]!}
        bottomInset={insets.bottom}
        slotWidth={printWidth + 16}
        onShutter={shoot}
      />
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
});
