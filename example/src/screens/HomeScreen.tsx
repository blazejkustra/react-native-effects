import { useCallback, type ComponentType } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hero, useHeroHeight } from '../components/catalog/Hero';
import {
  Diptych,
  EffectRows,
  LeadStory,
  LightWall,
  OrbRail,
  PosterRail,
  TileRail,
  WideStack,
  type LayoutProps,
} from '../components/catalog/layouts';
import { TopBar } from '../components/catalog/TopBar';
import {
  FEATURED_EFFECTS,
  SECTIONS,
  type CatalogSection,
  type Effect,
  type SectionLayout,
} from '../catalog/effects';
import { colors, SCREEN_MARGIN, SERIF } from '../catalog/theme';
import type { HomeScreenNavigationProp } from '../types';

const LAYOUTS: Record<SectionLayout, ComponentType<LayoutProps>> = {
  posters: PosterRail,
  diptych: Diptych,
  lead: LeadStory,
  tiles: TileRail,
  wide: WideStack,
  orbs: OrbRail,
  rows: EffectRows,
  wall: LightWall,
};

const HERO_CAPTION_CLEARANCE = 190;

function sectionKey(section: CatalogSection) {
  return section.id;
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const heroHeight = useHeroHeight();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const openEffect = useCallback(
    (effect: Effect) => navigation.navigate(effect.screen as never),
    [navigation]
  );

  const renderSection = useCallback(
    ({ item }: { item: CatalogSection }) => {
      const Layout = LAYOUTS[item.layout];
      return (
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.5}
          >
            {item.title}
          </Text>
          <Layout effects={item.effects} onOpen={openEffect} />
        </View>
      );
    },
    [openEffect]
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Animated.FlatList
        data={SECTIONS}
        keyExtractor={sectionKey}
        renderItem={renderSection}
        ListHeaderComponent={
          <Hero
            effects={FEATURED_EFFECTS}
            scrollY={scrollY}
            onOpen={openEffect}
          />
        }
        ListFooterComponent={<View style={{ height: insets.bottom + 40 }} />}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
      />
      <TopBar
        scrollY={scrollY}
        solidAfter={heroHeight - HERO_CAPTION_CLEARANCE - insets.top}
        onSearch={() => navigation.navigate('Search')}
        onAbout={() => navigation.navigate('About')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    marginTop: 44,
  },
  sectionTitle: {
    marginBottom: 16,
    paddingHorizontal: SCREEN_MARGIN,
    fontFamily: SERIF,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.text,
  },
});
