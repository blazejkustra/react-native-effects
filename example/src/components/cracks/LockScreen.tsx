import { type ComponentRef, type Ref, useEffect, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GLYPHS = {
  lock: require('../../../assets/cracks/lock-fill.png'),
  flashlight: require('../../../assets/cracks/flashlight-off-fill.png'),
  camera: require('../../../assets/cracks/camera-fill.png'),
  message: require('../../../assets/cracks/message-fill.png'),
};

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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
  return {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    date: `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`,
  };
}

function Glyph({
  source,
  height,
  aspect,
  color = '#fff',
}: {
  source: ImageSourcePropType;
  height: number;
  aspect: number;
  color?: string;
}) {
  return (
    <Image
      source={source}
      style={{ height, width: height * aspect, tintColor: color }}
      resizeMode="contain"
    />
  );
}

type LockScreenProps = {
  wallpaper: ImageSourcePropType;
  ref?: Ref<ComponentRef<typeof View>>;
  /** Side by side layout of the unfolded iPhone Duo inner panel. */
  landscape?: boolean;
  /** Show a Messages notification above the bottom buttons. */
  notification?: { title: string; body: string };
  clockColor?: string;
  /** Black wash over the wallpaper, 0..1. */
  dim?: number;
  /** Keep the clock ticking (only when the screen is not snapshotted). */
  liveClock?: boolean;
  onLayout?: () => void;
};

/**
 * A static clone of the iOS 26 lock screen (lock glyph, date,
 * clock, flashlight and camera buttons, home indicator) over a wallpaper
 * photo. Rendered as plain views so it can be snapshotted into a texture.
 */
export default function LockScreen({
  wallpaper,
  ref,
  landscape = false,
  notification,
  clockColor = 'rgba(255,255,255,0.94)',
  dim = 0.12,
  liveClock = false,
  onLayout,
}: LockScreenProps) {
  const insets = useSafeAreaInsets();
  const { time, date } = useClock(liveClock);
  const top = Math.max(insets.top, 20);
  const clockSize = landscape ? 104 : 96;

  return (
    <View ref={ref} style={styles.root} collapsable={false} onLayout={onLayout}>
      <Image source={wallpaper} style={styles.fill} resizeMode="cover" />
      <View style={[styles.shade, { opacity: dim }]} />

      <View style={[styles.head, { paddingTop: top + (landscape ? 4 : 10) }]}>
        <Glyph source={GLYPHS.lock} height={17} aspect={93 / 112} />
        <Text style={styles.date}>{date}</Text>
        <Text
          style={[
            styles.clock,
            {
              fontSize: clockSize,
              lineHeight: clockSize * 1.08,
              color: clockColor,
            },
          ]}
        >
          {time}
        </Text>
      </View>

      {notification ? (
        <View
          style={[
            styles.notification,
            { bottom: Math.max(insets.bottom, 16) + 96 },
          ]}
        >
          <View style={styles.appIcon}>
            <Glyph source={GLYPHS.message} height={20} aspect={130 / 112} />
          </View>
          <View style={styles.notificationText}>
            <View style={styles.notificationRow}>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              <Text style={styles.notificationTime}>now</Text>
            </View>
            <Text style={styles.notificationBody} numberOfLines={2}>
              {notification.body}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.bottomRow,
          { bottom: Math.max(insets.bottom, 16) + 18 },
          landscape && styles.bottomRowWide,
        ]}
      >
        <View style={styles.roundButton}>
          <Glyph source={GLYPHS.flashlight} height={22} aspect={72 / 130} />
        </View>
        <View style={styles.roundButton}>
          <Glyph source={GLYPHS.camera} height={19} aspect={141 / 109} />
        </View>
      </View>

      <View style={styles.homeIndicator} />
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
  head: {
    alignItems: 'center',
  },
  date: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 20,
    fontWeight: '600',
  },
  clock: {
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  notification: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    gap: 11,
    borderRadius: 24,
    backgroundColor: 'rgba(40,40,46,0.55)',
  },
  appIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationText: {
    flex: 1,
  },
  notificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  notificationTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  notificationTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  notificationBody: {
    color: '#fff',
    fontSize: 15,
    marginTop: 1,
  },
  bottomRow: {
    position: 'absolute',
    left: 46,
    right: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomRowWide: {
    left: 60,
    right: 60,
  },
  roundButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(30,30,34,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 140,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
