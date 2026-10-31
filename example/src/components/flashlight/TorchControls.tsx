import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const THUMB_SIZE = 22;
const ACCESSIBILITY_STEP = 0.1;
const ACCESSIBILITY_ACTIONS = [
  { name: 'increment' },
  { name: 'decrement' },
] as const;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

type TorchSliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function TorchSlider({ label, value, onChange }: TorchSliderProps) {
  const [trackWidth, setTrackWidth] = useState(1);

  const onLayout = (e: LayoutChangeEvent) =>
    setTrackWidth(e.nativeEvent.layout.width);
  const setFromTouch = (x: number) => onChange(clamp01(x / trackWidth));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => setFromTouch(e.x))
    .onUpdate((e) => setFromTouch(e.x));

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const direction = e.nativeEvent.actionName === 'increment' ? 1 : -1;
    onChange(clamp01(value + direction * ACCESSIBILITY_STEP));
  };

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.label}>{label}</Text>
      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: 100, now: value * 100 }}
          accessibilityActions={ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={onAccessibilityAction}
        >
          <View style={styles.groove} />
          <View style={[styles.fill, { width: value * trackWidth }]} />
          <View
            style={[styles.thumb, { left: value * (trackWidth - THUMB_SIZE) }]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

type TorchControlsProps = {
  isOn: boolean;
  beam: number;
  level: number;
  bottomInset: number;
  onToggle: () => void;
  onBeamChange: (value: number) => void;
  onLevelChange: (value: number) => void;
};

/** The light switch and the two sliders that shape the beam. */
export default function TorchControls({
  isOn,
  beam,
  level,
  bottomInset,
  onToggle,
  onBeamChange,
  onLevelChange,
}: TorchControlsProps) {
  return (
    <View style={[styles.panel, { bottom: bottomInset + 16 }]}>
      <TorchSlider label="Beam" value={beam} onChange={onBeamChange} />
      <TorchSlider label="Bright" value={level} onChange={onLevelChange} />
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.toggle,
          isOn && styles.toggleOn,
          pressed && styles.togglePressed,
        ]}
        accessibilityRole="switch"
        accessibilityState={{ checked: isOn }}
      >
        <Text style={[styles.toggleText, isOn && styles.toggleTextOn]}>
          {isOn ? 'Switch off' : 'Switch on'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 28,
    right: 28,
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(12, 12, 14, 0.78)',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    width: 48,
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 14,
    fontWeight: '500',
  },
  track: {
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
  groove: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#f2e6c8',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#f2e6c8',
  },
  toggle: {
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  toggleOn: {
    backgroundColor: '#f2e6c8',
  },
  togglePressed: {
    opacity: 0.7,
  },
  toggleText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  toggleTextOn: {
    color: '#17150f',
  },
});
