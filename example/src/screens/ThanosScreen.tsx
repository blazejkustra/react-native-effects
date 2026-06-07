import { useCallback, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import { DISSOLVES } from '../components/dissolves';
import { BackButton } from '../components/BackButton';

const SNAP_MS = 1700;
const REFORM_MS = 900;

export default function ThanosScreen() {
  const insets = useSafeAreaInsets();
  const [gone, setGone] = useState(false);
  const [mode, setMode] = useState(0);
  const Active = DISSOLVES[mode]!.Component;

  // Dissolve progress, 0 (intact) → 1 (gone), driven by Reanimated.
  const progress = useSharedValue(0);

  // Bridge the Reanimated value into the shader: write params1.x every frame on
  // the UI thread, so the off-thread render loop reads a smooth progress.
  const { paramsSynchronizable } = useParamsSynchronizable([0, 0, 0, 0]);
  useAnimatedReaction(
    () => progress.value,
    (p) => {
      'worklet';
      paramsSynchronizable.setBlocking(() => Float64Array.of(p, 0, 0, 0));
    }
  );

  // The card chrome (text/chip) fades out over the first part of the dissolve.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.value * 2.2),
  }));

  const reset = useCallback(() => {
    setGone(false);
    progress.value = withTiming(0, {
      duration: REFORM_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [progress]);

  // Pick a style: show the (re)formed card so you can preview the variant. It
  // only disintegrates when you snap.
  const selectMode = useCallback(
    (m: number) => {
      setMode(m);
      reset();
    },
    [reset]
  );

  // Snap the current card into dust: reform first (in case it's mid-state) then
  // dissolve.
  const snap = useCallback(() => {
    setGone(true);
    progress.value = withSequence(
      withTiming(0, { duration: 180 }),
      withTiming(1, { duration: SNAP_MS, easing: Easing.out(Easing.cubic) })
    );
  }, [progress]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <View style={styles.center}>
        <View style={styles.cardWrap}>
          {/* The disintegration is the shader — procedural card + in-shader
              dissolve. Swapping `Active` swaps the WGSL variant. */}
          <Active
            paramsSynchronizable={paramsSynchronizable}
            style={StyleSheet.absoluteFill}
          />

          {/* Tap target + card chrome on top, fading as the card dissolves. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={snap}
            disabled={gone}
          >
            <Animated.View
              style={[styles.overlay, overlayStyle]}
              pointerEvents="none"
            >
              <View style={styles.cardTopRow}>
                <View style={styles.chip} />
                <Text style={styles.brandMark}>WebGPU</Text>
              </View>

              <Text style={styles.cardTitle}>react-native-effects</Text>
              <Text style={styles.cardNumber}>0451 · SHADER · WORKLET</Text>

              <View style={styles.cardBottomRow}>
                <View>
                  <Text style={styles.cardLabel}>STATUS</Text>
                  <Text style={styles.cardValue}>RENDERED</Text>
                </View>
                <Text style={styles.snapHint}>tap to snap ✦</Text>
              </View>
            </Animated.View>
          </Pressable>
        </View>

        {/* Style picker — tap to preview each disintegration shader. */}
        <View style={styles.pills}>
          {DISSOLVES.map((d, i) => {
            const selected = i === mode;
            return (
              <Pressable
                key={d.key}
                style={[styles.pill, selected && styles.pillOn]}
                onPress={() => selectMode(i)}
              >
                <Text style={[styles.pillText, selected && styles.pillTextOn]}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable style={styles.actionBtn} onPress={gone ? reset : snap}>
          <Text style={styles.actionText}>
            {gone ? '↺  Restore' : 'Snap  ✦'}
          </Text>
        </Pressable>
      </View>

      <View
        style={[styles.backWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08070c',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
  cardWrap: {
    width: '100%',
    aspectRatio: 1.586,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 36,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    padding: 22,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    width: 44,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 175, 55, 0.85)',
  },
  brandMark: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cardNumber: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 3,
  },
  cardValue: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  snapHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 26,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillOn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  pillTextOn: {
    color: '#fff',
  },
  actionBtn: {
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
