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

export function MicGlyph() {
  return (
    <View style={styles.micBox}>
      <View style={styles.micHead} />
      <View style={styles.micCradle} />
      <View style={styles.micStand} />
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
  micBox: {
    alignItems: 'center',
  },
  micHead: {
    width: 10,
    height: 17,
    borderRadius: 5,
    backgroundColor: colors.text,
  },
  micCradle: {
    width: 18,
    height: 10,
    marginTop: -5,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: colors.text,
  },
  micStand: {
    width: 2,
    height: 5,
    backgroundColor: colors.text,
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
