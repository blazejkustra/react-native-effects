import { StatusBar, StyleSheet, View } from 'react-native';
import { Campfire } from 'react-native-effects';

export default function CampfireScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Campfire style={styles.fire} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fire: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    aspectRatio: 0.8,
  },
});
