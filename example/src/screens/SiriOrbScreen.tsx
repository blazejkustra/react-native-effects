import { View, StyleSheet, StatusBar, Image } from 'react-native';
import SiriOrb from '../components/SiriOrb';
import SiriEdgeGlow from '../components/SiriEdgeGlow';

export default function SiriOrbScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/scenes/misty-path.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      <StatusBar barStyle="light-content" />

      <View style={styles.spacer} />

      <View style={styles.orbWrapper}>
        <SiriOrb />
      </View>

      <SiriEdgeGlow style={StyleSheet.absoluteFill} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  spacer: {
    flex: 1,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  orbWrapper: {
    alignSelf: 'center',
    width: 200,
    height: 200,
  },
});
