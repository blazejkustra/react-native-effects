import { StyleSheet, View } from 'react-native';
import { colors } from '../../catalog/theme';

export function SearchGlyph() {
  return (
    <View style={styles.searchBox}>
      <View style={styles.searchRing} />
      <View style={styles.searchHandle} />
    </View>
  );
}

export function Chevron() {
  return <View style={styles.chevron} />;
}

const styles = StyleSheet.create({
  searchBox: {
    width: 18,
    height: 18,
  },
  searchRing: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: colors.text,
  },
  searchHandle: {
    position: 'absolute',
    right: 0,
    bottom: 2.5,
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text,
    transform: [{ rotate: '45deg' }],
  },
  chevron: {
    width: 8,
    height: 8,
    borderTopWidth: 1.75,
    borderRightWidth: 1.75,
    borderColor: colors.tertiary,
    transform: [{ rotate: '45deg' }],
  },
});
