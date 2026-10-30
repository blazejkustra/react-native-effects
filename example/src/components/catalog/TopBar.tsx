import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, SCREEN_MARGIN, scrims, SERIF } from '../../catalog/theme';
import { SearchGlyph } from './Glyphs';

const BAR_HEIGHT = 48;

type TopBarProps = {
  scrollY: SharedValue<number>;
  solidAfter: number;
  onSearch: () => void;
  onAbout: () => void;
};

export function TopBar({
  scrollY,
  solidAfter,
  onSearch,
  onAbout,
}: TopBarProps) {
  const insets = useSafeAreaInsets();

  const backdropStyle = useAnimatedStyle(() => ({
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
        style={[styles.backdrop, backdropStyle]}
        pointerEvents="none"
      />
      <View style={[styles.bar, { marginTop: insets.top }]}>
        <Text
          style={styles.wordmark}
          maxFontSizeMultiplier={1.2}
          accessibilityRole="header"
        >
          RN Effects
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search effects"
            hitSlop={8}
            onPress={onSearch}
            style={styles.action}
          >
            <SearchGlyph />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About this app"
            hitSlop={8}
            onPress={onAbout}
            style={styles.action}
          >
            <Text style={styles.info} maxFontSizeMultiplier={1}>
              i
            </Text>
          </Pressable>
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
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_MARGIN,
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
  action: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(40, 40, 40, 0.72)',
  },
  info: {
    fontFamily: SERIF,
    fontSize: 20,
    fontWeight: '600',
    fontStyle: 'italic',
    color: colors.text,
  },
});
