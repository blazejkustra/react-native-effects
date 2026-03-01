import { useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView as RNScrollView,
  StatusBar,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  interpolateColor,
  Extrapolation,
  clamp,
} from 'react-native-reanimated';
import type { LayoutChangeEvent } from 'react-native';
import { BackButton } from '../components/BackButton';
import RainSplash from '../components/RainSplash';
import { WEATHER_THEMES, type WeatherScenario } from '../config/weatherThemes';

const SCENARIOS: WeatherScenario[] = ['night', 'sunny', 'cloudy', 'rainy'];
const SCENARIO_LABELS: Record<WeatherScenario, string> = {
  night: 'Night',
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
};

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

type DailyItem = {
  day: string;
  icon: WeatherType;
  low: number;
  high: number;
  precip?: string;
};

type ScenarioForecast = {
  currentTemp: string;
  condition: string;
  description: string;
  high: string;
  low: string;
  hourly: HourlyItem[];
  daily: DailyItem[];
};

const SCENARIO_FORECASTS: Record<WeatherScenario, ScenarioForecast> = {
  night: {
    currentTemp: '4',
    condition: 'Clear',
    description:
      'Clear skies tonight with temperatures dropping to 0°. Light winds from the northwest.',
    high: '15',
    low: '0',
    hourly: [
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
    ],
    daily: [
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
    ],
  },
  sunny: {
    currentTemp: '28',
    condition: 'Mostly Sunny',
    description:
      'Sunny skies throughout the day. UV index is high, reaching 8 around midday.',
    high: '31',
    low: '19',
    hourly: [
      { time: 'Now', icon: 'clear-day', temp: '28°' },
      { time: '14', icon: 'clear-day', temp: '30°' },
      { time: '15', icon: 'clear-day', temp: '31°' },
      { time: '16', icon: 'clear-day', temp: '30°' },
      { time: '17', icon: 'partly-cloudy-day', temp: '28°' },
      { time: '18', icon: 'partly-cloudy-day', temp: '26°' },
      { time: '19', icon: 'sunset', temp: '24°' },
      { time: '20', icon: 'clear-night', temp: '22°' },
      { time: '21', icon: 'clear-night', temp: '21°' },
      { time: '22', icon: 'clear-night', temp: '20°' },
      { time: '23', icon: 'clear-night', temp: '19°' },
      { time: '00', icon: 'clear-night', temp: '19°' },
      { time: '01', icon: 'clear-night', temp: '18°' },
      { time: '02', icon: 'clear-night', temp: '18°' },
    ],
    daily: [
      { day: 'Today', icon: 'clear-day', low: 19, high: 31 },
      { day: 'Sun', icon: 'clear-day', low: 20, high: 33 },
      { day: 'Mon', icon: 'clear-day', low: 21, high: 34 },
      { day: 'Tue', icon: 'partly-cloudy-day', low: 20, high: 30 },
      { day: 'Wed', icon: 'partly-cloudy-day', low: 19, high: 28 },
      { day: 'Thu', icon: 'clear-day', low: 18, high: 29 },
      { day: 'Fri', icon: 'clear-day', low: 20, high: 32 },
      { day: 'Sat', icon: 'partly-cloudy-day', low: 21, high: 30 },
      { day: 'Sun', icon: 'clear-day', low: 19, high: 31 },
      { day: 'Mon', icon: 'thunderstorm', low: 18, high: 27, precip: '40%' },
    ],
  },
  cloudy: {
    currentTemp: '12',
    condition: 'Overcast',
    description:
      'Partly cloudy conditions expected around 08:00. Wind gusts are up to 2 m/s.',
    high: '14',
    low: '6',
    hourly: [
      { time: 'Now', icon: 'cloudy', temp: '12°' },
      { time: '14', icon: 'cloudy', temp: '13°' },
      { time: '15', icon: 'cloudy', temp: '14°' },
      { time: '16', icon: 'cloudy', temp: '13°' },
      { time: '17', icon: 'cloudy', temp: '12°' },
      { time: '18', icon: 'cloudy', temp: '11°' },
      { time: '19', icon: 'cloudy', temp: '10°' },
      { time: '20', icon: 'cloudy', temp: '9°' },
      { time: '21', icon: 'cloudy', temp: '8°' },
      { time: '22', icon: 'partly-cloudy-night', temp: '7°' },
      { time: '23', icon: 'partly-cloudy-night', temp: '7°' },
      { time: '00', icon: 'cloudy', temp: '6°' },
      { time: '01', icon: 'cloudy', temp: '6°' },
      { time: '02', icon: 'cloudy', temp: '6°' },
    ],
    daily: [
      { day: 'Today', icon: 'cloudy', low: 6, high: 14 },
      { day: 'Sun', icon: 'cloudy', low: 5, high: 12 },
      { day: 'Mon', icon: 'drizzle', low: 7, high: 13, precip: '30%' },
      { day: 'Tue', icon: 'rain', low: 8, high: 14, precip: '60%' },
      { day: 'Wed', icon: 'cloudy', low: 4, high: 11 },
      { day: 'Thu', icon: 'partly-cloudy-day', low: 3, high: 13 },
      { day: 'Fri', icon: 'cloudy', low: 5, high: 10 },
      { day: 'Sat', icon: 'fog', low: 2, high: 9 },
      { day: 'Sun', icon: 'partly-cloudy-day', low: 4, high: 15 },
      { day: 'Mon', icon: 'cloudy', low: 6, high: 12 },
    ],
  },
  rainy: {
    currentTemp: '9',
    condition: 'Heavy Rain',
    description:
      'Heavy rain expected until 18:00 with possible thunderstorms. Carry an umbrella.',
    high: '11',
    low: '5',
    hourly: [
      { time: 'Now', icon: 'heavy-rain', temp: '9°' },
      { time: '14', icon: 'heavy-rain', temp: '9°' },
      { time: '15', icon: 'rain', temp: '10°' },
      { time: '16', icon: 'rain', temp: '10°' },
      { time: '17', icon: 'thunderstorm', temp: '9°' },
      { time: '18', icon: 'thunderstorm', temp: '8°' },
      { time: '19', icon: 'rain', temp: '7°' },
      { time: '20', icon: 'drizzle', temp: '7°' },
      { time: '21', icon: 'drizzle-night', temp: '6°' },
      { time: '22', icon: 'cloudy', temp: '6°' },
      { time: '23', icon: 'cloudy', temp: '5°' },
      { time: '00', icon: 'partly-cloudy-night', temp: '5°' },
      { time: '01', icon: 'drizzle-night', temp: '5°' },
      { time: '02', icon: 'cloudy', temp: '5°' },
    ],
    daily: [
      { day: 'Today', icon: 'heavy-rain', low: 5, high: 11, precip: '90%' },
      { day: 'Sun', icon: 'rain', low: 4, high: 10, precip: '70%' },
      { day: 'Mon', icon: 'thunderstorm', low: 6, high: 12, precip: '80%' },
      { day: 'Tue', icon: 'drizzle', low: 5, high: 11, precip: '50%' },
      { day: 'Wed', icon: 'cloudy', low: 3, high: 10 },
      { day: 'Thu', icon: 'rain', low: 4, high: 9, precip: '60%' },
      { day: 'Fri', icon: 'partly-cloudy-day', low: 2, high: 12 },
      { day: 'Sat', icon: 'rain', low: 5, high: 10, precip: '55%' },
      { day: 'Sun', icon: 'cloudy', low: 3, high: 11 },
      { day: 'Mon', icon: 'partly-cloudy-day', low: 4, high: 14 },
    ],
  },
};

function getTempRange(daily: DailyItem[]) {
  const low = Math.min(...daily.map((d) => d.low));
  const high = Math.max(...daily.map((d) => d.high));
  return { overallLow: low, overallHigh: high, tempRange: high - low };
}

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

function barGradient(
  low: number,
  high: number,
  overallLow: number,
  tempRange: number
): string {
  const tLow = (low - overallLow) / tempRange;
  const tHigh = (high - overallLow) / tempRange;
  return `linear-gradient(to right, ${lerpColor(tLow)}, ${lerpColor(
    (tLow + tHigh) / 2
  )}, ${lerpColor(tHigh)})`;
}

export default function WeatherScreen() {
  const [scenario, setScenario] = useState<WeatherScenario>('night');
  const theme = WEATHER_THEMES[scenario];
  const { colors } = theme;
  const BackgroundComponent = theme.BackgroundComponent;
  const forecast = SCENARIO_FORECASTS[scenario];
  const { overallLow, tempRange } = getTempRange(forecast.daily);

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

  const stickyHeaderBg = colors.stickyHeaderBg;

  const hourlyStickyAnim = useAnimatedStyle(() => {
    const offset = scrollY.value - hourlySectionY.value;
    const maxOffset = hourlySectionH.value - hourlyHeaderH.value;
    return {
      transform: [{ translateY: clamp(offset, 0, maxOffset) }],
      zIndex: 1,
      backgroundColor: interpolateColor(
        clamp(offset, 0, 1),
        [0, 1],
        ['transparent', stickyHeaderBg]
      ),
    };
  });

  const dailyStickyAnim = useAnimatedStyle(() => {
    const offset = scrollY.value - dailySectionY.value;
    const maxOffset = dailySectionH.value - dailyHeaderH.value;
    return {
      transform: [{ translateY: clamp(offset, 0, maxOffset) }],
      zIndex: 1,
      backgroundColor: interpolateColor(
        clamp(offset, 0, 1),
        [0, 1],
        ['transparent', stickyHeaderBg]
      ),
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

  const rainSplashAnim = useAnimatedStyle(() => {
    // Clamp so it doesn't float above the scroll area top
    return {
      transform: [
        { translateY: Math.max(hourlySectionY.value - scrollY.value, 0) - 200 },
      ],
    };
  });

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.bgColor,
        },
        section: {
          borderRadius: 15,
          borderWidth: 1,
          borderColor: colors.cardBorder,
          backgroundColor: colors.cardBg,
          overflow: 'hidden',
          marginBottom: 14,
        },
        stickyHeader: {
          margin: -1,
          marginBottom: 0,
          borderRadius: 15,
          borderColor: colors.cardBorder,
          borderTopWidth: 1,
          borderRightWidth: 1,
          borderLeftWidth: 1,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          backgroundColor: colors.cardBg,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
        },
        precipText: {
          fontSize: 11,
          fontWeight: '700',
          color: colors.accentColor,
          marginTop: 1,
        },
      }),
    [colors]
  );

  return (
    <View style={dynamicStyles.container}>
      <StatusBar
        barStyle={colors.statusBarStyle}
        backgroundColor="transparent"
        translucent
      />

      <View style={styles.scenarioRow}>
        {SCENARIOS.map((s) => (
          <Pressable
            key={s}
            onPress={() => setScenario(s)}
            style={[
              styles.scenarioChip,
              s === scenario && styles.scenarioChipActive,
            ]}
          >
            <Text
              style={[
                styles.scenarioChipText,
                s === scenario && styles.scenarioChipTextActive,
              ]}
            >
              {SCENARIO_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      <BackgroundComponent
        style={StyleSheet.absoluteFillObject}
        {...theme.backgroundProps}
      />

      {/* ═══ Fixed header — outside scroll view ═══ */}
      <View style={styles.fixedHeader} pointerEvents="box-none">
        <View style={styles.backButtonRow}>
          <BackButton />
        </View>

        <Animated.View style={cityAnim}>
          <Text style={styles.cityName}>Kraków</Text>
          <Animated.View style={[styles.compactInfoWrap, compactInfoAnim]}>
            <Text style={styles.compactInfo}>
              {forecast.currentTemp}° | {forecast.condition}
            </Text>
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
                {forecast.currentTemp}
                <Text style={styles.degreeSymbol}>°</Text>
              </Text>
            </Animated.View>
            <Animated.Text style={[styles.condition, condAnim]}>
              {forecast.condition}
            </Animated.Text>
            <Animated.Text style={[styles.highLow, hlAnim]}>
              H:{forecast.high}° L:{forecast.low}°
            </Animated.Text>
          </Animated.View>

          {/* ─── Hourly Forecast Section ─── */}
          <View style={dynamicStyles.section} onLayout={onHourlySectionLayout}>
            <Animated.View
              style={[dynamicStyles.stickyHeader, hourlyStickyAnim]}
              onLayout={onHourlyHeaderLayout}
            >
              <Animated.View style={[styles.cardHeaderSwap, headerSwapAnim]}>
                <Animated.View style={[styles.cardHeaderLayer, descAnim]}>
                  <Text style={styles.cardDescription}>
                    {forecast.description}
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
                {forecast.hourly.map((item, index) => (
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
          <View style={dynamicStyles.section} onLayout={onDailySectionLayout}>
            <Animated.View
              style={[dynamicStyles.stickyHeader, dailyStickyAnim]}
              onLayout={onDailyHeaderLayout}
            >
              <View style={styles.sectionHeader}>
                <CalendarIcon size={14} />
                <Text style={styles.sectionHeaderText}>10-DAY FORECAST</Text>
              </View>
            </Animated.View>

            <View style={[styles.cardBody, styles.dailyCard]}>
              {forecast.daily.map((item, index) => {
                const barLeft = ((item.low - overallLow) / tempRange) * 100;
                const barWidth = ((item.high - item.low) / tempRange) * 100;

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
                          <Text style={dynamicStyles.precipText}>
                            {item.precip}
                          </Text>
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
                                  item.high,
                                  overallLow,
                                  tempRange
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
        {scenario === 'rainy' && (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 14,
                right: 14,
                height: 200,
                zIndex: 2,
              },
              rainSplashAnim,
            ]}
            pointerEvents="none"
          >
            <RainSplash style={{ flex: 1 }} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ═══ Fixed header ═══
  fixedHeader: {
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backButtonRow: {
    marginBottom: 6,
  },
  scenarioRow: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
  },
  scenarioChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  scenarioChipActive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  scenarioChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  scenarioChipTextActive: {
    color: '#fff',
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

  // ═══ Cards ═══
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
