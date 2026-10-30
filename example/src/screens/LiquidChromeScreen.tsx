import { StatusBar, StyleSheet, View } from 'react-native';
import { LiquidChrome } from 'react-native-effects';

export default function LiquidChromeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LiquidChrome style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
