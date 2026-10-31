import { View, Text, StyleSheet, StatusBar, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora, LiquidChrome, Iridescence } from 'react-native-effects';

const CARDS = [
  {
    id: 'moss-ember',
    name: 'MOSS & EMBER',
    number: '0000 0000 0000 0000',
    holder: 'SAMPLE CARD',
    expiry: '00/00',
    effect: 'aurora' as const,
    darkText: false,
  },
  {
    id: 'tidewater',
    name: 'TIDEWATER MINT',
    number: '1234 5678 9012 3456',
    holder: 'SAMPLE CARD',
    expiry: '00/00',
    effect: 'iridescence' as const,
    darkText: false,
  },
  {
    id: 'quill',
    name: 'QUILL RESERVE',
    number: '0123 4567 8901 2345',
    holder: 'SAMPLE CARD',
    expiry: '00/00',
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
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Cards</Text>
        <Text style={styles.subtitle}>
          Each card catches the light its own way
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
});
