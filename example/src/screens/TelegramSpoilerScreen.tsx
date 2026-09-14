import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import SpoilerParticles from '../components/telegram/SpoilerParticles';
import {
  TG_AVATAR_PHOTO,
  TG_BUBBLE,
  TG_ICONS as ICONS,
  TG_MUTED,
  TG_PATTERN,
  TG_PILL,
} from '../components/telegram/icons';
import { useSpoiler, useSpoilerDebugHooks } from '../hooks/useSpoiler';

// Telegram group chat clone (dark theme, purple accent) with hidden text:
// a spoiler span is covered by a cloud of drifting sparks, a tap blows the
// cloud open and shows the real text, and after a few seconds it hides again.

const BUBBLE_RADIUS = 17;
const TG_INCOMING = '#232323';
const SENDER_COLORS = ['#5BC8FA', '#F5A54A'];

type Part = string | { spoiler: string };
type Message = {
  id: string;
  from: 'me' | { name: string; color: string };
  parts: Part[];
  time: string;
};

const MESSAGES: Message[] = [
  {
    id: 'm1',
    from: { name: 'Kacper', color: SENDER_COLORS[0]! },
    parts: ['ok who broke main again'],
    time: '10:41',
  },
  {
    id: 'm2',
    from: 'me',
    parts: ['not me. it was ', { spoiler: 'the one who force-pushed at 2am' }],
    time: '10:41',
  },
  {
    id: 'm3',
    from: { name: 'Mateusz', color: SENDER_COLORS[1]! },
    parts: [
      'spoiler for the release notes: ',
      {
        spoiler:
          'the New Architecture is now the only architecture, the Bridge is gone and there is no flag to bring it back',
      },
    ],
    time: '10:42',
  },
  {
    id: 'm4',
    from: 'me',
    parts: ['pod install is fixing it as we speak'],
    time: '10:43',
  },
];

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

type SpanMode = 'hidden' | 'text' | 'mask';
type ViewHandle = ComponentRef<typeof View>;

/**
 * The message body. Three copies of it are laid over each other so they wrap
 * identically: the visible one with the spoiler span transparent, the reveal
 * overlay with only the span visible, and the mask with the span drawn as a
 * white band, which is view-shot once and handed to the shader.
 */
function Body({
  msg,
  mode,
  onSpoilerPress,
}: {
  msg: Message;
  mode: SpanMode;
  onSpoilerPress?: (e: GestureResponderEvent) => void;
}) {
  // Only the visible copy carries the time and checks; the other two just
  // reserve the same space so the text wraps identically.
  const metaInvisible = mode !== 'hidden';
  return (
    <View style={styles.bubbleContent}>
      <Text style={[styles.bubbleText, mode !== 'hidden' && styles.clear]}>
        {msg.from !== 'me' && mode === 'hidden' && (
          <Text style={[styles.sender, { color: msg.from.color }]}>
            {msg.from.name}
            {'\n'}
          </Text>
        )}
        {msg.from !== 'me' && mode !== 'hidden' && (
          <Text style={styles.sender}>
            {msg.from.name}
            {'\n'}
          </Text>
        )}
        {msg.parts.map((part, i) =>
          typeof part === 'string' ? (
            part
          ) : (
            <Text
              key={i}
              onPress={mode === 'hidden' ? onSpoilerPress : undefined}
              suppressHighlighting
              style={
                mode === 'hidden'
                  ? styles.clear
                  : mode === 'text'
                    ? styles.spanText
                    : styles.spanMask
              }
            >
              {part.spoiler}
            </Text>
          )
        )}
      </Text>
      <View style={[styles.meta, metaInvisible && styles.invisible]}>
        <Text style={styles.time}>{msg.time}</Text>
        {msg.from === 'me' && (
          <Icon source={ICONS.checks} size={16} color="#fff" />
        )}
      </View>
    </View>
  );
}

function Frame({ msg, children }: { msg: Message; children: ReactNode }) {
  const mine = msg.from === 'me';
  return (
    <View style={[styles.bubbleRow, !mine && styles.bubbleRowIn]}>
      <View style={[styles.bubble, !mine && styles.bubbleIn]}>{children}</View>
    </View>
  );
}

function PlainBubble({ msg }: { msg: Message }) {
  const mine = msg.from === 'me';
  return (
    <Frame msg={msg}>
      <View style={[styles.bubbleBg, !mine && styles.bubbleBgIn]} />
      <Body msg={msg} mode="hidden" />
    </Frame>
  );
}

type Mask = { uri: string; w: number; h: number };

function SpoilerBubble({ msg, order }: { msg: Message; order: number }) {
  const mine = msg.from === 'me';
  const bubbleRef = useRef<ViewHandle>(null);
  const maskRef = useRef<ViewHandle>(null);
  const [mask, setMask] = useState<Mask | null>(null);
  const spoiler = useSpoiler({ id: msg.id, order });

  // The mask copy sits under the bubble background, so it is never seen, and
  // is snapshotted once it has laid out. Its alpha is the span's band.
  const onMaskLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (mask || !maskRef.current) {
        return;
      }
      spoiler.setCanvasSize(width, height);
      bubbleRef.current?.measureInWindow((x, y, w, h) =>
        spoiler.setRect({ x, y, w, h })
      );
      captureRef(maskRef, { format: 'png', quality: 1, result: 'tmpfile' })
        .then((raw) => {
          const uri = raw.startsWith('file://') ? raw : `file://${raw}`;
          setMask({ uri, w: width, h: height });
        })
        .catch((err) => {
          if (__DEV__) {
            console.warn('spoiler mask capture failed', err);
          }
        });
    },
    [mask, spoiler]
  );
  useEffect(
    () => () => {
      if (mask) {
        releaseCapture(mask.uri);
      }
    },
    [mask]
  );

  // The press lands on the span itself (a nested Text), so only the hidden
  // words react; the burst starts where the finger was.
  const onSpoilerPress = useCallback(
    (e: GestureResponderEvent) => {
      const { pageX, pageY } = e.nativeEvent;
      bubbleRef.current?.measureInWindow((x, y) => {
        spoiler.reveal(pageX - x, pageY - y);
      });
    },
    [spoiler]
  );

  const revealStyle = useAnimatedStyle(() => ({
    opacity: spoiler.textOpacity.value,
  }));

  return (
    <Frame msg={msg}>
      <View
        ref={maskRef}
        collapsable={false}
        onLayout={onMaskLayout}
        style={StyleSheet.absoluteFill}
      >
        <Body msg={msg} mode="mask" />
      </View>
      <View style={[styles.bubbleBg, !mine && styles.bubbleBgIn]} />
      <View ref={bubbleRef} collapsable={false}>
        <Body msg={msg} mode="hidden" onSpoilerPress={onSpoilerPress} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, revealStyle]}
      >
        <Body msg={msg} mode="text" />
      </Animated.View>
      {mask && (
        <SpoilerParticles
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          paramsSynchronizable={spoiler.paramsSynchronizable}
          texture={{ uri: mask.uri }}
          maskRect={{ x: 0, y: 0, w: mask.w, h: mask.h }}
        />
      )}
    </Frame>
  );
}

export default function TelegramSpoilerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  useSpoilerDebugHooks();

  let spoilerOrder = 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Image
          source={TG_PATTERN}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.thread,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 70 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.chip}>
          <Text style={styles.chipText}>Today</Text>
        </View>
        {MESSAGES.map((m) =>
          m.parts.some((p) => typeof p !== 'string') ? (
            <SpoilerBubble key={m.id} msg={m} order={spoilerOrder++} />
          ) : (
            <PlainBubble key={m.id} msg={m} />
          )
        )}
        <View style={[styles.chip, styles.chipGap]}>
          <Text style={styles.chipText}>Tap the hidden text</Text>
        </View>
      </ScrollView>

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.circle}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Icon source={ICONS.back} size={22} />
          </Pressable>
          <View style={styles.titlePill}>
            <Text style={styles.title}>RN Core Team (unofficial)</Text>
            <Text style={styles.subtitle}>3 members</Text>
          </View>
          <Image source={TG_AVATAR_PHOTO} style={styles.avatar} />
        </View>
      </View>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.circle}>
          <Icon source={ICONS.paperclip} size={26} color="#8e8e93" />
        </View>
        <View style={styles.input}>
          <Text style={styles.placeholder}>Message</Text>
          <Icon source={ICONS.sticker} size={26} color="#8e8e93" />
        </View>
        <View style={styles.circle}>
          <Icon source={ICONS.mic} size={26} color="#fff" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  thread: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  chip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(32,24,30,0.85)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipGap: {
    marginTop: 10,
  },
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  // Bubble
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  bubbleRowIn: {
    justifyContent: 'flex-start',
  },
  // The canvas fills the bubble and is clipped by it, so the burst never
  // spills sparks onto the wallpaper; Telegram keeps them inside the bubble.
  bubble: {
    maxWidth: '78%',
    borderRadius: BUBBLE_RADIUS,
    borderBottomRightRadius: 4,
    overflow: 'hidden',
  },
  bubbleIn: {
    borderBottomRightRadius: BUBBLE_RADIUS,
    borderBottomLeftRadius: 4,
  },
  bubbleBg: {
    ...StyleSheet.absoluteFill,
    borderRadius: BUBBLE_RADIUS,
    borderBottomRightRadius: 4,
    backgroundColor: TG_BUBBLE,
  },
  bubbleBgIn: {
    borderBottomRightRadius: BUBBLE_RADIUS,
    borderBottomLeftRadius: 4,
    backgroundColor: TG_INCOMING,
  },
  bubbleContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
  },
  bubbleText: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 22,
    flexShrink: 1,
  },
  sender: {
    fontWeight: '600',
    fontSize: 15,
  },
  clear: {
    color: 'transparent',
  },
  spanText: {
    color: '#fff',
  },
  spanMask: {
    color: '#fff',
    backgroundColor: '#fff',
  },
  invisible: {
    opacity: 0,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 1,
    gap: 3,
  },
  time: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TG_PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titlePill: {
    height: 44,
    borderRadius: 22,
    backgroundColor: TG_PILL,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: TG_MUTED,
    fontSize: 12,
    marginTop: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  // Composer
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 6,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
    justifyContent: 'space-between',
  },
  placeholder: {
    color: '#7c7c7c',
    fontSize: 17,
  },
});
