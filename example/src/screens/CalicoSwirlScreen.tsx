import { StatusBar, StyleSheet, View } from 'react-native';
import { CalicoSwirl } from 'react-native-effects';

export default function CalicoSwirlScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" />
      <CalicoSwirl style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
