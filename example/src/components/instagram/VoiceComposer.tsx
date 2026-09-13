import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';
import SmokePoof from './SmokePoof';
import { IG_BAR, IG_BLUE, IG_ICONS, IG_MUTED, IG_RED } from './icons';

// Timings measured off the Instagram recording (60 fps frames).
const EXPAND_MS = 320; // mic tap → full blue bar
const COLLAPSE_MS = 130; // trash tap → bar sucked into the trash button
const HOLD_MS = 300; // red trash button sits still before it pops
const POOF_MS = 700; // smoke burst → wisps gone
const BAR_EVERY_MS = 90; // one new waveform bar per tick
const BAR_STEP = 5; // 2pt bar + 3pt gap

const BAR_H = 44;
const BTN = 36;
const PAD = 4;
const SMOKE = 130; // smoke canvas size, centred on the trash button

function Icon({
  source,
  size,
  color = '#fff',
}: {
  source: number;
  size: number;
  color?: string;
}) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}

type Phase = 'idle' | 'recording' | 'deleting';

/**
 * Instagram DM composer with the voice-message flow: tap the mic and a blue bar
 * swells out of the camera button and starts drawing a waveform; tap the trash
 * and the bar is sucked back into the button, which turns red, holds, and
 * bursts into a puff of smoke that clears to reveal the camera again.
 */
export default function VoiceComposer() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [bars, setBars] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [width, setWidth] = useState(0);
  const lastTall = useRef(false);

  // 0 → 1 as the blue bar expands out of the camera button.
  const rec = useSharedValue(0);
  // 0 → 1 as the bar collapses back into the (now red) trash button.
  const del = useSharedValue(0);
  // 0 → 1 smoke burst; also fades the red button out underneath it.
  const poof = useSharedValue(0);
  const seed = useSharedValue(0);

  // Bridge the poof curve into the shader every frame on the UI thread.
  const { paramsSynchronizable } = useParamsSynchronizable([0, 0, 0, 0]);
  useAnimatedReaction(
    () => [poof.value, seed.value] as const,
    ([p, s]) => {
      'worklet';
      paramsSynchronizable.setBlocking(() => Float64Array.of(p, s, 0, 0));
    }
  );

  // Waveform + clock tick while recording.
  useEffect(() => {
    if (phase !== 'recording') {
      return;
    }
    const waveArea = width - (PAD + BTN + 10) - (10 + 44 + BTN + PAD);
    const maxBars = Math.max(1, Math.floor(waveArea / BAR_STEP));
    const wave = setInterval(() => {
      // Bursty amplitude: tall bars tend to come in runs, like speech.
      const tall = Math.random() < (lastTall.current ? 0.55 : 0.22);
      lastTall.current = tall;
      const h = tall ? 10 + Math.random() * 14 : 4 + Math.random() * 3;
      setBars((prev) => [...prev.slice(-(maxBars - 1)), h]);
    }, BAR_EVERY_MS);
    const clock = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => {
      clearInterval(wave);
      clearInterval(clock);
    };
  }, [phase, width]);

  const startRecording = useCallback(() => {
    if (phase !== 'idle') {
      return;
    }
    setBars([]);
    setElapsed(0);
    setPhase('recording');
    rec.value = withTiming(1, {
      duration: EXPAND_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [phase, rec]);

  const finish = useCallback(() => {
    setPhase('idle');
    setBars([]);
    setElapsed(0);
    rec.value = 0;
    del.value = 0;
    poof.value = 0;
  }, [rec, del, poof]);

  const send = useCallback(() => {
    if (phase !== 'recording') {
      return;
    }
    setPhase('deleting');
    rec.value = withTiming(
      0,
      { duration: 260, easing: Easing.inOut(Easing.cubic) },
      (done) => {
        if (done) {
          runOnJS(finish)();
        }
      }
    );
  }, [phase, rec, finish]);

  const discard = useCallback(() => {
    if (phase !== 'recording') {
      return;
    }
    setPhase('deleting');
    seed.value = Math.random();
    del.value = withTiming(1, {
      duration: COLLAPSE_MS,
      easing: Easing.out(Easing.cubic),
    });
    poof.value = withDelay(
      COLLAPSE_MS + HOLD_MS,
      withTiming(1, { duration: POOF_MS, easing: Easing.linear }, (done) => {
        if (done) {
          runOnJS(finish)();
        }
      })
    );
  }, [phase, del, poof, seed, finish]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  // --- animated styles -----------------------------------------------------

  // The blue pill grows out of the camera circle, then shrinks back into it.
  const pillStyle = useAnimatedStyle(() => {
    const open = rec.value * (1 - del.value);
    const w = interpolate(open, [0, 1], [BTN + PAD * 2, Math.max(width, 1)]);
    return {
      width: w,
      opacity: rec.value * (1 - interpolate(del.value, [0.85, 1], [0, 1])),
    };
  });

  // Trash button: white while recording, red + 1.2× while deleting, then gone.
  const trashStyle = useAnimatedStyle(() => {
    const scale = interpolate(del.value, [0, 1], [1, 1.2]);
    const gone = interpolate(poof.value, [0.12, 0.42], [0, 1], 'clamp');
    return {
      backgroundColor: interpolateColor(del.value, [0, 1], ['#F8F8F8', IG_RED]),
      transform: [{ scale: scale * (1 - 0.15 * gone) }],
      opacity: interpolate(rec.value, [0, 0.4], [0, 1], 'clamp') * (1 - gone),
    };
  });
  const trashGreyIcon = useAnimatedStyle(() => ({
    opacity: 1 - del.value,
  }));
  const trashWhiteIcon = useAnimatedStyle(() => ({
    opacity: del.value,
  }));

  // Waveform, clock and send button live inside the pill: they fade in once
  // the bar is mostly open and vanish the instant a delete starts.
  const contentStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(rec.value, [0.6, 1], [0, 1], 'clamp') * (1 - del.value),
  }));
  const timerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(rec.value, [0.6, 1], [0, 1], 'clamp'),
  }));
  const sendStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(rec.value, [0.85, 1], [0, 1], 'clamp') *
      (1 - interpolate(del.value, [0, 0.15], [0, 1], 'clamp')),
    transform: [
      { scale: interpolate(rec.value, [0.85, 1], [0.6, 1], 'clamp') },
    ],
  }));

  const clock = `${Math.floor(elapsed / 60)}:${elapsed % 60 < 10 ? '0' : ''}${
    elapsed % 60
  }`;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {/* Idle composer — always mounted; the pill slides over it. */}
      <View style={styles.composer}>
        <View style={[styles.circle, { backgroundColor: IG_BLUE }]}>
          <Icon source={IG_ICONS.camera} size={26} />
        </View>
        <Text style={styles.placeholder}>Message...</Text>
        <Pressable
          style={styles.composerIcon}
          onPress={startRecording}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voice message"
        >
          <Icon source={IG_ICONS.mic} size={24} />
        </Pressable>
        <View style={styles.composerIcon}>
          <Icon source={IG_ICONS.image} size={24} />
        </View>
        <View style={styles.composerIcon}>
          <Icon source={IG_ICONS.sticker} size={24} />
        </View>
        <View style={styles.composerIcon}>
          <Icon source={IG_ICONS.plus} size={24} />
        </View>
      </View>

      {/* Recording pill */}
      <Animated.View
        style={[styles.pill, pillStyle]}
        pointerEvents={phase === 'recording' ? 'auto' : 'none'}
      >
        <Animated.View style={[styles.waveRow, contentStyle]}>
          {bars.map((h, i) => (
            <Animated.View
              key={i}
              entering={FadeIn.duration(120)}
              style={[styles.waveBar, { height: h }]}
            />
          ))}
        </Animated.View>
        <Animated.Text style={[styles.timer, timerStyle]}>
          {clock}
        </Animated.Text>
        <Animated.View style={[styles.sendWrap, sendStyle]}>
          <Pressable
            style={[styles.circle, styles.white]}
            onPress={send}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Icon source={IG_ICONS.send} size={22} color={IG_BLUE} />
          </Pressable>
        </Animated.View>
      </Animated.View>

      {/* Trash button — outside the pill so it can pop past its bounds. */}
      <Animated.View
        style={[styles.trash, trashStyle]}
        pointerEvents={phase === 'recording' ? 'auto' : 'none'}
      >
        <Pressable
          style={styles.fill}
          onPress={discard}
          accessibilityRole="button"
          accessibilityLabel="Delete"
        >
          <Animated.View style={[styles.fill, trashGreyIcon]}>
            <Icon source={IG_ICONS.trash} size={22} color="#8F96A8" />
          </Animated.View>
          <Animated.View style={[styles.abs, trashWhiteIcon]}>
            <Icon source={IG_ICONS.trash} size={22} />
          </Animated.View>
        </Pressable>
      </Animated.View>

      <SmokePoof
        paramsSynchronizable={paramsSynchronizable}
        style={styles.smoke}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: BAR_H,
  },
  composer: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: IG_BAR,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: PAD,
    paddingRight: 8,
  },
  circle: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  white: {
    backgroundColor: '#F8F8F8',
  },
  placeholder: {
    flex: 1,
    marginLeft: 11,
    color: IG_MUTED,
    fontSize: 16,
  },
  composerIcon: {
    width: 39,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: IG_BLUE,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: PAD + BTN + 10,
    paddingRight: PAD,
  },
  waveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    overflow: 'hidden',
  },
  waveBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },
  timer: {
    flexShrink: 0,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
    marginRight: 10,
    fontVariant: ['tabular-nums'],
  },
  sendWrap: {
    flexShrink: 0,
    width: BTN,
    height: BTN,
  },
  trash: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abs: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smoke: {
    position: 'absolute',
    width: SMOKE,
    height: SMOKE,
    left: PAD + BTN / 2 - SMOKE / 2,
    top: PAD + BTN / 2 - SMOKE / 2,
  },
});
