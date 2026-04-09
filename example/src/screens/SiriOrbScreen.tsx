import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import SiriOrb from '../components/SiriOrb';
import SiriEdgeGlow from '../components/SiriEdgeGlow';

export default function SiriOrbScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/iphone-background.png')}
        style={styles.backgroundImage}
        resizeMode="contain"
      />

      <StatusBar barStyle="light-content" backgroundColor="transparent" />

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>{'← Back'}</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>Siri Orb</Text>
          <Text style={styles.subtitle}>
            A living sphere with swirling colors, specular highlights, and a
            soft outer glow
          </Text>
        </View>
      </View>

      <View style={styles.orbWrapper}>
        <SiriOrb />
      </View>

      <SiriEdgeGlow
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 54,
    left: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 40,
  },
  infoCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontWeight: '400',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
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
