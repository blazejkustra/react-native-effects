import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';

export default function ScratchOffScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Scratch-off</Text>
      <View style={[styles.backWrap, { top: insets.top + 6 }]}>
        <BackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08090c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
});
