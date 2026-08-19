import { Pressable, StatusBar, StyleSheet } from 'react-native';
import BeerGlass from '../components/BeerGlass';
import { useBeerPhysics } from '../hooks/useBeerPhysics';

/**
 * The classic joke app: the phone IS a glass of beer. Tilt it and the liquid
 * stays level with the world; rotate far enough and you drink it; tap
 * anywhere to top it back up. Deliberately chrome-free — the whole screen is
 * one Pressable holding the shader (back = native edge swipe).
 */
export default function BeerScreen() {
  const { paramsSynchronizable, refill } = useBeerPhysics();

  return (
    <Pressable style={styles.container} onPress={refill}>
      <StatusBar hidden />
      <BeerGlass
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
