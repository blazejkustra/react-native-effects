import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Hourglass from '../components/hourglass/Hourglass';
import {
  DURATIONS_MIN,
  useHourglassPhysics,
} from '../hooks/useHourglassPhysics';

/**
 * Photo: "Wooden hourglass 3" by User:S Sepp, CC BY-SA 3.0, via Wikimedia
 * Commons (https://commons.wikimedia.org/wiki/File:Wooden_hourglass_3.jpg).
 * Built into a three-panel atlas by `assets/hourglass/tools/build-atlas.sh`:
 * the photo with its sand painted out, the photo as shot (the shader samples
 * its sand pile as the grain texture), and the bulb masks.
 */
const ATLAS = require('../../assets/hourglass/hourglass-atlas.jpg');
const PANEL_W = 967;
const PANEL_H = 2102;
/** The neck's centre, canvas px. */
const NECK = { x: 487, y: 1072 };
/**
 * A rectangle of the photo's upper sand body, canvas px: the grain texture.
 * It is the flattest-lit sand in the photo (the lower pile's flanks carry the
 * cone's shading, which tiled into visible bands).
 */
const GRAIN = { x: 400, y: 760, w: 180, h: 140 };
/**
 * Where the wooden cap and base sit on the canvas, as fractions of its height:
 * the timer sits on the cap, the duration chips on the base.
 */
const CAP = { top: 0.088, height: 0.082 };
const BASE = { top: 0.842, height: 0.09 };

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
}

/**
 * An hourglass that is a Pomodoro timer.
 *
 * A photograph of a wooden hourglass; the sand in it is drawn from the time
 * left. Tilt the phone and the sand tilts with real gravity, holding its
 * slope. Turn the phone over and the glass turns over with it: the full bulb
 * is on top again and the timer starts over. Tap the glass to pause.
 */
export default function HourglassScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { paramsSynchronizable, setDuration, togglePause, getState } =
    useHourglassPhysics();

  const [label, setLabel] = useState('25:00');
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [minutes, setMinutes] = useState<number>(25);

  // The sim lives in a ref and ticks at 60 Hz; the label only changes once a
  // second, so poll it rather than re-render per frame.
  useEffect(() => {
    const id = setInterval(() => {
      const s = getState();
      setLabel(s.done ? 'Done' : formatTime(s.remainingS));
      setPaused(s.paused);
      setDone(s.done);
      setFlipped(s.flipped);
      setMinutes(Math.round(s.totalS / 60));
    }, 250);
    return () => clearInterval(id);
  }, [getState]);

  const onPick = useCallback(
    (m: number) => {
      setDuration(m);
      setMinutes(m);
      setLabel(formatTime(m * 60));
    },
    [setDuration]
  );

  // The phone is upside down when the glass is turned over, so the chrome
  // turns with it and stays readable.
  const turn = flipped ? [{ rotate: '180deg' }] : [];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="#0000" />
      <Hourglass
        style={StyleSheet.absoluteFill}
        paramsSynchronizable={paramsSynchronizable}
        atlas={ATLAS}
        panelWidth={PANEL_W}
        panelHeight={PANEL_H}
        neck={NECK}
        grain={GRAIN}
      />
      {/* Tap the glass to pause. A layer rather than a wrapping Pressable, so
          Back, the timer and the chips stay separate accessibility nodes. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={togglePause}
        accessibilityLabel={paused ? 'Resume the timer' : 'Pause the timer'}
      />
      <View
        style={[StyleSheet.absoluteFill, { transform: turn }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.back, { top: insets.top + 6 }]}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <View
          style={[
            styles.band,
            { top: height * CAP.top, height: height * CAP.height, width },
          ]}
          pointerEvents="none"
        >
          <Text
            style={[
              styles.timer,
              paused ? styles.timerPaused : null,
              done ? styles.timerDone : null,
            ]}
            accessibilityLabel={done ? 'Done' : `${label} left`}
          >
            {label}
          </Text>
          {paused ? (
            <Text style={styles.hint}>paused — tap to resume</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.band,
            styles.chips,
            {
              top: height * BASE.top,
              height: height * BASE.height,
              width,
            },
          ]}
          pointerEvents="box-none"
        >
          {DURATIONS_MIN.map((m) => {
            const on = m === minutes;
            return (
              <Pressable
                key={m}
                onPress={() => onPick(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${m} minutes`}
                style={[styles.chip, on ? styles.chipOn : null]}
              >
                <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                  {m} min
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const CREAM = '#f3e8d2';
const WOOD = '#3a2a1a';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  back: {
    position: 'absolute',
    left: 14,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  backGlyph: {
    color: WOOD,
    fontSize: 34,
    lineHeight: 36,
    marginTop: -4,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowRadius: 4,
  },
  band: {
    position: 'absolute',
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    color: CREAM,
    fontSize: 30,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  timerPaused: {
    opacity: 0.55,
  },
  timerDone: {
    letterSpacing: 4,
  },
  hint: {
    marginTop: 2,
    color: CREAM,
    opacity: 0.75,
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  chips: {
    flexDirection: 'row',
    gap: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(243, 232, 210, 0.55)',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  chipOn: {
    backgroundColor: CREAM,
    borderColor: CREAM,
  },
  chipText: {
    color: CREAM,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextOn: {
    color: WOOD,
  },
});
