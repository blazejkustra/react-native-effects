import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TouchField from '../components/TouchField';

export default function TouchFieldScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Full-screen, gesture-driven shader. Drag anywhere to move the core. */}
      <TouchField
        colorA="#200404"
        colorB="#c40000"
        style={StyleSheet.absoluteFill}
      />

      {/* Keeps the left edge free of the pan so the back swipe still works. */}
      <View style={styles.backSwipeEdge} collapsable={false} />

      <StatusBar barStyle="light-content" />

      {/* Hint pill. `pointerEvents="none"` so it never eats the drag gesture. */}
      <View
        style={[styles.hintWrap, { bottom: insets.bottom + 32 }]}
        pointerEvents="none"
      >
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>Drag anywhere</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backSwipeEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
  },
  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintPill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
