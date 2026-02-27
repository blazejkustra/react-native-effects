import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { CircularGradient } from 'react-native-effects';
import { Header } from '../components/Header';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 80;

type GradientConfig = {
  id: string;
  name: string;
  centerColor: string;
  edgeColor: string;
  centerX?: number;
  centerY?: number;
  sizeX?: number;
  sizeY?: number;
};

const GRADIENT_PRESETS: GradientConfig[] = [
  {
    id: 'spotlight',
    name: 'Spotlight',
    centerColor: '#ffffff',
    edgeColor: 'rgba(0,0,0,0)',
  },
  {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    centerColor: '#ff6b6b',
    edgeColor: '#2c3e50',
  },
  {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    centerColor: '#00d2ff',
    edgeColor: '#0a0a2e',
    sizeX: 0.7,
    sizeY: 0.7,
  },
  {
    id: 'off-center',
    name: 'Off Center',
    centerColor: '#f9d423',
    edgeColor: '#1a1a2e',
    centerX: 0.3,
    centerY: 0.3,
  },
  {
    id: 'wide-oval',
    name: 'Wide Oval',
    centerColor: '#a18cd1',
    edgeColor: '#fbc2eb',
    sizeX: 0.8,
    sizeY: 0.3,
  },
  {
    id: 'emerald',
    name: 'Emerald',
    centerColor: '#56ab2f',
    edgeColor: '#000000',
  },
];

export default function CircularGradientScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <Header
        title="Circular Gradients"
        subtitle="Customizable radial gradients"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {GRADIENT_PRESETS.map((preset) => (
          <View key={preset.id} style={styles.gradientCard}>
            <View style={styles.gradientWrapper}>
              <CircularGradient
                centerColor={preset.centerColor}
                edgeColor={preset.edgeColor}
                centerX={preset.centerX}
                centerY={preset.centerY}
                sizeX={preset.sizeX}
                sizeY={preset.sizeY}
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
                      { backgroundColor: preset.centerColor },
                    ]}
                  />
                  <Text style={styles.colorText}>Center</Text>
                </View>
                <View style={styles.colorSwatch}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: preset.edgeColor },
                    ]}
                  />
                  <Text style={styles.colorText}>Edge</Text>
                </View>
              </View>
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
