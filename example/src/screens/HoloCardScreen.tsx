import { View, Text, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { Aurora, LiquidChrome, Iridescence } from 'react-native-effects';
import { BackButton } from '../components/BackButton';

const CARDS = [
  {
    id: 'revolut',
    name: 'REVOLUT',
    number: '•••• •••• •••• 7291',
    holder: 'ALEX MORGAN',
    expiry: '09/28',
    effect: 'aurora' as const,
    darkText: false,
  },
  {
    id: 'monzo',
    name: 'MONZO',
    number: '•••• •••• •••• 4242',
    holder: 'JAMIE CHEN',
    expiry: '03/27',
    effect: 'iridescence' as const,
    darkText: false,
  },
  {
    id: 'neobank',
    name: 'NEOBANK',
    number: '•••• •••• •••• 1834',
    holder: 'SAM TAYLOR',
    expiry: '12/29',
    effect: 'chrome' as const,
    darkText: true,
  },
];

function CardEffect({
  effect,
}: {
  effect: 'aurora' | 'iridescence' | 'chrome';
}) {
  switch (effect) {
    case 'aurora':
      return (
        <Aurora
          color="#4ade80"
          speed={0.8}
          intensity={1.2}
          layers={4}
          waviness={1.2}
          style={StyleSheet.absoluteFill}
        />
      );
    case 'iridescence':
      return (
        <Iridescence
          color="#e5254e"
          speed={0.6}
          style={StyleSheet.absoluteFill}
        />
      );
    case 'chrome':
      return (
        <LiquidChrome
          color="#2a2a2a"
          speed={0.15}
          amplitude={0.4}
          frequencyX={4}
          frequencyY={3}
          style={StyleSheet.absoluteFill}
        />
      );
  }
}

export default function HoloCardScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Holographic Cards</Text>
        <Text style={styles.subtitle}>
          Each card uses a different shader effect
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {CARDS.map((card) => {
          const dark = card.darkText;
          return (
            <View key={card.id} style={styles.cardContainer}>
              <CardEffect effect={card.effect} />
              <View style={styles.cardOverlay} pointerEvents="none">
                <View style={styles.cardTop}>
                  <View style={[styles.chip, dark && styles.chipDark]}>
                    <View
                      style={[styles.chipInner, dark && styles.chipInnerDark]}
                    />
                  </View>
                  <View style={styles.contactless}>
                    <View style={[styles.arc1, dark && styles.arcDark]} />
                    <View style={[styles.arc2, dark && styles.arcDark]} />
                    <View style={[styles.arc3, dark && styles.arcDark]} />
                  </View>
                </View>
                <Text style={[styles.cardName, dark && styles.textDark]}>
                  {card.name}
                </Text>
                <Text style={[styles.cardNumber, dark && styles.textDark]}>
                  {card.number}
                </Text>
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={[styles.cardLabel, dark && styles.labelDark]}>
                      CARD HOLDER
                    </Text>
                    <Text style={[styles.cardHolder, dark && styles.textDark]}>
                      {card.holder}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.cardLabel, dark && styles.labelDark]}>
                      EXPIRES
                    </Text>
                    <Text style={[styles.cardExpiry, dark && styles.textDark]}>
                      {card.expiry}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingTop: 54,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    fontWeight: '400',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  cardContainer: {
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  cardOverlay: {
    ...StyleSheet.absoluteFill,
    padding: 24,
    justifyContent: 'space-between',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chip: {
    width: 44,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipInner: {
    width: 28,
    height: 20,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(180, 140, 20, 0.6)',
  },
  contactless: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arc1: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  arc2: {
    position: 'absolute',
    width: 17,
    height: 17,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  arc3: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
    letterSpacing: 2,
  },
  cardNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardHolder: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 1,
  },
  cardExpiry: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 1,
  },
  // Dark text overrides for light backgrounds
  textDark: {
    color: 'rgba(0, 0, 0, 0.85)',
  },
  labelDark: {
    color: 'rgba(0, 0, 0, 0.5)',
  },
  chipDark: {
    backgroundColor: 'rgba(180, 150, 30, 0.9)',
  },
  chipInnerDark: {
    borderColor: 'rgba(140, 110, 10, 0.7)',
  },
  arcDark: {
    borderColor: 'rgba(0, 0, 0, 0.5)',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
