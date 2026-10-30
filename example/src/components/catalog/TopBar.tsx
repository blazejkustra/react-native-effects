import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, SCREEN_MARGIN, scrims, SERIF } from '../../catalog/theme';
import { SearchGlyph } from './Glyphs';

const BAR_HEIGHT = 52;
const CONTROL_SIZE = 44;
const SCROLL_EDGE_FADE = 28;
const SYSTEM_MARGIN = 16;

type TopBarProps = {
  scrollY: SharedValue<number>;
  solidAfter: number;
  onSearch: () => void;
  onAbout: () => void;
};

function GlassCircle({ children }: { children: ReactNode }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={styles.circle} colorScheme="dark" isInteractive>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView style={styles.circle} tint="systemChromeMaterialDark">
      {children}
    </BlurView>
  );
}

type ActionProps = {
  label: string;
  symbol: SFSymbol;
  fallback: ReactNode;
  onPress: () => void;
};

function Action({ label, symbol, fallback, onPress }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      <GlassCircle>
        <SymbolView
          name={symbol}
          size={20}
          weight="medium"
          tintColor={colors.text}
          fallback={fallback}
        />
      </GlassCircle>
    </Pressable>
  );
}

export function TopBar({
  scrollY,
  solidAfter,
  onSearch,
  onAbout,
}: TopBarProps) {
  const insets = useSafeAreaInsets();

  const scrollEdgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [solidAfter - 70, solidAfter],
      [0, 1],
      'clamp'
    ),
  }));

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View
        style={[styles.scrim, scrims.top, { height: insets.top + 96 }]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.scrollEdge,
          { height: insets.top + BAR_HEIGHT + SCROLL_EDGE_FADE },
          scrollEdgeStyle,
        ]}
        pointerEvents="none"
      />
      <View style={[styles.bar, { marginTop: insets.top }]}>
        <Text
          style={styles.wordmark}
          maxFontSizeMultiplier={1}
          accessibilityRole="header"
        >
          Effects
        </Text>
        <View style={styles.actions}>
          <Action
            label="Search effects"
            symbol="magnifyingglass"
            fallback={<SearchGlyph />}
            onPress={onSearch}
          />
          <Action
            label="About this app"
            symbol="info"
            fallback={<Text style={styles.infoFallback}>i</Text>}
            onPress={onAbout}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrollEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    experimental_backgroundImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.96) 78%, rgba(0,0,0,0) 100%)',
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: SCREEN_MARGIN,
    paddingRight: SYSTEM_MARGIN,
  },
  wordmark: {
    fontFamily: SERIF,
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  circle: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoFallback: {
    fontFamily: SERIF,
    fontSize: 20,
    fontWeight: '600',
    fontStyle: 'italic',
    color: colors.text,
  },
});
