import { forwardRef, type ComponentRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

/**
 * Photo: "Smiling senior woman with curly hair portrait" by Shixart1985,
 * CC BY 2.0, via Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Smiling_senior_woman_with_curly_hair_portrait.jpg),
 * cropped to the face.
 */
const AVATAR = require('../../../assets/namedrop/avatar.jpg');

export type PosterHandle = ComponentRef<typeof View>;

export type ExchangeChoice = 'share' | 'receive' | null;

type ContactPosterProps = {
  width: number;
  height: number;
  choice: ExchangeChoice;
  onChoose: (choice: 'share' | 'receive') => void;
  onAvatarLoad?: () => void;
};

const GRADIENT_STEPS = 24;
const TOP = [198, 192, 211];
const BOTTOM = [160, 151, 172];

function gradientColor(i: number) {
  const k = i / (GRADIENT_STEPS - 1);
  const [r, g, b] = TOP.map((c, j) => Math.round(c + (BOTTOM[j]! - c) * k));
  return `rgb(${r},${g},${b})`;
}

const GRADIENT = Array.from({ length: GRADIENT_STEPS }, (_, i) =>
  gradientColor(i)
);

/** The "Share Your Contact" screen NameDrop shows full screen. */
const ContactPoster = forwardRef<PosterHandle, ContactPosterProps>(
  function ContactPoster(
    { width, height, choice, onChoose, onAvatarLoad },
    ref
  ) {
    const avatar = Math.round(width * 0.59);
    return (
      <View ref={ref} collapsable={false} style={{ width, height }}>
        <View style={StyleSheet.absoluteFill}>
          {GRADIENT.map((color) => (
            <View
              key={color}
              style={[styles.band, { backgroundColor: color }]}
            />
          ))}
        </View>
        <Text style={[styles.title, { top: height * 0.112 }]}>
          Share Your Contact
        </Text>
        <View
          style={[
            styles.avatarRing,
            {
              top: height * 0.415 - avatar / 2,
              left: (width - avatar) / 2,
              width: avatar,
              height: avatar,
              borderRadius: avatar / 2,
            },
          ]}
        >
          <Image
            source={AVATAR}
            style={styles.avatar}
            resizeMode="cover"
            onLoad={onAvatarLoad}
          />
        </View>
        <View style={[styles.identity, { top: height * 0.665 }]}>
          <Text style={styles.name}>Maren</Text>
          <View style={styles.emailRow}>
            <Text style={styles.email}>maren@holloway.studio</Text>
            <View style={styles.info}>
              <Text style={styles.infoGlyph}>i</Text>
            </View>
          </View>
        </View>
        <View style={[styles.actions, { top: height * 0.862 }]}>
          {choice === null ? (
            <Animated.View
              style={styles.buttons}
              exiting={FadeOut.duration(160)}
            >
              <PillButton
                label="Receive Only"
                onPress={() => onChoose('receive')}
              />
              <PillButton label="Share" onPress={() => onChoose('share')} />
            </Animated.View>
          ) : (
            <Animated.Text
              style={styles.status}
              entering={FadeIn.delay(160).duration(240)}
            >
              {choice === 'share' ? 'Contacts exchanged' : 'Contact received'}
            </Animated.Text>
          )}
        </View>
      </View>
    );
  }
);

export default ContactPoster;

function PillButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    flex: 1,
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  avatarRing: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#f2e6f0',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  identity: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  name: {
    color: '#fff',
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  emailRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  email: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  info: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyph: {
    color: '#a79fb5',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 50,
    alignSelf: 'stretch',
  },
  button: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: '#e6e3ec',
  },
  buttonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '500',
  },
  status: {
    height: 52,
    lineHeight: 52,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
