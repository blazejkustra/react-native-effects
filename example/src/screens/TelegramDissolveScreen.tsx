import {
  type ComponentRef,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';
import ParticleDissolve, {
  type DissolveRect,
} from '../components/telegram/ParticleDissolve';
import {
  TG_AVATAR_PHOTO,
  TG_BLUE,
  TG_BUBBLE,
  TG_ICONS as ICONS,
  TG_MENU,
  TG_MUTED,
  TG_PATTERN,
  TG_PILL,
  TG_RED,
} from '../components/telegram/icons';

// Telegram group chat clone (dark theme, purple accent). Long-press a message,
// Delete → "Delete for everyone", and the bubble is snapshotted into a texture
// and dissolved into particles by ParticleDissolve.

const DISSOLVE_MS = 1150; // sweep + drift, measured off the recording
const SWAP_MS = 80; // frames for the canvas to draw before the bubble hides
const REMOVE_AT = 0.45; // list reflows while the dust is still drifting
// Canvas padding around the bubble so drifting particles are not clipped.
const PAD = { left: 170, top: 130, right: 30, bottom: 60 };
const BUBBLE_RADIUS = 17;
const REACTIONS = ['❤️', '👍', '👎', '🔥', '🥰', '👏', '😁'];
const MENU_GAP = 10; // bubble → menu
const LIFT_MS = 280; // message rises to meet the menu / settles back
// Rows slide into place when a message leaves the list.
const LAYOUT = LinearTransition.duration(340).easing(
  Easing.inOut(Easing.cubic)
);
const MENU_H = 8 * 44 + 2 * 6;

type Message = { id: string; text: string; time: string };

const INITIAL_MESSAGES: Message[] = [
  { id: 'm1', text: 'Expo Go is enough for prod, right?', time: '20:56' },
  { id: 'm2', text: 'can we just use Flutter', time: '20:56' },
  { id: 'm3', text: 'wrong chat sorry', time: '20:57' },
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type BubblePhase = 'idle' | 'dissolving';

type BubbleHandle = {
  /** Window rect of the bubble (background layer). */
  measure: () => Promise<DissolveRect>;
  /** Snapshot the content layer to a transparent PNG and measure both layers. */
  capture: () => Promise<Snapshot>;
};

type Snapshot = { uri: string; content: DissolveRect; bubble: DissolveRect };

type ViewHandle = ComponentRef<typeof View>;

function measure(view: ViewHandle): Promise<DissolveRect> {
  return new Promise((resolve) => {
    view.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

/**
 * An outgoing Telegram bubble. `capture()` snapshots the whole bubble (purple
 * body + text) to a transparent PNG so the particle pass dissolves it as one.
 */
const Bubble = forwardRef<
  BubbleHandle,
  {
    msg: Message;
    phase?: BubblePhase;
    onLongPress?: () => void;
    /** Render as a detached copy of a measured bubble (context menu). */
    cloneWidth?: number;
    /** Keep layout but draw nothing (the context-menu clone stands in). */
    hidden?: boolean;
  }
>(function Bubble(
  { msg, phase = 'idle', onLongPress, cloneWidth, hidden = false },
  ref
) {
  const bubbleRef = useRef<ViewHandle>(null);

  useImperativeHandle(ref, () => ({
    measure: () => measure(bubbleRef.current!),
    async capture() {
      const uriRaw = await captureRef(bubbleRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const uri = uriRaw.startsWith('file://') ? uriRaw : `file://${uriRaw}`;
      const bubble = await measure(bubbleRef.current!);
      return { uri, content: bubble, bubble };
    },
  }));

  return (
    <Pressable
      onLongPress={phase === 'idle' ? onLongPress : undefined}
      delayLongPress={300}
      style={cloneWidth === undefined ? styles.bubbleRow : undefined}
    >
      <View
        ref={bubbleRef}
        collapsable={false}
        style={[
          styles.bubble,
          (hidden || phase === 'dissolving') && styles.invisible,
          cloneWidth !== undefined && {
            width: cloneWidth,
            maxWidth: undefined,
          },
        ]}
      >
        <View style={styles.bubbleBg} />
        <View style={styles.bubbleContent}>
          <Text style={styles.bubbleText}>{msg.text}</Text>
          <View style={styles.meta}>
            <Text style={styles.time}>{msg.time}</Text>
            <Icon source={ICONS.checks} size={16} color="#fff" />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

function MenuItem({
  icon,
  label,
  color = '#fff',
  onPress,
  last,
}: {
  icon: number;
  label: string;
  color?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        !last && styles.menuItemBorder,
        pressed && styles.menuItemPressed,
      ]}
    >
      <Icon source={icon} size={22} color={color} />
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

type MenuState = { id: string; rect: DissolveRect; stage: 'menu' | 'confirm' };
type Dissolve = {
  id: string;
  snapshot: Snapshot;
  canvas: DissolveRect;
  seed: number;
};

export default function TelegramDissolveScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { height: winH } = useWindowDimensions();
  const headerHeight = insets.top + 52;

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dissolve, setDissolve] = useState<Dissolve | null>(null);
  const [phaseById, setPhaseById] = useState<Record<string, BubblePhase>>({});
  const handles = useRef(new Map<string, BubbleHandle>());
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (startTimer.current) {
        clearTimeout(startTimer.current);
      }
      if (removeTimer.current) {
        clearTimeout(removeTimer.current);
      }
    },
    []
  );

  // Dissolve progress, bridged into the shader's live channel every frame.
  // Parked at 1 (nothing drawn) until a delete rewinds it to 0.
  const progress = useSharedValue(1);
  const seed = useSharedValue(0);
  const { paramsSynchronizable } = useParamsSynchronizable([1, 0, 0, 0]);
  useAnimatedReaction(
    () => [progress.value, seed.value] as const,
    ([p, s]) => {
      'worklet';
      paramsSynchronizable.setBlocking(() => Float64Array.of(p, s, 0, 0));
    }
  );

  // 0 = message at its place in the list, 1 = lifted under the reactions bar.
  // Also drives the dim, so the whole overlay settles back together.
  const lift = useSharedValue(0);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const discardDissolve = useCallback(() => {
    setDissolve((d) => {
      if (d) {
        releaseCapture(d.snapshot.uri);
      }
      return null;
    });
  }, []);

  // Long-press: snapshot the bubble and mount the particle canvas right away,
  // parked at progress 1 (it draws nothing there). While the menu is open the
  // canvas and its texture warm up, so a later delete swaps in with no gap.
  const openMenu = useCallback(
    async (id: string) => {
      const handle = handles.current.get(id);
      if (!handle || menu || dissolve) {
        return;
      }
      const snapshot = await handle.capture();
      const b = snapshot.bubble;
      const canvas = {
        x: b.x - PAD.left,
        y: b.y - PAD.top,
        w: b.w + PAD.left + PAD.right,
        h: b.h + PAD.top + PAD.bottom,
      };
      seed.value = Math.random();
      progress.value = 1;
      setDissolve({ id, snapshot, canvas, seed: seed.value });
      setMenu({ id, rect: b, stage: 'menu' });
      lift.value = withTiming(1, {
        duration: LIFT_MS,
        easing: Easing.out(Easing.cubic),
      });
    },
    [dissolve, lift, menu, progress, seed]
  );

  // Resolves once the lifted message has settled back into the list.
  const closeResolvers = useRef<Array<() => void>>([]);
  const unmountMenu = useCallback(() => {
    setMenu(null);
    closeResolvers.current.forEach((r) => r());
    closeResolvers.current = [];
  }, []);
  const closeMenu = useCallback(() => {
    lift.value = withTiming(
      0,
      { duration: LIFT_MS * 0.8, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(unmountMenu)();
        }
      }
    );
    return new Promise<void>((resolve) => {
      closeResolvers.current.push(resolve);
    });
  }, [lift, unmountMenu]);

  const dismissMenu = useCallback(async () => {
    await closeMenu();
    discardDissolve();
  }, [closeMenu, discardDissolve]);

  const finishDissolve = useCallback(
    (id: string) => {
      removeMessage(id);
      discardDissolve();
      setPhaseById({});
      // Leave progress at 1 (the shader draws nothing there): rewinding it now
      // would flash the intact snapshot for a frame before the canvas unmounts.
    },
    [discardDissolve, removeMessage]
  );

  const startDissolve = useCallback(
    async (id: string) => {
      if (startTimer.current) {
        return;
      }
      // Let the message settle back into the list first, like Telegram.
      await closeMenu();
      // The warmed-up canvas now draws the intact snapshot exactly over the
      // real bubble; give it a couple of frames, then hide the real one and run.
      progress.value = 0;
      startTimer.current = setTimeout(() => {
        startTimer.current = null;
        setPhaseById({ [id]: 'dissolving' });
        removeTimer.current = setTimeout(() => {
          removeTimer.current = null;
          removeMessage(id);
        }, DISSOLVE_MS * REMOVE_AT);
        progress.value = withTiming(
          1,
          { duration: DISSOLVE_MS, easing: Easing.linear },
          (finished) => {
            if (finished) {
              runOnJS(finishDissolve)(id);
            }
          }
        );
      }, SWAP_MS);
    },
    [closeMenu, finishDissolve, progress, removeMessage]
  );

  const restore = useCallback(() => setMessages(INITIAL_MESSAGES), []);

  const menuMsg = menu ? messages.find((m) => m.id === menu.id) : undefined;

  // Telegram lifts the message so the menu fits under it; mirror that by
  // shifting the clone, reactions and menu together.
  // The lift is sized for the full menu so the bubble does not jump when the
  // shorter confirm sheet replaces it.
  const menuTop = menu
    ? Math.min(
        menu.rect.y,
        winH - insets.bottom - 12 - MENU_H - MENU_GAP - menu.rect.h
      )
    : 0;
  const menuRectY = menu?.rect.y ?? 0;
  const cloneStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: (menuTop - menuRectY) * lift.value }],
    }),
    [menuTop, menuRectY]
  );
  const dimStyle = useAnimatedStyle(() => ({ opacity: lift.value }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* Chat wallpaper */}
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
          { paddingTop: headerHeight + 60, paddingBottom: insets.bottom + 70 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <AnimatedPressable
            entering={FadeIn.duration(320)}
            style={styles.infoCard}
            onPress={restore}
          >
            <Text style={styles.infoTitle}>You created a group</Text>
            <Text style={styles.infoSub}>Groups can have:</Text>
            {[
              'Up to 200,000 members',
              'Persistent chat history',
              'Public links such as t.me/title',
              'Admins with different rights',
            ].map((line) => (
              <Text key={line} style={styles.infoLine}>
                ✓ {line}
              </Text>
            ))}
            <Text style={styles.infoHint}>Tap to bring the messages back</Text>
          </AnimatedPressable>
        ) : (
          <>
            <Animated.View layout={LAYOUT} style={styles.chip}>
              <Text style={styles.chipText}>Today</Text>
            </Animated.View>
            <Animated.View
              layout={LAYOUT}
              style={[styles.chip, styles.chipGap]}
            >
              <Text style={styles.chipText}>
                <Text style={styles.chipBold}>Blazej Kustra</Text> created the
                group "Expo Enjoyers"
              </Text>
            </Animated.View>
            {messages.map((m) => (
              <Animated.View key={m.id} layout={LAYOUT}>
                <Bubble
                  msg={m}
                  ref={(h) => {
                    if (h) {
                      handles.current.set(m.id, h);
                    } else {
                      handles.current.delete(m.id);
                    }
                  }}
                  phase={phaseById[m.id] ?? 'idle'}
                  hidden={menu?.id === m.id}
                  onLongPress={() => openMenu(m.id)}
                />
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Header */}
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
            <Text style={styles.title}>Expo Enjoyers</Text>
            <Text style={styles.subtitle}>2137 members</Text>
          </View>
          <Image source={TG_AVATAR_PHOTO} style={styles.avatar} />
        </View>
        <View style={styles.addMembers}>
          <Text style={styles.addMembersText}>Add Members</Text>
          <View style={styles.addMembersClose}>
            <Icon source={ICONS.close} size={22} color={TG_BLUE} />
          </View>
        </View>
      </View>

      {/* Composer */}
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

      {/* Long-press context menu */}
      {menu && menuMsg && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
            <Pressable style={styles.dim} onPress={dismissMenu} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.absolute,
              { left: menu.rect.x, top: menu.rect.y, width: menu.rect.w },
              cloneStyle,
            ]}
          >
            <Bubble msg={menuMsg} cloneWidth={menu.rect.w} />
          </Animated.View>
          {menu.stage === 'menu' ? (
            <>
              <Animated.View
                entering={ZoomIn.duration(220)}
                style={[styles.absolute, styles.right, { top: menuTop - 62 }]}
              >
                <Animated.View style={[styles.reactions, dimStyle]}>
                  {REACTIONS.map((e) => (
                    <Text key={e} style={styles.reaction}>
                      {e}
                    </Text>
                  ))}
                  <View style={styles.reactionMore}>
                    <Icon source={ICONS.chevron} size={16} />
                  </View>
                </Animated.View>
              </Animated.View>
              <Animated.View
                entering={ZoomIn.duration(220)}
                style={[
                  styles.absolute,
                  styles.right,
                  { top: menuTop + menu.rect.h + MENU_GAP },
                ]}
              >
                <Animated.View style={[styles.menu, dimStyle]}>
                  <MenuItem
                    icon={ICONS.viewed}
                    label="Nobody Viewed"
                    color={TG_MUTED}
                  />
                  <View style={styles.menuGap} />
                  <MenuItem icon={ICONS.reply} label="Reply" />
                  <MenuItem icon={ICONS.copy} label="Copy" />
                  <MenuItem icon={ICONS.edit} label="Edit" />
                  <MenuItem icon={ICONS.pin} label="Pin" />
                  <MenuItem icon={ICONS.forward} label="Forward" />
                  <MenuItem
                    icon={ICONS.delete}
                    label="Delete"
                    color={TG_RED}
                    last
                    onPress={() => setMenu({ ...menu, stage: 'confirm' })}
                  />
                  <View style={styles.menuGap} />
                  <MenuItem icon={ICONS.select} label="Select" last />
                </Animated.View>
              </Animated.View>
            </>
          ) : (
            <Animated.View
              entering={ZoomIn.duration(200)}
              style={[
                styles.absolute,
                styles.right,
                { top: menuTop + menu.rect.h + MENU_GAP },
              ]}
            >
              <Animated.View style={[styles.menu, dimStyle]}>
                <Pressable
                  style={[styles.confirmItem, styles.menuItemBorder]}
                  onPress={() => startDissolve(menu.id)}
                >
                  <Text style={styles.confirmText}>Delete for everyone</Text>
                </Pressable>
                <Pressable
                  style={styles.confirmItem}
                  onPress={() => startDissolve(menu.id)}
                >
                  <Text style={styles.confirmText}>Delete for me</Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          )}
        </View>
      )}

      {/* Particle pass, mounted over the bubble being deleted. */}
      {dissolve && (
        <View
          pointerEvents="none"
          style={[
            styles.absolute,
            {
              left: dissolve.canvas.x,
              top: dissolve.canvas.y,
              width: dissolve.canvas.w,
              height: dissolve.canvas.h,
            },
          ]}
        >
          <ParticleDissolve
            style={StyleSheet.absoluteFill}
            paramsSynchronizable={paramsSynchronizable}
            texture={{ uri: dissolve.snapshot.uri }}
            textureRect={{
              x: dissolve.snapshot.content.x - dissolve.canvas.x,
              y: dissolve.snapshot.content.y - dissolve.canvas.y,
              w: dissolve.snapshot.content.w,
              h: dissolve.snapshot.content.h,
            }}
            bubbleRect={{
              x: dissolve.snapshot.bubble.x - dissolve.canvas.x,
              y: dissolve.snapshot.bubble.y - dissolve.canvas.y,
              w: dissolve.snapshot.bubble.w,
              h: dissolve.snapshot.bubble.h,
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
  },
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
  chipText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  chipBold: {
    fontWeight: '700',
  },
  chipGap: {
    marginTop: 6,
  },

  // Bubble
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: BUBBLE_RADIUS,
    borderBottomRightRadius: 4,
    overflow: 'visible',
  },
  bubbleBg: {
    ...StyleSheet.absoluteFill,
    borderRadius: BUBBLE_RADIUS,
    borderBottomRightRadius: 4,
    backgroundColor: TG_BUBBLE,
  },
  bubbleContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
  },
  invisible: {
    opacity: 0,
  },
  bubbleText: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 22,
    flexShrink: 1,
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

  // Empty state
  infoCard: {
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 40,
    width: 300,
    backgroundColor: 'rgba(28,22,28,0.92)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  infoTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  infoSub: {
    color: '#fff',
    fontSize: 15,
    marginBottom: 6,
  },
  infoLine: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 26,
  },
  infoHint: {
    color: TG_MUTED,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
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
    paddingHorizontal: 30,
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
  addMembers: {
    marginTop: 6,
    marginHorizontal: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: TG_PILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMembersText: {
    color: TG_BLUE,
    fontSize: 17,
  },
  addMembersClose: {
    position: 'absolute',
    right: 12,
    top: 11,
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

  // Context menu
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  right: {
    right: 10,
  },
  reactions: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1d191d',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
    gap: 4,
  },
  reaction: {
    fontSize: 26,
    width: 38,
    textAlign: 'center',
  },
  reactionMore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2c282c',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  menu: {
    width: 236,
    borderRadius: 16,
    backgroundColor: TG_MENU,
    overflow: 'hidden',
  },
  menuGap: {
    height: 6,
    backgroundColor: '#0b090b',
  },
  menuItem: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 16,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  menuLabel: {
    fontSize: 17,
  },
  confirmItem: {
    height: 56,
    justifyContent: 'center',
    paddingLeft: 18,
  },
  confirmText: {
    color: TG_RED,
    fontSize: 17,
  },
});
