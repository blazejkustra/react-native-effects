import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'react-native-effects';
import { BackButton } from '../../components/BackButton';
import { useEffect, useRef, useState, useCallback } from 'react';

type ColorScheme = {
  name: string;
  startColor: string;
  endColor: string;
};

const COLOR_SCHEMES: ColorScheme[] = [
  { name: 'Sunset', startColor: '#ff6b6b', endColor: '#ffd93d' },
  { name: 'Ocean', startColor: '#667eea', endColor: '#764ba2' },
  { name: 'Forest', startColor: '#56ab2f', endColor: '#a8e063' },
  { name: 'Fire', startColor: '#f83600', endColor: '#f9d423' },
  { name: 'Midnight', startColor: '#2c3e50', endColor: '#4ca1af' },
];

export default function LinearGradientAnimatedScreen() {
  const [currentSchemeIndex, setCurrentSchemeIndex] = useState(0);
  const [angle, setAngle] = useState(0);
  const startTimeRef = useRef(Date.now());

  // Drive angle rotation via requestAnimationFrame
  useEffect(() => {
    let id: number;
    function tick() {
      const elapsed = Date.now() - startTimeRef.current;
      // Full rotation every 3 seconds (matching original duration)
      setAngle((elapsed / 3000) * 360);
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const currentScheme = COLOR_SCHEMES[currentSchemeIndex]!;

  const handleNextScheme = useCallback(() => {
    setCurrentSchemeIndex((prev) => (prev + 1) % COLOR_SCHEMES.length);
  }, []);

  const handlePreviousScheme = useCallback(() => {
    setCurrentSchemeIndex(
      (prev) => (prev - 1 + COLOR_SCHEMES.length) % COLOR_SCHEMES.length
    );
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        startColor={currentScheme.startColor}
        endColor={currentScheme.endColor}
        angle={angle % 360}
        style={StyleSheet.absoluteFillObject}
      />

      <StatusBar barStyle="light-content" backgroundColor="transparent" />

      <View style={styles.header}>
        <BackButton />
      </View>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.title}>Animated Linear Gradient</Text>
          <Text style={styles.subtitle}>
            Watch the gradient rotate continuously
          </Text>
          <Text style={styles.schemeName}>{currentScheme.name}</Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handlePreviousScheme}
          >
            <Text style={styles.controlButtonText}>← Previous</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleNextScheme}
          >
            <Text style={styles.controlButtonText}>Next →</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.colorInfo}>
          <View style={styles.colorRow}>
            <View
              style={[
                styles.colorDot,
                { backgroundColor: currentScheme.startColor },
              ]}
            />
            <Text style={styles.colorText}>{currentScheme.startColor}</Text>
          </View>
          <View style={styles.colorRow}>
            <View
              style={[
                styles.colorDot,
                { backgroundColor: currentScheme.endColor },
              ]}
            />
            <Text style={styles.colorText}>{currentScheme.endColor}</Text>
          </View>
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
  header: {
    paddingTop: 60,
    paddingHorizontal: 28,
    paddingBottom: 20,
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
    marginBottom: 40,
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
    marginBottom: 24,
    fontWeight: '400',
  },
  schemeName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  controls: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 40,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  colorInfo: {
    flexDirection: 'row',
    gap: 24,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  colorText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#fff',
    fontWeight: '600',
  },
});
