import { StatusBar, StyleSheet, View } from 'react-native';
import { Aurora } from 'react-native-effects';

export default function AuroraScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Aurora style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
