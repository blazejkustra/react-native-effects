import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { ExampleCategory, HomeScreenNavigationProp } from '../types';

const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  {
    id: 'banners',
    title: 'Banners',
    description: 'iOS notification banners with shader effects',
    screen: 'BannersExample',
    color: '#f59e0b',
    // Placeholder art — replaced by a live capture once rendered.
    image: require('../../assets/components/campfire.png'),
  },
  {
    id: 'siri-glass',
    title: 'Siri Glass',
    description: 'iOS 26 Siri capsule — liquid glass + rainbow wave',
    screen: 'SiriGlassExample',
    color: '#0a84ff',
    // Placeholder art — replaced by a live capture once rendered.
    image: require('../../assets/components/siri-orb.png'),
  },
  {
    id: 'thanos',
    title: 'Thanos',
    description: 'Tap to snap a card into dust',
    screen: 'ThanosExample',
    color: '#a855f6',
    image: require('../../assets/components/thanos.png'),
  },
  {
    id: 'ai-shimmer',
    title: 'AI Shimmer',
    description: 'Skeleton shimmer — restrained blue→violet',
    screen: 'AiShimmerExample',
    color: '#7c5cff',
    image: require('../../assets/components/assistant.png'),
  },
  {
    id: 'ai-orb',
    title: 'AI Orb',
    description: 'Gemini-style morphing thinking blob',
    screen: 'AiOrbExample',
    color: '#5b8cff',
    image: require('../../assets/components/ai-orb.png'),
  },
  {
    id: 'ai-voice',
    title: 'AI Voice',
    description: 'Simulated audio waveform, listening',
    screen: 'AiVoiceExample',
    color: '#5b8cff',
    image: require('../../assets/components/waveform.png'),
  },
  {
    id: 'holo-foil',
    title: 'Holo Foil',
    description: 'Rainbow foil that shifts as you tilt',
    screen: 'HoloFoilExample',
    color: '#ec4899',
    image: require('../../assets/components/holo.png'),
  },
  {
    id: 'weather-example',
    title: 'Weather App',
    description: 'Apple Weather UI clone',
    screen: 'WeatherExample',
    color: '#1a2a6c',
    image: require('../../assets/components/weather.png'),
  },
  {
    id: 'scroll-reactive',
    title: 'Scroll Reactive',
    description: 'Background that reacts to your scroll',
    screen: 'ScrollReactiveExample',
    color: '#0ea5e9',
    image: require('../../assets/components/scroll.png'),
  },
  {
    id: 'touch-field',
    title: 'Touch Field',
    description: 'Liquid light that follows your finger',
    screen: 'TouchFieldExample',
    color: '#f472b6',
    // Placeholder art — swap for a real screen-recording still once captured.
    image: require('../../assets/components/field.png'),
  },
  {
    id: 'iridescence',
    title: 'Iridescence',
    description: 'Mesmerizing iridescent animated backgrounds',
    screen: 'IridescenceStatic',
    color: '#8b5cf6',
    image: require('../../assets/components/iridescence.png'),
  },
  {
    id: 'liquid-chrome',
    title: 'Liquid Chrome',
    description: 'Fluid metallic surfaces',
    screen: 'LiquidChromeStatic',
    color: '#64748b',
    image: require('../../assets/components/liquid-chrome.png'),
  },
  {
    id: 'silk',
    title: 'Silk',
    description: 'Smooth flowing silk fabric',
    screen: 'SilkStatic',
    color: '#7B7481',
    image: require('../../assets/components/silk.png'),
  },
  {
    id: 'campfire',
    title: 'Campfire',
    description: 'Fire with drifting sparks and smoke',
    screen: 'CampfireStatic',
    color: '#ff9933',
    image: require('../../assets/components/campfire.png'),
  },
  {
    id: 'calico-swirl',
    title: 'Calico Swirl',
    description: 'Warped noise pattern with flowing colors',
    screen: 'CalicoSwirlStatic',
    color: '#6366f1',
    image: require('../../assets/components/calico-swirl.png'),
  },
  {
    id: 'aurora',
    title: 'Aurora',
    description: 'Northern lights with flowing curtains of light',
    screen: 'AuroraStatic',
    color: '#4ade80',
    image: require('../../assets/components/aurora.png'),
  },
  {
    id: 'siri-orb',
    title: 'Siri Orb',
    description: 'Luminous breathing sphere with swirling colors',
    screen: 'SiriOrbStatic',
    color: '#a855f6',
    image: require('../../assets/components/siri-orb.png'),
  },
  {
    id: 'holo-card',
    title: 'Cards',
    description: 'Neobank iridescent credit cards',
    screen: 'HoloCardExample',
    color: '#6366f1',
    image: require('../../assets/components/cards.png'),
  },
  {
    id: 'circular-gradient',
    title: 'Circular Gradient',
    description: 'Customizable circular gradients',
    screen: 'CircularGradientList',
    color: '#4f46e5',
    image: require('../../assets/components/circular-gradient.png'),
  },

  {
    id: 'linear-gradient',
    title: 'Linear Gradient',
    description: 'Smooth linear gradients',
    screen: 'LinearGradientList',
    color: '#ec4899',
    image: require('../../assets/components/linear-gradient.png'),
  },
];

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <Text style={styles.title}>React Native Effects</Text>
        <Text style={styles.subtitle}>
          WebGPU-powered effects running on background thread in React Native 🧑‍🍳
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {EXAMPLE_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={styles.card}
            onPress={() => navigation.navigate(category.screen as never)}
            activeOpacity={0.7}
          >
            <Image source={category.image} style={styles.cardImage} />

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{category.title}</Text>
              <Text style={styles.cardDescription}>{category.description}</Text>
            </View>
            <View style={styles.cardArrow}>
              <Text style={styles.arrowText}>→</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    paddingBottom: 28,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    fontWeight: '400',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 28,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252525',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  cardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
    backgroundColor: '#000',
  },
  cardColorIndicator: {
    width: 5,
    height: 64,
    borderRadius: 2.5,
    marginRight: 18,
  },
  cardContent: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  cardDescription: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 21,
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 28,
    paddingHorizontal: 24,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  footerText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
    fontWeight: '500',
  },
});
