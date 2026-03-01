import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'react-native-effects';
import { Header } from '../../components/Header';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 80;

type GradientConfig = {
  id: string;
  name: string;
  startColor: string;
  endColor: string;
  angle: number;
};

const GRADIENT_PRESETS: GradientConfig[] = [
  {
    id: 'sunset',
    name: 'Sunset',
    startColor: '#ff6b6b',
    endColor: '#ffd93d',
    angle: 45,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    startColor: '#667eea',
    endColor: '#764ba2',
    angle: 135,
  },
  {
    id: 'forest',
    name: 'Forest',
    startColor: '#56ab2f',
    endColor: '#a8e063',
    angle: 90,
  },
  {
    id: 'fire',
    name: 'Fire',
    startColor: '#f83600',
    endColor: '#f9d423',
    angle: 180,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    startColor: '#2c3e50',
    endColor: '#4ca1af',
    angle: 0,
  },
  {
    id: 'candy',
    name: 'Candy',
    startColor: '#fc5c7d',
    endColor: '#6a82fb',
    angle: 225,
  },
  {
    id: 'peach',
    name: 'Peach',
    startColor: '#ffecd2',
    endColor: '#fcb69f',
    angle: 270,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    startColor: '#c471f5',
    endColor: '#fa71cd',
    angle: 315,
  },
  {
    id: 'emerald',
    name: 'Emerald',
    startColor: '#00c6ff',
    endColor: '#0072ff',
    angle: 45,
  },
  {
    id: 'rose',
    name: 'Rose',
    startColor: '#ed4264',
    endColor: '#ffedbc',
    angle: 135,
  },
];

export default function LinearGradientStaticScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <Header
        title="Static Linear Gradients"
        subtitle="Beautiful gradient presets"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {GRADIENT_PRESETS.map((preset) => (
          <View key={preset.id} style={styles.gradientCard}>
            <View style={styles.gradientWrapper}>
              <LinearGradient
                startColor={preset.startColor}
                endColor={preset.endColor}
                angle={preset.angle}
                style={styles.gradient}
              />
            </View>
            <View style={styles.gradientInfo}>
              <Text style={styles.gradientName}>{preset.name}</Text>
              <View style={styles.colorInfo}>
                <View style={styles.colorSwatch}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: preset.startColor },
                    ]}
                  />
                  <Text style={styles.colorText}>{preset.startColor}</Text>
                </View>
                <View style={styles.colorSwatch}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: preset.endColor },
                    ]}
                  />
                  <Text style={styles.colorText}>{preset.endColor}</Text>
                </View>
              </View>
              <Text style={styles.angleText}>Angle: {preset.angle}°</Text>
            </View>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            All gradients rendered with WebGPU
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 40,
    paddingTop: 40,
    paddingBottom: 80,
    alignItems: 'center',
  },
  gradientCard: {
    width: CARD_WIDTH,
    marginBottom: 32,
    backgroundColor: '#111',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#252525',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  gradientWrapper: {
    width: '100%',
    height: 240,
    overflow: 'hidden',
  },
  gradient: {
    width: '100%',
    height: '100%',
  },
  gradientInfo: {
    padding: 24,
  },
  gradientName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  colorInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  colorSwatch: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#333',
  },
  colorText: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#aaa',
    fontWeight: '500',
  },
  angleText: {
    fontSize: 14,
    color: '#777',
    fontWeight: '600',
    marginTop: 4,
  },
  footer: {
    marginTop: 20,
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    fontWeight: '500',
  },
});
