import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { Iridescence } from 'react-native-effects';
import { Header } from '../components/Header';

export default function IridescenceScreen() {
  return (
    <View style={styles.container}>
      <Iridescence style={StyleSheet.absoluteFillObject} />

      <StatusBar barStyle="light-content" backgroundColor="transparent" />

      <Header
        title="Iridescence"
        subtitle="Mesmerizing animated colors"
        transparent
      />

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>Iridescence</Text>
          <Text style={styles.subtitle}>
            A mesmerizing iridescent effect with flowing colors
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
