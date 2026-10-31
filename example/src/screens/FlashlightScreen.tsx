import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import TorchControls from '../components/flashlight/TorchControls';
import TorchScene from '../components/flashlight/TorchScene';
import { useTorchAim } from '../hooks/useTorchAim';

/**
 * Photo: "Grungy corridor of abandoned school" by Shixart1985, CC BY 2.0, via
 * Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Grungy_corridor_of_abandoned_school.jpg).
 */
const CORRIDOR = require('../../assets/flashlight/corridor.jpg');
const CORRIDOR_ASPECT = 1068 / 1600;

function approach(current: number, target: number, rate: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * A torch in a dark corridor. The sliders set the beam width and brightness,
 * and tilting the phone sweeps the spot across the photo.
 */
export default function FlashlightScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const aim = useTorchAim();
  const [isOn, setIsOn] = useState(true);
  const [beam, setBeam] = useState(0.55);
  const [level, setLevel] = useState(0.75);
  const target = useRef({ beam, level, power: 1 });
  const state = useRef({ beam, level, power: 1, x: 0, y: 0 });

  const scene = useParamsSynchronizable([
    width / 2,
    height * 0.45,
    beam,
    level,
  ]);
  const setScene = scene.setParamsSynchronizable;

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
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [aim, width, height, setScene]);

  const toggle = useCallback(() => {
    target.current.power = isOn ? 0 : 1;
    setIsOn(!isOn);
  }, [isOn]);

  const changeBeam = useCallback((value: number) => {
    target.current.beam = value;
    setBeam(value);
  }, []);

  const changeLevel = useCallback((value: number) => {
    target.current.level = value;
    setLevel(value);
  }, []);

  return (
    <View style={styles.root}>
      <TorchScene
        style={StyleSheet.absoluteFill}
        texture={CORRIDOR}
        photoAspect={CORRIDOR_ASPECT}
        paramsSynchronizable={scene.paramsSynchronizable}
      />
      <TorchControls
        isOn={isOn}
        beam={beam}
        level={level}
        bottomInset={insets.bottom}
        onToggle={toggle}
        onBeamChange={changeBeam}
        onLevelChange={changeLevel}
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
