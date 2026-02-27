import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { Campfire } from 'react-native-effects';
import { Header } from '../components/Header';

export default function CampfireScreen() {
  return (
    <View style={styles.container}>
      <Campfire style={StyleSheet.absoluteFillObject} />

      <StatusBar barStyle="light-content" backgroundColor="transparent" />

      <Header
        title="Campfire"
        subtitle="Fire with drifting sparks"
        transparent
      />

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>Campfire</Text>
          <Text style={styles.subtitle}>
            Realistic fire effect with sparks and smoke
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
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
});
