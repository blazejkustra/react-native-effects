import { StatusBar, StyleSheet, View } from 'react-native';
import { Iridescence } from 'react-native-effects';

export default function IridescenceScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" />
      <Iridescence style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
