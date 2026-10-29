import { useCallback, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import Flakes from '../components/scratchoff/Flakes';
import ScratchCoating, {
  AREAS,
  PLAY_H,
  PLAY_W,
  type PrizeSymbol,
} from '../components/scratchoff/ScratchCoating';
import { useScratchCard } from '../hooks/useScratchCard';

const PRIZES = ['$5', '$20', '$50', '$500'];

type Ticket = {
  symbols: readonly [PrizeSymbol, PrizeSymbol, PrizeSymbol, PrizeSymbol];
  amounts: string[];
  bonus: string;
  serial: string;
  win: boolean;
};

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function makeTicket(): Ticket {
  const win = Math.random() < 0.6;
  const main = pick<PrizeSymbol>([0, 1, 2, 3]);
  const others = ([0, 1, 2, 3] as PrizeSymbol[]).filter((s) => s !== main);
  const row: PrizeSymbol[] = win
    ? [main, main, main]
    : [main, main, pick(others)].sort(() => Math.random() - 0.5);
  const prize = pick(PRIZES);
  const serial = Array.from({ length: 3 }, () =>
    Math.floor(1000 + Math.random() * 9000)
  ).join(' ');
  return {
    symbols: [row[0]!, row[1]!, row[2]!, pick<PrizeSymbol>([0, 1, 2, 3])],
    amounts: win ? [prize, prize, prize] : row.map(() => pick(PRIZES)),
    bonus: pick(['$2', '$10', '$25']),
    serial,
    win,
  };
}

/**
 * A scratch card.
 *
 * Drag a finger over the silver to scratch it off: the latex tears away
 * along the stroke with flaky edges, crumbs tumble off, and it rasps louder
 * the faster you go. Each prize box clears itself once most of it is
 * scratched, with a sparkle and a haptic tick. Tilt the phone to move the
 * foil's sheen and the holographic symbols' rainbow.
 */
export default function ScratchOffScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scale = (width * 0.92) / CARD_W;
  const { paramsSynchronizable, flakeState, stroke, lift, reset, revealed } =
    useScratchCard();
  const [ticket, setTicket] = useState(makeTicket);

  const newCard = useCallback(() => {
    reset();
    setTicket(makeTicket());
  }, [reset]);

  const scratch = Gesture.Pan()
    .minDistance(0)
    .runOnJS(true)
    .onBegin((e) => stroke(e.x, e.y, true))
    .onUpdate((e) => stroke(e.x, e.y, false))
    .onFinalize(lift);

  const done = revealed >= 3;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.card, { transform: [{ scale }] }]}>
        <View style={styles.frame}>
          <View style={styles.head}>
            <View>
              <Text style={styles.title}>Clover Cash</Text>
              <Text style={styles.subtitle}>
                Match three symbols, win that prize.
              </Text>
            </View>
            <View style={styles.price}>
              <Text style={styles.priceText}>$5</Text>
            </View>
          </View>

          <GestureDetector gesture={scratch}>
            <View style={styles.play}>
              {AREAS.map((a, i) => (
                <View
                  key={i}
                  style={[
                    styles.panel,
                    { left: a.x, top: a.y, width: a.w, height: a.h },
                    i === 3 && styles.bonusPanel,
                  ]}
                >
                  <Text style={i === 3 ? styles.bonusAmount : styles.amount}>
                    {i === 3 ? ticket.bonus : ticket.amounts[i]}
                  </Text>
                </View>
              ))}
              <ScratchCoating
                symbols={ticket.symbols}
                paramsSynchronizable={paramsSynchronizable}
                style={styles.coating}
              />
              <Flakes state={flakeState} />
            </View>
          </GestureDetector>

          <View style={styles.foot}>
            <Text style={styles.fine}>No. {ticket.serial}</Text>
            <Text style={styles.fine}>Void if altered</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.result, !done && styles.hidden]}>
        {ticket.win ? `You won ${ticket.amounts[0]}` : 'Not this time'}
      </Text>

      <Pressable
        onPress={newCard}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { bottom: insets.bottom + 24 },
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>New card</Text>
      </Pressable>

      <View style={[styles.backWrap, { top: insets.top + 6 }]}>
        <BackButton />
      </View>
    </View>
  );
}

const GREEN = '#1d4a37';
const CARD_W = PLAY_W + 44;
const SERIF = 'Georgia';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#14171a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 90,
  },
  card: {
    width: CARD_W,
    borderRadius: 18,
    backgroundColor: '#f2ead8',
    padding: 7,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  frame: {
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 32,
    fontWeight: '700',
    color: GREEN,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontSize: 14,
    color: '#55635a',
    marginTop: 4,
  },
  price: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#b8892b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e2c27a',
  },
  priceText: {
    fontFamily: SERIF,
    fontSize: 20,
    fontWeight: '700',
    color: '#fffaf0',
  },
  play: {
    width: PLAY_W,
    height: PLAY_H,
  },
  panel: {
    position: 'absolute',
    borderRadius: 10,
    backgroundColor: '#fbf7ee',
    borderWidth: 1,
    borderColor: 'rgba(29, 74, 55, 0.25)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  bonusPanel: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 0,
    paddingRight: 26,
  },
  amount: {
    fontFamily: SERIF,
    fontSize: 19,
    fontWeight: '700',
    color: GREEN,
  },
  bonusAmount: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: '700',
    color: GREEN,
  },
  coating: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: PLAY_W,
    height: PLAY_H,
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  fine: {
    fontSize: 10,
    color: '#7b847d',
    letterSpacing: 0.4,
  },
  result: {
    marginTop: 36,
    fontSize: 20,
    fontWeight: '600',
    color: '#f2ead8',
  },
  hidden: {
    opacity: 0,
  },
  button: {
    position: 'absolute',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
});
