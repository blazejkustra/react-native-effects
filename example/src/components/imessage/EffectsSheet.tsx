import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Bubble, { IM_BLUE } from './Bubble';
import ScreenEffectPlayer from './ScreenEffectPlayer';
import {
  EFFECT_LABEL,
  SCREEN_EFFECTS,
  type BubbleTarget,
  type EffectId,
  type Message,
  type ScreenEffectId,
} from './types';

type Props = {
  text: string;
  onClose: () => void;
  onSend: (effect: EffectId) => void;
};

/**
 * The "Send with effect" sheet: the pending message shown as a real bubble
 * and the screen effects in a pager, each previewing on the bubble the way
 * iMessage previews before you commit. The arrow sends with the effect.
 */
export default function EffectsSheet({ text, onClose, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<BubbleTarget | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const replay = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effect: ScreenEffectId = SCREEN_EFFECTS[page] ?? 'echo';

  // The preview bubble is remounted per effect so its snapshot is fresh for
  // the effects that need one.
  const preview: Message = {
    id: `preview-${effect}`,
    from: 'me',
    text,
    effect,
    time: '',
  };

  const onDone = useCallback(() => {
    replay.current = setTimeout(() => setPlayKey((k) => k + 1), 600);
  }, []);
  useEffect(
    () => () => {
      if (replay.current) {
        clearTimeout(replay.current);
      }
    },
    []
  );
  useEffect(() => {
    // A new effect starts its preview from the top.
    setTarget(null);
    setPlayKey((k) => k + 1);
  }, [effect]);

  const onPage = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      setPage(Math.max(0, Math.min(SCREEN_EFFECTS.length - 1, i)));
    },
    [width]
  );

  const player = target ? (
    <ScreenEffectPlayer
      key={`${effect}-${playKey}`}
      effect={effect}
      target={target}
      onDone={onDone}
    />
  ) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Send with effect</Text>
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.stage} pointerEvents="box-none">
        <Bubble
          key={preview.id}
          msg={preview}
          tail
          onTarget={setTarget}
          wantSnapshot={effect === 'echo'}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPage}
          style={styles.pager}
        >
          {SCREEN_EFFECTS.map((id) => (
            <View key={id} style={[styles.page, { width }]}>
              <Text style={styles.pageText}>{EFFECT_LABEL[id]}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {SCREEN_EFFECTS.map((id, i) => (
            <View key={id} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.sendRow}>
          <Text style={styles.hint}>Swipe to preview · tap ↑ to send</Text>
          <Pressable
            onPress={() => onSend(effect)}
            style={styles.send}
            accessibilityRole="button"
            accessibilityLabel={`Send with ${EFFECT_LABEL[effect]}`}
          >
            <Text style={styles.sendArrow}>↑</Text>
          </Pressable>
        </View>
      </View>

      {player}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  close: {
    position: 'absolute',
    right: 16,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(118,118,128,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  stage: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 28,
  },
  bottom: {
    paddingTop: 8,
  },
  pager: {
    height: 56,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginTop: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotOn: {
    backgroundColor: '#fff',
  },
  sendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 18,
  },
  hint: {
    color: '#8e8e93',
    fontSize: 13,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: IM_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrow: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -2,
  },
});
