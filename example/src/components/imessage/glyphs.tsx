import { StyleSheet, View } from 'react-native';

const WHITE = '#fff';

export function Chevron({
  color = WHITE,
  size = 13,
  direction = 'left',
}: {
  color?: string;
  size?: number;
  direction?: 'left' | 'right';
}) {
  return (
    <View
      style={[
        styles.chevron,
        {
          width: size,
          height: size,
          borderColor: color,
          transform: [{ rotate: direction === 'left' ? '45deg' : '225deg' }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  chevron: {
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
  },
});
