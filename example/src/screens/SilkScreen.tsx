import { useCallback, useRef, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Silk } from 'react-native-effects';

const FADE_MS = 600;

export default function SilkScreen() {
  const insets = useSafeAreaInsets();
  // Changing the key remounts Silk, so the fade-in can be watched again.
  const [mountKey, setMountKey] = useState(0);
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const mountedAt = useRef(Date.now());
  const opacity = useSharedValue(0);

  // Fade in on the first presented frame, not on mount: WebGPU setup is
  // async, so a fade started on mount can finish over a blank canvas.
  const onFirstFrame = useCallback(() => {
    setFirstFrameMs((ms) => ms ?? Date.now() - mountedAt.current);
    opacity.set(withTiming(1, { duration: FADE_MS }));
  }, [opacity]);

  const replay = () => {
    opacity.set(0);
    mountedAt.current = Date.now();
    setFirstFrameMs(null);
    setMountKey((k) => k + 1);
  };

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>
        <Silk
          key={mountKey}
          style={StyleSheet.absoluteFill}
          onFirstFrame={onFirstFrame}
        />
      </Animated.View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>
          {firstFrameMs === null
            ? 'Waiting for the first frame…'
            : `First frame after ${firstFrameMs} ms`}
        </Text>
        <Pressable style={styles.button} onPress={replay}>
          <Text style={styles.buttonText}>Replay fade-in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 12,
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
