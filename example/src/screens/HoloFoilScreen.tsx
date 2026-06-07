import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HoloFoilCard from '../components/HoloFoilCard';
import { useTilt } from '../hooks/useTilt';
import { BackButton } from '../components/BackButton';

export default function HoloFoilScreen() {
  const insets = useSafeAreaInsets();
  const { paramsSynchronizable, pan, source } = useTilt();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <View style={styles.center}>
        <GestureDetector gesture={pan}>
          <View style={styles.cardWrap} collapsable={false}>
            <HoloFoilCard
              paramsSynchronizable={paramsSynchronizable}
              style={StyleSheet.absoluteFill}
            />

            {/* Card chrome on top of the foil. */}
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.topRow}>
                <View style={styles.chip} />
                <Text style={styles.brand}>HOLO</Text>
              </View>
              <Text style={styles.number}>•••• •••• •••• 2026</Text>
              <View style={styles.bottomRow}>
                <Text style={styles.holder}>RAINBOW FOIL</Text>
                <Text style={styles.holder}>∞/∞</Text>
              </View>
            </View>
          </View>
        </GestureDetector>

        <Text style={styles.hint}>
          {source === 'motion' ? 'Tilt your phone 🌈' : 'Drag the card 🌈'}
        </Text>
      </View>

      <View
        style={[styles.backWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080c',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
  cardWrap: {
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    padding: 22,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    width: 44,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  brand: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  number: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  holder: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hint: {
    marginTop: 36,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
