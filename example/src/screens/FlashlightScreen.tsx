import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import TorchScene from '../components/flashlight/TorchScene';
import TorchIsland, {
  type IslandMode,
} from '../components/flashlight/TorchIsland';
import { useTorchAim } from '../hooks/useTorchAim';

/**
 * Photo: "Grungy corridor of abandoned school" by Shixart1985, CC BY 2.0, via
 * Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Grungy_corridor_of_abandoned_school.jpg).
 */
const CORRIDOR = require('../../assets/flashlight/corridor.jpg');
const CORRIDOR_ASPECT = 1068 / 1600;
const TORCH_OFF = require('../../assets/flashlight/flashlight-off.png');
const CAMERA = require('../../assets/flashlight/camera.png');

/** pt of drag for a full sweep of beam width / intensity. */
const DRAG_RANGE = { beam: 170, level: 210 };

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * The iOS 18 torch in a dark corridor. The lock-screen button switches it on
 * and the Dynamic Island grows into the flashlight control: drag up/down on
 * it for intensity and left/right for beam width; the spot on the photo
 * follows, and tilting the phone sweeps it across the corridor.
 */
export default function FlashlightScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const aim = useTorchAim();
  const [isOn, setIsOn] = useState(false);
  const [mode, setMode] = useState<IslandMode>('idle');
  const target = useRef({ beam: 0.55, level: 0.75, power: 0 });
  const state = useRef({ beam: 0.55, level: 0.75, power: 0, x: 0, y: 0 });

  const scene = useParamsSynchronizable([width / 2, height * 0.45, 0.55, 0]);
  const island = useParamsSynchronizable([0.55, 0.75, 0, 0]);
  const setScene = scene.setParamsSynchronizable;
  const setIsland = island.setParamsSynchronizable;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = state.current;
      const t = target.current;
      s.beam = approach(s.beam, t.beam, 14, dt);
      s.level = approach(s.level, t.level, 14, dt);
      s.power = approach(s.power, t.power, 28, dt);
      s.x = approach(s.x, aim.current.x, 7, dt);
      s.y = approach(s.y, aim.current.y, 7, dt);
      const spotX = width * (0.5 + 0.42 * s.x);
      const spotY = height * (0.47 - 0.36 * s.y);
      setScene(spotX, spotY, s.beam, s.power * (0.25 + 0.75 * s.level));
      setIsland(s.beam, s.level, s.power, 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [aim, width, height, setScene, setIsland]);

  const setTorch = useCallback((on: boolean) => {
    target.current.power = on ? 1 : 0;
    setIsOn(on);
  }, []);

  const onLockButton = useCallback(() => {
    const next = !isOn;
    setTorch(next);
    setMode(next ? 'expanded' : 'idle');
  }, [isOn, setTorch]);

  const onIslandToggle = useCallback(() => setTorch(!isOn), [isOn, setTorch]);

  const onAdjust = useCallback(
    (dx: number, dy: number) => {
      const t = target.current;
      t.beam = clamp01(t.beam + dx / DRAG_RANGE.beam);
      t.level = clamp01(t.level - dy / DRAG_RANGE.level);
      if (!isOn) setTorch(true);
    },
    [isOn, setTorch]
  );

  const collapse = useCallback(() => {
    if (mode === 'expanded') setMode(isOn ? 'compact' : 'idle');
  }, [mode, isOn]);

  return (
    <View style={styles.root}>
      <TorchScene
        style={StyleSheet.absoluteFill}
        texture={CORRIDOR}
        photoAspect={CORRIDOR_ASPECT}
        paramsSynchronizable={scene.paramsSynchronizable}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={collapse} />
      <TorchIsland
        mode={mode}
        isOn={isOn}
        paramsSynchronizable={island.paramsSynchronizable}
        onExpand={() => setMode('expanded')}
        onToggle={onIslandToggle}
        onAdjust={onAdjust}
      />
      <View style={[styles.quickRow, { bottom: insets.bottom + 18 }]}>
        <Pressable
          onPress={onLockButton}
          style={[styles.quickButton, isOn && styles.quickButtonOn]}
          hitSlop={10}
        >
          <Image
            source={TORCH_OFF}
            style={[
              styles.torchGlyph,
              isOn ? styles.torchGlyphOn : styles.torchGlyphOff,
            ]}
          />
        </Pressable>
        <View style={styles.quickButton}>
          <Image source={CAMERA} style={styles.cameraGlyph} />
        </View>
      </View>
      <View style={styles.homeBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  quickRow: {
    position: 'absolute',
    left: 46,
    right: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(60,60,72,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickButtonOn: {
    backgroundColor: 'rgba(235,236,245,0.92)',
  },
  torchGlyph: {
    width: 12,
    height: 22,
  },
  torchGlyphOn: {
    tintColor: '#5b5bd6',
  },
  torchGlyphOff: {
    tintColor: '#fff',
  },
  cameraGlyph: {
    width: 24,
    height: 18,
    tintColor: '#fff',
  },
  homeBar: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 8,
    width: 140,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
});
