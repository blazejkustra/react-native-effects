import { StyleSheet, Text, View } from 'react-native';
import { scrims, type } from '../../catalog/theme';
import type { Effect } from '../../catalog/effects';

type OverlayCaptionProps = {
  effect: Effect;
  showLine?: boolean;
};

export function OverlayCaption({
  effect,
  showLine = false,
}: OverlayCaptionProps) {
  return (
    <View style={[styles.container, scrims.bottom]}>
      <Text
        style={type.overlayTitle}
        numberOfLines={1}
        maxFontSizeMultiplier={1.5}
      >
        {effect.title}
      </Text>
      {showLine && (
        <Text
          style={type.overlayLine}
          numberOfLines={2}
          maxFontSizeMultiplier={1.5}
        >
          {effect.line}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 44,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
});
