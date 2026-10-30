import { memo, useCallback } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, SCREEN_MARGIN, scrims, SERIF } from '../../catalog/theme';
import type { Effect } from '../../catalog/effects';
import { PressableScale } from './PressableScale';

const HERO_ASPECT = 0.68;
const MAX_HEIGHT_RATIO = 0.74;
const PARALLAX = 56;

export function useHeroHeight() {
  const { width, height } = useWindowDimensions();
  return Math.min(width / HERO_ASPECT, height * MAX_HEIGHT_RATIO);
}

type HeroProps = {
  effects: Effect[];
  scrollY: SharedValue<number>;
  onOpen: (effect: Effect) => void;
};

type HeroPageProps = {
  effect: Effect;
  index: number;
  width: number;
  height: number;
  pagerX: SharedValue<number>;
  onOpen: (effect: Effect) => void;
};

function HeroPage({
  effect,
  index,
  width,
  height,
  pagerX,
  onOpen,
}: HeroPageProps) {
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          pagerX.value,
          [(index - 1) * width, index * width, (index + 1) * width],
          [-PARALLAX, 0, PARALLAX]
        ),
      },
    ],
  }));

  return (
    <PressableScale
      onPress={() => onOpen(effect)}
      accessibilityLabel={`${effect.title}. ${effect.line}`}
      accessibilityHint="Opens this effect"
      style={{ width, height }}
    >
      <View style={styles.pageClip}>
        <Animated.Image
          source={effect.hero ?? effect.image}
          style={[styles.pageImage, { width, height }, imageStyle]}
        />
        <View style={[styles.caption, scrims.bottom]}>
          <Text
            style={styles.title}
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
          >
            {effect.title}
          </Text>
          <Text
            style={styles.line}
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
          >
            {effect.line}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

function PageMark({
  index,
  width,
  pagerX,
}: {
  index: number;
  width: number;
  pagerX: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      pagerX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0.3, 1, 0.3],
      Extrapolation.CLAMP
    ),
  }));

  return <Animated.View style={[styles.mark, style]} />;
}

export const Hero = memo(function Hero({
  effects,
  scrollY,
  onOpen,
}: HeroProps) {
  const { width } = useWindowDimensions();
  const height = useHeroHeight();
  const pagerX = useSharedValue(0);

  const onPagerScroll = useAnimatedScrollHandler((event) => {
    pagerX.value = event.contentOffset.x;
  });

  const stretchStyle = useAnimatedStyle(() => {
    const overscroll = Math.max(-scrollY.value, 0);
    return {
      transform: [
        { translateY: -overscroll / 2 },
        { scale: 1 + overscroll / height },
      ],
    };
  });

  const renderPage = useCallback(
    ({ item, index }: { item: Effect; index: number }) => (
      <HeroPage
        effect={item}
        index={index}
        width={width}
        height={height}
        pagerX={pagerX}
        onOpen={onOpen}
      />
    ),
    [width, height, pagerX, onOpen]
  );

  return (
    <Animated.View style={[{ height }, stretchStyle]}>
      <Animated.FlatList
        horizontal
        pagingEnabled
        data={effects}
        keyExtractor={(effect) => effect.id}
        renderItem={renderPage}
        showsHorizontalScrollIndicator={false}
        onScroll={onPagerScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
      />
      <View style={styles.marks} pointerEvents="none">
        {effects.map((effect, index) => (
          <PageMark
            key={effect.id}
            index={index}
            width={width}
            pagerX={pagerX}
          />
        ))}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pageClip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  pageImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 96,
    paddingHorizontal: SCREEN_MARGIN,
    paddingBottom: 36,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '600',
    letterSpacing: -0.6,
    color: colors.text,
  },
  line: {
    marginTop: 6,
    fontSize: 17,
    lineHeight: 23,
    color: 'rgba(255, 255, 255, 0.86)',
  },
  marks: {
    position: 'absolute',
    left: SCREEN_MARGIN,
    bottom: 16,
    flexDirection: 'row',
    gap: 6,
  },
  mark: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
  },
});
