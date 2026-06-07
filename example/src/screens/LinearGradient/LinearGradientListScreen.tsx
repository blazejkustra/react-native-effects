import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Header } from '../../components/Header';
import type { GradientExample } from './types';
import type { HomeScreenNavigationProp } from '../../types';

const LINEAR_GRADIENT_EXAMPLES: GradientExample[] = [
  {
    id: 'static',
    title: 'Static Gradient',
    description: 'Beautiful static linear gradients with various directions',
    screen: 'LinearGradientStatic',
    preview: {
      startColor: '#ec4899',
      endColor: '#8b5cf6',
    },
  },
  {
    id: 'animated',
    title: 'Animated Gradient',
    description: 'Dynamic gradient with smooth color transitions and rotations',
    screen: 'LinearGradientAnimated',
    preview: {
      startColor: '#06b6d4',
      endColor: '#3b82f6',
    },
  },
];

export default function LinearGradientListScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <Header
        title="Linear Gradients"
        subtitle="Choose an example to explore"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {LINEAR_GRADIENT_EXAMPLES.map((example) => (
          <TouchableOpacity
            key={example.id}
            style={styles.card}
            onPress={() => navigation.navigate(example.screen as never)}
            activeOpacity={0.7}
          >
            <View style={[styles.previewBox]}>
              <View
                style={[
                  styles.previewGradient,
                  { backgroundColor: example.preview.startColor },
                ]}
              />
              <View
                style={[
                  styles.previewGradient,
                  { backgroundColor: example.preview.endColor },
                ]}
              />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{example.title}</Text>
              <Text style={styles.cardDescription}>{example.description}</Text>
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
  title: {
    fontSize: 32,
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
    paddingBottom: 40,
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
  previewBox: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 18,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
  },
  previewGradient: {
    flex: 1,
    height: '100%',
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
});
