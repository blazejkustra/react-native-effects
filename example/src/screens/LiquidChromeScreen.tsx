import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { LiquidChrome } from 'react-native-effects';
import { Header } from '../components/Header';

export default function LiquidChromeScreen() {
  return (
    <View style={styles.container}>
      <LiquidChrome style={StyleSheet.absoluteFillObject} />

      <StatusBar barStyle="light-content" backgroundColor="transparent" />

      <Header
        title="Liquid Chrome"
        subtitle="Fluid metallic surfaces"
        transparent
      />

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>Liquid Chrome</Text>
          <Text style={styles.subtitle}>
            A fluid metallic surface with chromatic distortion
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
