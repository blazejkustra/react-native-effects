import { forwardRef, type ComponentRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

/**
 * Photo: "Smiling senior woman with curly hair portrait" by Shixart1985,
 * CC BY 2.0, via Wikimedia Commons
 * (https://commons.wikimedia.org/wiki/File:Smiling_senior_woman_with_curly_hair_portrait.jpg),
 * cropped to the face.
 */
const AVATAR = require('../../../assets/wave/avatar.jpg');

export type PosterHandle = ComponentRef<typeof View>;

type ContactPosterProps = {
  width: number;
  height: number;
  onAvatarLoad?: () => void;
};

const GRADIENT_STEPS = 24;
const TOP = [28, 96, 104];
const BOTTOM = [14, 44, 62];

function gradientColor(i: number) {
  const k = i / (GRADIENT_STEPS - 1);
  const [r, g, b] = TOP.map((c, j) => Math.round(c + (BOTTOM[j]! - c) * k));
  return `rgb(${r},${g},${b})`;
}

const GRADIENT = Array.from({ length: GRADIENT_STEPS }, (_, i) =>
  gradientColor(i)
);

/** The full-screen poster the wave reveals. */
const ContactPoster = forwardRef<PosterHandle, ContactPosterProps>(
  function ContactPoster({ width, height, onAvatarLoad }, ref) {
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
          <Text style={styles.hint}>Tap to replay the wave</Text>
        </View>
      </View>
    );
  }
);

export default ContactPoster;

const styles = StyleSheet.create({
  band: {
    flex: 1,
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
  hint: {
    marginTop: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
});
