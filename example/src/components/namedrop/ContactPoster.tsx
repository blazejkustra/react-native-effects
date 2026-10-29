import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

/**
 * Photo: "Smiling senior woman with curly hair portrait" by Shixart1985,
 * CC BY 2.0, via Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Smiling_senior_woman_with_curly_hair_portrait.jpg).
 */
const PORTRAIT = require('../../../assets/namedrop/portrait.jpg');

export type ExchangeChoice = 'share' | 'receive' | null;

type ContactPosterProps = {
  width: number;
  height: number;
  choice: ExchangeChoice;
  onChoose: (choice: 'share' | 'receive') => void;
};

const SHADE_STEPS = Array.from(
  { length: 14 },
  (_, i) => 0.6 * ((i + 1) / 14) ** 1.6
);

/** The other person's Contact Poster as NameDrop presents it. */
export default function ContactPoster({
  width,
  height,
  choice,
  onChoose,
}: ContactPosterProps) {
  return (
    <View style={[styles.card, { width, height }]}>
      <Image source={PORTRAIT} style={styles.photo} resizeMode="cover" />
      <View style={styles.shade} pointerEvents="none">
        {SHADE_STEPS.map((alpha) => (
          <View
            key={alpha}
            style={[
              styles.shadeStep,
              { backgroundColor: `rgba(0,0,0,${alpha})` },
            ]}
          />
        ))}
      </View>
      <View style={styles.bottom}>
        <Text style={styles.name}>Maren</Text>
        <Text style={styles.name}>Holloway</Text>
        <Text style={styles.number}>(415) 555-0142</Text>
        {choice === null ? (
          <Animated.View style={styles.buttons} exiting={FadeOut.duration(160)}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
              onPress={() => onChoose('receive')}
            >
              <Text style={styles.buttonText}>Receive Only</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
              onPress={() => onChoose('share')}
            >
              <Text style={styles.buttonText}>Share</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View
            style={styles.status}
            entering={FadeIn.delay(180).duration(260)}
          >
            <Text style={styles.statusText}>
              {choice === 'share' ? 'Contacts exchanged' : 'Contact received'}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: '#1b1b1d',
  },
  photo: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '46%',
  },
  shadeStep: {
    flex: 1,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 26,
    alignItems: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 58,
    lineHeight: 60,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  number: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 17,
    fontWeight: '500',
  },
  buttons: {
    marginTop: 26,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 22,
    alignSelf: 'stretch',
  },
  button: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: 'rgba(225,225,230,0.94)',
  },
  buttonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '600',
  },
  status: {
    marginTop: 26,
    height: 52,
    justifyContent: 'center',
  },
  statusText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 17,
    fontWeight: '600',
  },
});
