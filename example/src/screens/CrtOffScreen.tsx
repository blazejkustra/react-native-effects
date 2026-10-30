import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useParamsSynchronizable } from 'react-native-effects';
import CrtTube from '../components/crt/CrtTube';
import { playPowerOff, playPowerOn } from '../components/crt/tubeSound';
import { useSnapshotTexture } from '../components/cracks/useSnapshotTexture';
import HomeScreen from './HomeScreen';

/** Lets the tube's first texture upload finish before the splash plays. */
const POWER_ON_DELAY_MS = 900;
/** Seconds after a toggle during which the tube is still animating. */
const SETTLE_S = 2.2;

/**
 * The app itself switching off like an old CRT television. Its real home
 * list is snapshotted with react-native-view-shot and drawn by CrtTube, which
 * powers it on like a splash when the screen opens. Tap and the picture
 * collapses into a white-hot line, then a dot that fades on its phosphor; tap
 * again to power it back on with a degauss wobble.
 */
export default function CrtOffScreen() {
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const { uri: snapshot, schedule } = useSnapshotTexture(contentRef);
  const [isOff, setIsOff] = useState(true);
  const toggledAt = useRef(0);
  const frame = useRef<number | null>(null);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([1, SETTLE_S, 0, 0]);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

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
    const id = setTimeout(() => {
      setIsOff(false);
      run(false);
    }, POWER_ON_DELAY_MS);
    splashTimer.current = id;
    return () => clearTimeout(id);
  }, [snapshot, run]);

  const toggle = useCallback(() => {
    if (splashTimer.current !== null) clearTimeout(splashTimer.current);
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

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View
        ref={contentRef}
        collapsable={false}
        style={StyleSheet.absoluteFill}
        onLayout={schedule}
      >
        <HomeScreen />
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
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={toggle}
        disabled={!snapshot}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
});
