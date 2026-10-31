import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Stays on screen so nobody can read the damage as their real display. */
export default function EffectCaption() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.pill, { bottom: Math.max(insets.bottom, 16) + 12 }]}
      pointerEvents="none"
    >
      <Text style={styles.text}>Just an effect. Your screen is fine.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
