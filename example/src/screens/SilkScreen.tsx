import { StatusBar, StyleSheet, View } from 'react-native';
import { Silk } from 'react-native-effects';

export default function SilkScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Silk style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
