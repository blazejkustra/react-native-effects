import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { useParamsSynchronizable } from 'react-native-effects';
import { BackButton } from '../components/BackButton';
import CrtTube from '../components/crt/CrtTube';
import { playPowerOff, playPowerOn } from '../components/crt/tubeSound';

/** A real iPhone home screen screenshot, its status bar painted out. */
const HOME_SCREEN = require('../../assets/crt/home-screen.jpg');
/** Seconds after a toggle during which the tube is still animating. */
const SETTLE_S = 2.2;

/**
 * A phone screen switching off like an old CRT television: tap and the
 * picture collapses into a white-hot line, then a dot that fades on its
 * phosphor; tap again to power it back on with a degauss wobble. The home
 * screen is snapshotted with react-native-view-shot and drawn by CrtTube.
 */
export default function CrtOffScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [isOff, setIsOff] = useState(false);
  const toggledAt = useRef(0);
  const frame = useRef<number | null>(null);
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([1, SETTLE_S, 0, 0]);

  const capture = useCallback(async () => {
    const raw = await captureRef(contentRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    setSnapshot(raw.startsWith('file://') ? raw : `file://${raw}`);
  }, []);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (snapshot) releaseCapture(snapshot);
    };
  }, [snapshot]);

  const run = useCallback(
    (off: boolean) => {
      const tick = () => {
        const elapsed = (performance.now() - toggledAt.current) / 1000;
        setParamsSynchronizable(off ? 1 : 0, Math.min(elapsed, SETTLE_S), 0, 0);
        frame.current = elapsed < SETTLE_S ? requestAnimationFrame(tick) : null;
      };
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      toggledAt.current = performance.now();
      tick();
    },
    [setParamsSynchronizable]
  );

  useEffect(() => {
    if (!snapshot) return;
    const id = setTimeout(() => run(false), 650);
    return () => clearTimeout(id);
  }, [snapshot, run]);

  const toggle = useCallback(() => {
    const next = !isOff;
    setIsOff(next);
    run(next);
    if (next) playPowerOff();
    else playPowerOn();
  }, [isOff, run]);

  // `__crtFreeze(off, seconds)` holds the tube at one moment of a power
  // transition for inspection; the next tap resumes normal playback.
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as {
      __crtFreeze?: (off: boolean, seconds: number) => void;
    };
    g.__crtFreeze = (off, seconds) => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setIsOff(off);
      setParamsSynchronizable(off ? 1 : 0, seconds, 0, 0);
    };
    return () => {
      delete g.__crtFreeze;
    };
  }, [setParamsSynchronizable]);

  const onWallpaperLoad = useCallback(() => {
    setTimeout(capture, 150);
  }, [capture]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <View
        ref={contentRef}
        collapsable={false}
        style={StyleSheet.absoluteFill}
      >
        <Image
          source={HOME_SCREEN}
          style={{ width, height }}
          resizeMode="cover"
          onLoad={onWallpaperLoad}
        />
      </View>
      <View style={[StyleSheet.absoluteFill, styles.root]} />
      {snapshot && (
        <CrtTube
          style={StyleSheet.absoluteFill}
          texture={{ uri: snapshot }}
          paramsSynchronizable={paramsSynchronizable}
          pointerEvents="none"
        />
      )}
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle} />
      <View
        style={[
          styles.backWrap,
          { top: insets.top + 6 },
          isOff && styles.backDimmed,
        ]}
      >
        <BackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  backDimmed: {
    opacity: 0.3,
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
});
