import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';
import NightSky from '../components/NightSky';
import SunnySky from '../components/SunnySky';
import CloudySky from '../components/CloudySky';
import RainySky from '../components/RainySky';

export type WeatherScenario = 'night' | 'sunny' | 'cloudy' | 'rainy';

export type WeatherColorPalette = {
  bgColor: string;
  accentColor: string;
  cardBg: string;
  cardBorder: string;
  stickyHeaderBg: string;
  textPrimary: string;
  textSecondary: string;
  statusBarStyle: 'light-content' | 'dark-content';
};

type WeatherTheme = {
  BackgroundComponent: ComponentType<ViewProps & Record<string, any>>;
  backgroundProps: Record<string, any>;
  colors: WeatherColorPalette;
};

export const WEATHER_THEMES: Record<WeatherScenario, WeatherTheme> = {
  night: {
    BackgroundComponent: NightSky,
    backgroundProps: { endColor: '#030417', startColor: '#2D3A59' },
    colors: {
      bgColor: '#0F1B3D',
      accentColor: '#64D2FF',
      cardBg: 'rgba(26, 38, 80, 0.6)',
      cardBorder: 'rgba(61, 71, 104, 0.6)',
      stickyHeaderBg: 'rgb(18, 30, 62)',
      textPrimary: '#fff',
      textSecondary: 'rgba(255,255,255,0.7)',
      statusBarStyle: 'light-content',
    },
  },
  sunny: {
    BackgroundComponent: SunnySky,
    backgroundProps: {
      startColor: '#4A8AC4',
      endColor: '#1B5FAA',
      sunSize: 0.5,
    },
    colors: {
      bgColor: '#4A90D9',
      accentColor: '#3CD3FE',
      cardBg: '#2773BD',
      cardBorder: '#4482c0',
      stickyHeaderBg: '#2773BD',
      textPrimary: '#fff',
      textSecondary: 'rgba(255,255,255,0.8)',
      statusBarStyle: 'light-content',
    },
  },
  cloudy: {
    BackgroundComponent: CloudySky,
    backgroundProps: {},
    colors: {
      bgColor: '#545F6B',
      accentColor: '#90CAF9',
      cardBg: '#535F70',
      cardBorder: 'rgba(83, 95, 112, 0.4)',
      stickyHeaderBg: '#535F70',
      textPrimary: '#fff',
      textSecondary: 'rgba(255,255,255,0.7)',
      statusBarStyle: 'light-content',
    },
  },
  rainy: {
    BackgroundComponent: RainySky,
    backgroundProps: { startColor: '#626F84', endColor: '#455363' },
    colors: {
      bgColor: '#2C3E50',
      accentColor: '#64D2FF',
      cardBg: '#52667E',
      cardBorder: '#52667E',
      stickyHeaderBg: '#52667E',
      textPrimary: '#fff',
      textSecondary: 'rgba(255,255,255,0.65)',
      statusBarStyle: 'light-content',
    },
  },
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

export function scenarioForWeatherType(type: WeatherType): WeatherScenario {
  switch (type) {
    case 'clear-night':
    case 'partly-cloudy-night':
    case 'drizzle-night':
      return 'night';
    case 'clear-day':
    case 'partly-cloudy-day':
    case 'sunrise':
    case 'sunset':
      return 'sunny';
    case 'cloudy':
    case 'haze':
    case 'fog':
    case 'windy':
    case 'snow':
    case 'heavy-snow':
    case 'sleet':
      return 'cloudy';
    case 'drizzle':
    case 'rain':
    case 'heavy-rain':
    case 'thunderstorm':
      return 'rainy';
  }
}
