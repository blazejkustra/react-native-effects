import { ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { EffectRow } from '../../components/catalog/EffectRow';
import type { Effect } from '../../catalog/effects';
import { colors } from '../../catalog/theme';
import type { HomeScreenNavigationProp } from '../../types';

const EXAMPLES: Effect[] = [
  {
    id: 'static',
    title: 'Static',
    line: 'Presets at different angles',
    screen: 'LinearGradientStatic',
    image: require('../../../assets/catalog/linear-gradient.jpg'),
  },
  {
    id: 'animated',
    title: 'Animated',
    line: 'Colors that rotate continuously',
    screen: 'LinearGradientAnimated',
    image: require('../../../assets/catalog/linear-gradient-animated.jpg'),
  },
];

export default function LinearGradientListScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {EXAMPLES.map((example, index) => (
        <EffectRow
          key={example.id}
          effect={example}
          onOpen={(effect) => navigation.navigate(effect.screen as never)}
          showSeparator={index < EXAMPLES.length - 1}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 8,
  },
});
