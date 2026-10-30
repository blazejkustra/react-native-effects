import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, SCREEN_MARGIN, type } from '../../catalog/theme';
import type { Effect } from '../../catalog/effects';
import { Chevron } from './Glyphs';
import { PressableScale } from './PressableScale';

type EffectRowProps = {
  effect: Effect;
  onOpen: (effect: Effect) => void;
  showSeparator?: boolean;
};

export const EffectRow = memo(function EffectRow({
  effect,
  onOpen,
  showSeparator = false,
}: EffectRowProps) {
  return (
    <PressableScale
      onPress={() => onOpen(effect)}
      accessibilityLabel={effect.title}
      accessibilityHint={effect.line}
      style={styles.row}
    >
      <Image source={effect.image} style={styles.thumbnail} />
      <View style={[styles.body, showSeparator && styles.separator]}>
        <View style={styles.text}>
          <Text style={type.captionTitle} numberOfLines={2}>
            {effect.title}
          </Text>
          <Text style={type.captionLine} numberOfLines={3}>
            {effect.line}
          </Text>
        </View>
        <Chevron />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingLeft: SCREEN_MARGIN,
  },
  thumbnail: {
    width: 58,
    height: 84,
    marginVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 14,
    paddingRight: SCREEN_MARGIN,
    paddingVertical: 8,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  text: {
    flex: 1,
    paddingRight: 12,
  },
});
