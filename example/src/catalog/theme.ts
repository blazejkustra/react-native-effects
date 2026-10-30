import { StyleSheet } from 'react-native';

export const colors = {
  background: '#000',
  sheet: '#121212',
  surface: '#161616',
  text: '#fff',
  secondary: 'rgba(235, 235, 245, 0.62)',
  tertiary: 'rgba(235, 235, 245, 0.32)',
  separator: 'rgba(235, 235, 245, 0.16)',
};

export const SERIF = 'ui-serif';

export const SCREEN_MARGIN = 20;

export const scrims = StyleSheet.create({
  bottom: {
    experimental_backgroundImage:
      'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 100%)',
  },
  top: {
    experimental_backgroundImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
  },
});

export const type = StyleSheet.create({
  overlayTitle: {
    fontFamily: SERIF,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  overlayLine: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 19,
    color: 'rgba(255, 255, 255, 0.82)',
  },
  captionTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  captionLine: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 19,
    color: colors.secondary,
  },
});
