import { StyleSheet, Text, View } from 'react-native';

// Messages' chrome glyphs drawn from plain views so they stay crisp at any
// scale without an icon font: chevron, video camera, plus, microphone, lock.

const WHITE = '#fff';

export function Chevron({
  color = WHITE,
  size = 13,
  direction = 'left',
}: {
  color?: string;
  size?: number;
  direction?: 'left' | 'right';
}) {
  return (
    <View
      style={[
        styles.chevron,
        {
          width: size,
          height: size,
          borderColor: color,
          transform: [{ rotate: direction === 'left' ? '45deg' : '225deg' }],
        },
      ]}
    />
  );
}

export function VideoCamera({ color = WHITE }: { color?: string }) {
  return (
    <View style={styles.camera}>
      <View style={[styles.cameraBody, { borderColor: color }]} />
      <View style={[styles.cameraLens, { borderColor: color }]} />
    </View>
  );
}

export function Plus({ color = WHITE }: { color?: string }) {
  return <Text style={[styles.plus, { color }]}>+</Text>;
}

export function Microphone({ color = WHITE }: { color?: string }) {
  return (
    <View style={styles.mic}>
      <View style={[styles.micCapsule, { borderColor: color }]} />
      <View style={[styles.micArc, { borderColor: color }]} />
      <View style={[styles.micStem, { backgroundColor: color }]} />
      <View style={[styles.micFoot, { backgroundColor: color }]} />
    </View>
  );
}

export function Lock({ color = WHITE }: { color?: string }) {
  return (
    <View style={styles.lock}>
      <View style={[styles.lockShackle, { borderColor: color }]} />
      <View style={[styles.lockBody, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chevron: {
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
  },
  camera: {
    width: 26,
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cameraBody: {
    width: 18,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
  },
  cameraLens: {
    width: 8,
    height: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
    marginLeft: -3,
    transform: [{ rotate: '45deg' }],
  },
  plus: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
    marginTop: -1,
  },
  mic: {
    width: 14,
    height: 22,
    alignItems: 'center',
  },
  micCapsule: {
    width: 8,
    height: 13,
    borderRadius: 4,
    borderWidth: 2,
  },
  micArc: {
    position: 'absolute',
    top: 6,
    width: 14,
    height: 11,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
  },
  micStem: {
    position: 'absolute',
    top: 17,
    width: 2,
    height: 4,
  },
  micFoot: {
    position: 'absolute',
    top: 20,
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  lock: {
    width: 10,
    height: 12,
    alignItems: 'center',
  },
  lockShackle: {
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  lockBody: {
    width: 10,
    height: 7,
    borderRadius: 2,
    marginTop: -1,
  },
});
