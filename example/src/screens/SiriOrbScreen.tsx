import { View, StyleSheet, StatusBar, Image } from 'react-native';
import SiriOrb from '../components/SiriOrb';

export default function SiriOrbScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/scenes/misty-path.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      <StatusBar barStyle="light-content" />

      <View style={styles.orbWrapper}>
        <SiriOrb style={styles.orb} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  orbWrapper: {
    width: 320,
    height: 320,
  },
  orb: {
    flex: 1,
  },
});
