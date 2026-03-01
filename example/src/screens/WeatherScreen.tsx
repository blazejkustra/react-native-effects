import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView as RNScrollView,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  clamp,
} from 'react-native-reanimated';
import type { LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'react-native-effects';
import { BackButton } from '../components/BackButton';

const RAIN_BLUE = '#64D2FF';
const BG_COLOR = '#0F1B3D';
const CARD_BG = '#1A2650';
const CARD_BORDER = '#3D4768';

type WeatherType =
  | 'clear-day'
  | 'partly-cloudy-day'
  | 'cloudy'
  | 'haze'
  | 'fog'
  | 'windy'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'snow'
  | 'heavy-snow'
  | 'sleet'
  | 'clear-night'
  | 'partly-cloudy-night'
  | 'drizzle-night'
  | 'sunrise'
  | 'sunset';

const WEATHER_ICONS: Record<WeatherType, ReturnType<typeof require>> = {
  'clear-day': require('../../assets/weather/clear-day.png'),
  'partly-cloudy-day': require('../../assets/weather/partly-cloudy-day.png'),
  'cloudy': require('../../assets/weather/cloudy.png'),
  'haze': require('../../assets/weather/haze.png'),
  'fog': require('../../assets/weather/fog.png'),
  'windy': require('../../assets/weather/windy.png'),
  'drizzle': require('../../assets/weather/drizzle.png'),
  'rain': require('../../assets/weather/rain.png'),
  'heavy-rain': require('../../assets/weather/heavy-rain.png'),
  'thunderstorm': require('../../assets/weather/thunderstorm.png'),
  'snow': require('../../assets/weather/snow.png'),
  'heavy-snow': require('../../assets/weather/heavy-snow.png'),
  'sleet': require('../../assets/weather/sleet.png'),
  'clear-night': require('../../assets/weather/clear-night.png'),
  'partly-cloudy-night': require('../../assets/weather/partly-cloudy-night.png'),
  'drizzle-night': require('../../assets/weather/drizzle-night.png'),
  'sunrise': require('../../assets/weather/sunrise.png'),
  'sunset': require('../../assets/weather/sunset.png'),
};

function WeatherIcon({
  type,
  size = 24,
}: {
  type: WeatherType;
  size?: number;
}) {
  return (
    <Image
      source={WEATHER_ICONS[type]}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// --- Section Header Icons ---

function ClockIcon({ size = 13 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/weather/clock.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

function CalendarIcon({ size = 13 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/weather/calendar.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

// --- Forecast Data ---

type HourlyItem = { time: string; icon: WeatherType; temp: string };

const HOURLY_FORECAST: HourlyItem[] = [
  { time: 'Now', icon: 'partly-cloudy-night', temp: '4°' },
  { time: '22', icon: 'partly-cloudy-night', temp: '4°' },
  { time: '23', icon: 'partly-cloudy-night', temp: '3°' },
  { time: '00', icon: 'partly-cloudy-night', temp: '3°' },
  { time: '01', icon: 'partly-cloudy-night', temp: '2°' },
  { time: '02', icon: 'clear-night', temp: '2°' },
  { time: '03', icon: 'clear-night', temp: '2°' },
  { time: '04', icon: 'clear-night', temp: '1°' },
  { time: '05', icon: 'partly-cloudy-night', temp: '1°' },
  { time: '06', icon: 'cloudy', temp: '2°' },
  { time: '07', icon: 'partly-cloudy-day', temp: '3°' },
  { time: '08', icon: 'partly-cloudy-day', temp: '5°' },
  { time: '09', icon: 'clear-day', temp: '7°' },
  { time: '10', icon: 'clear-day', temp: '9°' },
];

type DailyItem = {
  day: string;
  icon: WeatherType;
  low: number;
  high: number;
  precip?: string;
};

const DAILY_FORECAST: DailyItem[] = [
  { day: 'Today', icon: 'partly-cloudy-night', low: 0, high: 15 },
  { day: 'Sun', icon: 'partly-cloudy-day', low: -2, high: 8 },
  { day: 'Mon', icon: 'rain', low: 3, high: 11, precip: '60%' },
  { day: 'Tue', icon: 'heavy-rain', low: 5, high: 9, precip: '80%' },
  { day: 'Wed', icon: 'cloudy', low: 1, high: 14 },
  { day: 'Thu', icon: 'clear-day', low: -3, high: 7 },
  { day: 'Fri', icon: 'snow', low: -6, high: 1, precip: '40%' },
  { day: 'Sat', icon: 'partly-cloudy-day', low: -4, high: 5 },
  { day: 'Sun', icon: 'clear-day', low: 2, high: 18 },
  { day: 'Mon', icon: 'clear-day', low: 6, high: 22 },
  { day: 'Tue', icon: 'partly-cloudy-day', low: 8, high: 24 },
  { day: 'Wed', icon: 'thunderstorm', low: 10, high: 21, precip: '70%' },
  { day: 'Thu', icon: 'rain', low: 4, high: 13, precip: '50%' },
  { day: 'Fri', icon: 'cloudy', low: 1, high: 10 },
  { day: 'Sat', icon: 'clear-day', low: -1, high: 16 },
  { day: 'Sun', icon: 'clear-day', low: 3, high: 19 },
  { day: 'Mon', icon: 'partly-cloudy-day', low: 5, high: 17 },
];

const OVERALL_LOW = Math.min(...DAILY_FORECAST.map((d) => d.low));
const OVERALL_HIGH = Math.max(...DAILY_FORECAST.map((d) => d.high));
const TEMP_RANGE = OVERALL_HIGH - OVERALL_LOW;

// Full temperature color stops (cold → hot)
const TEMP_COLORS = [
  { pos: 0, r: 90, g: 200, b: 250 }, // #5AC8FA  — coldest
  { pos: 0.33, r: 52, g: 199, b: 89 }, // #34C759  — cool
  { pos: 0.66, r: 255, g: 204, b: 0 }, // #FFCC00  — warm
  { pos: 1, r: 255, g: 149, b: 0 }, // #FF9500  — hot
];

function lerpColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < TEMP_COLORS.length - 2 && TEMP_COLORS[i + 1]!.pos < clamped) {
    i++;
  }
  const a = TEMP_COLORS[i]!;
  const b = TEMP_COLORS[i + 1]!;
  const local = (clamped - a.pos) / (b.pos - a.pos);
  const r = Math.round(a.r + (b.r - a.r) * local);
  const g = Math.round(a.g + (b.g - a.g) * local);
  const bl = Math.round(a.b + (b.b - a.b) * local);
  return `rgb(${r}, ${g}, ${bl})`;
}

function barGradient(low: number, high: number): string {
  const tLow = (low - OVERALL_LOW) / TEMP_RANGE;
  const tHigh = (high - OVERALL_LOW) / TEMP_RANGE;
  return `linear-gradient(to right, ${lerpColor(tLow)}, ${lerpColor(
    (tLow + tHigh) / 2
  )}, ${lerpColor(tHigh)})`;
}

export default function WeatherScreen() {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // --- City block: slides up slightly on scroll ---
  const cityAnim = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, 100],
          [0, -32],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // --- Compact info: height expand + fade in ---
  const compactInfoAnim = useAnimatedStyle(() => ({
    maxHeight: interpolate(
      scrollY.value,
      [50, 100],
      [0, 28],
      Extrapolation.CLAMP
    ),
    opacity: interpolate(scrollY.value, [50, 100], [0, 1], Extrapolation.CLAMP),
  }));

  // --- Expanded header collapse: shrinks the whole temp/condition/HL block ---
  const expandedAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP),
  }));

  // --- Temperature: fade ---
  const tempAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [40, 110], [1, 0], Extrapolation.CLAMP),
  }));

  // --- Condition: opacity fade ---
  const condAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [15, 55], [1, 0], Extrapolation.CLAMP),
  }));

  // --- H:L: earliest fade ---
  const hlAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 35], [1, 0], Extrapolation.CLAMP),
  }));

  // --- Manual sticky header layout tracking ---
  const hourlySectionY = useSharedValue(0);
  const hourlySectionH = useSharedValue(0);
  const hourlyHeaderH = useSharedValue(0);

  const dailySectionY = useSharedValue(0);
  const dailySectionH = useSharedValue(0);
  const dailyHeaderH = useSharedValue(0);

  const onHourlySectionLayout = (e: LayoutChangeEvent) => {
    hourlySectionY.value = e.nativeEvent.layout.y;
    hourlySectionH.value = e.nativeEvent.layout.height;
  };
  const onHourlyHeaderLayout = (e: LayoutChangeEvent) => {
    hourlyHeaderH.value = e.nativeEvent.layout.height;
  };
  const onDailySectionLayout = (e: LayoutChangeEvent) => {
    dailySectionY.value = e.nativeEvent.layout.y;
    dailySectionH.value = e.nativeEvent.layout.height;
  };
  const onDailyHeaderLayout = (e: LayoutChangeEvent) => {
    dailyHeaderH.value = e.nativeEvent.layout.height;
  };

  const hourlyStickyAnim = useAnimatedStyle(() => {
    const offset = scrollY.value - hourlySectionY.value;
    const maxOffset = hourlySectionH.value - hourlyHeaderH.value;
    return {
      transform: [{ translateY: clamp(offset, 0, maxOffset) }],
      zIndex: 1,
    };
  });

  const dailyStickyAnim = useAnimatedStyle(() => {
    const offset = scrollY.value - dailySectionY.value;
    const maxOffset = dailySectionH.value - dailyHeaderH.value;
    return {
      transform: [{ translateY: clamp(offset, 0, maxOffset) }],
      zIndex: 1,
    };
  });

  // --- Hourly card description → "HOURLY FORECAST" header swap ---

  const headerSwapAnim = useAnimatedStyle(() => ({
    height: interpolate(
      scrollY.value,
      [170, 190],
      [44, 20],
      Extrapolation.CLAMP
    ),
  }));

  const descAnim = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [160, 180],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const hourlyLabelAnim = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [170, 190],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      <LinearGradient
        startColor="#0F1B3D"
        endColor="#1C2B5A"
        angle={180}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ═══ Fixed header — outside scroll view ═══ */}
      <View style={styles.fixedHeader} pointerEvents="box-none">
        <View style={styles.backButtonRow}>
          <BackButton />
        </View>
        <Animated.View style={cityAnim}>
          <Text style={styles.cityName}>Kraków</Text>
          <Animated.View style={[styles.compactInfoWrap, compactInfoAnim]}>
            <Text style={styles.compactInfo}>4° | Clear</Text>
          </Animated.View>
        </Animated.View>
      </View>

      {/* ═══ Scroll area — clipped below header ═══ */}
      <View style={styles.scrollArea}>
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Expanded header: temp / condition / H:L — collapses on scroll */}
          <Animated.View style={[styles.expandedHeader, expandedAnim]}>
            <Animated.View style={[styles.tempWrap, tempAnim]}>
              <Text style={styles.temperature}>
                4<Text style={styles.degreeSymbol}>°</Text>
              </Text>
            </Animated.View>
            <Animated.Text style={[styles.condition, condAnim]}>
              Clear
            </Animated.Text>
            <Animated.Text style={[styles.highLow, hlAnim]}>
              H:15° L:0°
            </Animated.Text>
          </Animated.View>

          {/* ─── Hourly Forecast Section ─── */}
          <View style={styles.section} onLayout={onHourlySectionLayout}>
            <Animated.View
              style={[styles.stickyHeader, hourlyStickyAnim]}
              onLayout={onHourlyHeaderLayout}
            >
              <Animated.View style={[styles.cardHeaderSwap, headerSwapAnim]}>
                <Animated.View style={[styles.cardHeaderLayer, descAnim]}>
                  <Text style={styles.cardDescription}>
                    Partly cloudy conditions expected around 08:00. Wind gusts
                    are up to 2 m/s.
                  </Text>
                </Animated.View>
                <Animated.View
                  style={[styles.cardHeaderLayer, hourlyLabelAnim]}
                >
                  <View style={styles.sectionHeader}>
                    <ClockIcon size={14} />
                    <Text style={styles.sectionHeaderText}>
                      HOURLY FORECAST
                    </Text>
                  </View>
                </Animated.View>
              </Animated.View>
            </Animated.View>

            <View style={styles.cardBody}>
              <View style={styles.divider} />
              <RNScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hourlyContent}
              >
                {HOURLY_FORECAST.map((item, index) => (
                  <View key={index} style={styles.hourlyItem}>
                    <Text
                      style={[
                        styles.hourlyTime,
                        index === 0 && styles.hourlyTimeNow,
                      ]}
                    >
                      {item.time}
                    </Text>
                    <View style={styles.hourlyIconWrap}>
                      <WeatherIcon type={item.icon} size={26} />
                    </View>
                    <Text style={styles.hourlyTemp}>{item.temp}</Text>
                  </View>
                ))}
              </RNScrollView>
            </View>
          </View>

          {/* ─── 10-Day Forecast Section ─── */}
          <View style={styles.section} onLayout={onDailySectionLayout}>
            <Animated.View
              style={[styles.stickyHeader, dailyStickyAnim]}
              onLayout={onDailyHeaderLayout}
            >
              <View style={styles.sectionHeader}>
                <CalendarIcon size={14} />
                <Text style={styles.sectionHeaderText}>10-DAY FORECAST</Text>
              </View>
            </Animated.View>

            <View style={[styles.cardBody, styles.dailyCard]}>
              {DAILY_FORECAST.map((item, index) => {
                const barLeft = ((item.low - OVERALL_LOW) / TEMP_RANGE) * 100;
                const barWidth = ((item.high - item.low) / TEMP_RANGE) * 100;

                return (
                  <View key={index}>
                    <View style={styles.dailySeparator} />
                    <View style={styles.dailyRow}>
                      <Text
                        style={[
                          styles.dailyDay,
                          index === 0 && styles.dailyDayToday,
                        ]}
                      >
                        {item.day}
                      </Text>
                      <View style={styles.dailyIconWrap}>
                        <WeatherIcon type={item.icon} size={22} />
                        {item.precip && (
                          <Text style={styles.precipText}>{item.precip}</Text>
                        )}
                      </View>
                      <Text style={styles.dailyLow}>{item.low}°</Text>
                      <View style={styles.barContainer}>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                left: `${barLeft}%`,
                                width: `${Math.max(barWidth, 8)}%`,
                                experimental_backgroundImage: barGradient(
                                  item.low,
                                  item.high
                                ),
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={styles.dailyHigh}>{item.high}°</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },

  // ═══ Fixed header ═══
  fixedHeader: {
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backButtonRow: {
    marginBottom: 6,
  },
  cityName: {
    fontSize: 36,
    fontWeight: '400',
    color: '#fff',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  compactInfoWrap: {
    alignItems: 'center',
    marginTop: 2,
    overflow: 'hidden',
  },
  compactInfo: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.2,
  },
  compactDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 10,
    marginHorizontal: -20,
  },

  // ═══ Scroll area — clips content below header ═══
  scrollArea: {
    flex: 1,
    marginHorizontal: 16,
  },
  scrollView: {
    flex: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingBottom: 60,
  },

  // --- Expanded header (collapses on scroll) ---
  expandedHeader: {
    alignItems: 'center',
    paddingBottom: 28,
    overflow: 'hidden',
  },
  tempWrap: {
    alignItems: 'center',
  },
  temperature: {
    fontSize: 96,
    fontWeight: '100',
    color: '#fff',
    lineHeight: 104,
  },
  degreeSymbol: {
    fontSize: 96,
    fontWeight: '100',
  },
  condition: {
    fontSize: 20,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 0,
    textAlign: 'center',
  },
  highLow: {
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
    marginTop: 2,
    textAlign: 'center',
  },

  // ═══ Cards (section wraps sticky header + body) ═══
  section: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    overflow: 'hidden',
    marginBottom: 14,
  },
  stickyHeader: {
    margin: -1,
    marginBottom: 0,
    borderRadius: 15,
    borderColor: CARD_BORDER,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderLeftWidth: 1,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  dailyCard: {
    paddingBottom: 8,
  },
  cardDescription: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },

  // --- Section header ---
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.3,
  },

  // --- Description / Hourly header swap ---
  cardHeaderSwap: {
    overflow: 'hidden',
  },
  cardHeaderLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  // --- Hourly forecast ---
  hourlyContent: {},
  hourlyItem: {
    gap: 0,
    alignItems: 'center',
    width: 62,
  },
  hourlyTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  hourlyTimeNow: {
    fontWeight: '700',
  },
  hourlyIconWrap: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  hourlyTemp: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
  },

  // --- 10-Day forecast ---
  dailySeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
  },
  dailyDay: {
    width: 62,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  dailyDayToday: {
    fontWeight: '700',
  },
  dailyIconWrap: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  precipText: {
    fontSize: 11,
    fontWeight: '700',
    color: RAIN_BLUE,
    marginTop: 1,
  },
  dailyLow: {
    width: 36,
    fontSize: 20,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'right',
    marginRight: 8,
  },
  barContainer: {
    flex: 1,
    height: 5,
    justifyContent: 'center',
  },
  barTrack: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 2.5,
  },
  dailyHigh: {
    width: 36,
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
    textAlign: 'right',
    marginLeft: 8,
  },
});
