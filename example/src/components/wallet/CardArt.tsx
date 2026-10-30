import { StyleSheet, Text, View } from 'react-native';

import { CARD_RADIUS } from './CardSurface';

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

/** The contactless mark: four nested arcs opening to the right. */
function Contactless() {
  return (
    <View style={styles.waves}>
      {[8, 14, 20, 26].map((size) => (
        <View
          key={size}
          style={[
            styles.wave,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size / 2,
              marginTop: -size / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Two overlapping discs with the orange lens where they meet. */
function Network() {
  return (
    <View style={styles.network}>
      <View style={[styles.disc, styles.discRed]} />
      <View style={[styles.disc, styles.discYellow]}>
        <View style={[styles.disc, styles.lens]} />
      </View>
    </View>
  );
}

/** Printed and engraved details laid over the metal surface. */
export function CardArt() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Text style={styles.bank}>Neobank</Text>
      <Text style={styles.tier}>Titanium</Text>
      <View style={styles.chipWrap}>
        <Chip />
        <Contactless />
      </View>
      <Text style={styles.digits}>•••• 1834</Text>
      <Network />
    </View>
  );
}

export type StackCardSpec = {
  name: string;
  color: string;
  ink: string;
  mark: string;
};

/** A card waiting in the stack: only its top edge and name show. */
export function StackCard({
  spec,
  top,
  width,
  height,
}: {
  spec: StackCardSpec;
  top: number;
  width: number;
  height: number;
}) {
  return (
    <View
      style={[
        styles.stackCard,
        { top, width, height, backgroundColor: spec.color },
      ]}
    >
      <View style={styles.stackSheen} />
      <Text style={[styles.stackName, { color: spec.ink }]}>{spec.name}</Text>
      <Text style={[styles.stackMark, { color: spec.ink }]}>{spec.mark}</Text>
    </View>
  );
}

const LENS = 34 - 13;

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
  waves: {
    width: 20,
    height: 30,
    marginLeft: 16,
    overflow: 'hidden',
  },
  wave: {
    position: 'absolute',
    left: 0,
    top: 15,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRightColor: 'rgba(225, 228, 232, 0.7)',
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
  network: {
    position: 'absolute',
    right: 20,
    bottom: 18,
    width: 34 * 2 - 13,
    height: 34,
  },
  disc: {
    position: 'absolute',
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  discRed: {
    left: 0,
    backgroundColor: '#eb001b',
  },
  discYellow: {
    left: LENS,
    backgroundColor: '#f79e1b',
  },
  lens: {
    left: -LENS,
    backgroundColor: '#ff5f00',
  },
  stackCard: {
    position: 'absolute',
    left: 0,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
  },
  stackSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  stackName: {
    position: 'absolute',
    left: 18,
    top: 12,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  stackMark: {
    position: 'absolute',
    right: 18,
    top: 11,
    fontSize: 16,
    fontWeight: '800',
    fontStyle: 'italic',
  },
});
