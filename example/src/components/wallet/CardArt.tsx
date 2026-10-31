import { StyleSheet, Text, View } from 'react-native';

/** EMV chip: a gold pad with its contact segments. */
function Chip() {
  return (
    <View style={styles.chip}>
      <View style={styles.chipLineH} />
      <View style={[styles.chipLineV, styles.chipLineLeft]} />
      <View style={[styles.chipLineV, styles.chipLineRight]} />
      <View style={styles.chipCore} />
    </View>
  );
}

/** An invented issuer mark: a diamond outline. */
function IssuerMark() {
  return <View style={styles.mark} />;
}

/** Printed and engraved details laid over the metal surface. */
export function CardArt() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Text style={styles.bank}>Quill Reserve</Text>
      <Text style={styles.tier}>Titanium</Text>
      <View style={styles.chipWrap}>
        <Chip />
      </View>
      <Text style={styles.digits}>0000 0000</Text>
      <IssuerMark />
    </View>
  );
}

const styles = StyleSheet.create({
  bank: {
    position: 'absolute',
    left: 22,
    top: 20,
    color: 'rgba(235, 237, 240, 0.86)',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: -0.6 },
    textShadowRadius: 0.4,
  },
  tier: {
    position: 'absolute',
    right: 22,
    top: 24,
    color: 'rgba(220, 224, 230, 0.55)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  chipWrap: {
    position: 'absolute',
    left: 22,
    top: 92,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    width: 46,
    height: 35,
    borderRadius: 7,
    backgroundColor: '#c8b27c',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8a7444',
    overflow: 'hidden',
  },
  chipLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 17,
    height: 1,
    backgroundColor: 'rgba(110, 88, 40, 0.7)',
  },
  chipLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(110, 88, 40, 0.7)',
  },
  chipLineLeft: {
    left: 15,
  },
  chipLineRight: {
    right: 15,
  },
  chipCore: {
    position: 'absolute',
    left: 15,
    top: 10,
    width: 16,
    height: 15,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(110, 88, 40, 0.7)',
    backgroundColor: '#d4bf8c',
  },
  digits: {
    position: 'absolute',
    left: 22,
    bottom: 22,
    color: 'rgba(235, 237, 240, 0.85)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
  },
  mark: {
    position: 'absolute',
    right: 28,
    bottom: 24,
    width: 24,
    height: 24,
    borderWidth: 2.5,
    borderColor: 'rgba(235, 237, 240, 0.8)',
    transform: [{ rotate: '45deg' }],
  },
});
