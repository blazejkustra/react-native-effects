import { type ComponentRef, type Ref, useEffect, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SERIF = 'Georgia';

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

const TICK_MS = 5_000;

/** Ticks only when `live`: a snapshot of the screen cannot follow the time. */
function useClock(live: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!live) {
      return;
    }
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [live]);
  return `${pad(now.getHours())} ${pad(now.getMinutes())}`;
}

type LockScreenProps = {
  wallpaper: ImageSourcePropType;
  ref?: Ref<ComponentRef<typeof View>>;
  clockColor?: string;
  /** Black wash over the wallpaper, 0..1. */
  dim?: number;
  /** Keep the clock ticking (only when the screen is not snapshotted). */
  liveClock?: boolean;
  onLayout?: () => void;
};

/**
 * An abstract scene for the glass effects: a full-bleed photo with a small
 * serif clock in the corner. Rendered as plain views so it can be snapshotted
 * into a texture.
 */
export default function LockScreen({
  wallpaper,
  ref,
  clockColor = 'rgba(255,255,255,0.9)',
  dim = 0.12,
  liveClock = false,
  onLayout,
}: LockScreenProps) {
  const insets = useSafeAreaInsets();
  const time = useClock(liveClock);

  return (
    <View ref={ref} style={styles.root} collapsable={false} onLayout={onLayout}>
      <Image source={wallpaper} style={styles.fill} resizeMode="cover" />
      <View style={[styles.shade, { opacity: dim }]} />
      <Text
        style={[
          styles.clock,
          { top: Math.max(insets.top, 20) + 24, color: clockColor },
        ]}
      >
        {time}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  clock: {
    position: 'absolute',
    left: 24,
    fontFamily: SERIF,
    fontSize: 44,
    fontStyle: 'italic',
    fontVariant: ['tabular-nums'],
  },
});
