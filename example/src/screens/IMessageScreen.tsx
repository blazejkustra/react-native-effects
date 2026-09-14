import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Bubble, { IM_BG, IM_BLUE } from '../components/imessage/Bubble';
import EffectsSheet from '../components/imessage/EffectsSheet';
import ScreenEffectPlayer from '../components/imessage/ScreenEffectPlayer';
import {
  EFFECT_LABEL,
  isScreenEffect,
  type BubbleTarget,
  type EffectId,
} from '../components/imessage/types';
import {
  DEFAULT_TEXT,
  forgetTarget,
  reportTarget,
  useIMessageDebugHooks,
  useIMessageEffects,
} from '../hooks/useIMessageEffects';

// iMessage clone, dark appearance. Sending a message can carry a screen
// effect (echo, spotlight, confetti, fireworks, lasers) that plays once over
// the chat.
// Long-press the send arrow for the effects sheet; the dev row below the
// thread fires each effect with one tap.

const CONTACT = 'Kacper';
const DEV_EFFECTS: EffectId[] = [
  'echo',
  'spotlight',
  'confetti',
  'fireworks',
  'lasers',
];

export default function IMessageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { messages, playing, send, finishPlaying, getTarget } =
    useIMessageEffects();
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useIMessageDebugHooks(
    send,
    () => messagesRef.current,
    () => playingRef.current
  );

  useEffect(() => {
    // Pin the newest bubble before it is measured, so rects are final.
    scroll.current?.scrollToEnd({ animated: false });
  }, [messages.length]);

  useEffect(
    () => () => messages.forEach((m) => forgetTarget(m.id)),
    [messages]
  );

  const sendPlain = useCallback(() => {
    if (!draft.trim()) {
      return;
    }
    send('none', draft);
    setDraft('');
  }, [draft, send]);

  const openSheet = useCallback(() => {
    // The sheet needs the whole screen; the keyboard would cover its preview.
    Keyboard.dismiss();
    setSheet(draft.trim() || DEFAULT_TEXT.none);
  }, [draft]);

  const sendWith = useCallback(
    (effect: EffectId) => {
      if (sheet !== null) {
        send(effect, sheet);
      }
      setSheet(null);
      setDraft('');
    },
    [send, sheet]
  );

  const onTargetFor = useCallback(
    (id: string) => (t: BubbleTarget) => reportTarget(id, t),
    []
  );

  const target = playing ? getTarget(playing.messageId) : null;
  const player =
    playing && target && isScreenEffect(playing.effect) ? (
      <ScreenEffectPlayer
        key={playing.key}
        effect={playing.effect}
        target={target}
        onDone={() => finishPlaying(playing.key)}
      />
    ) : null;

  const lastMine = [...messages].reverse().find((m) => m.from === 'me');

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={IM_BG} translucent />

      <ScrollView
        ref={scroll}
        style={styles.thread}
        contentContainerStyle={[
          styles.threadContent,
          { paddingTop: insets.top + 70 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
      >
        {messages.map((m, i) => {
          const next = messages[i + 1];
          const tail = !next || next.from !== m.from;
          return (
            <View
              key={m.id}
              style={i > 0 && next?.from !== m.from && styles.runGap}
            >
              <Bubble
                msg={m}
                tail={tail}
                onTarget={
                  isScreenEffect(m.effect) ? onTargetFor(m.id) : undefined
                }
                wantSnapshot={m.effect === 'echo'}
              />
              {lastMine?.id === m.id && (
                <Text style={styles.delivered}>Delivered</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={styles.contact}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{CONTACT[0]}</Text>
          </View>
          <Text style={styles.contactName}>{CONTACT} ›</Text>
        </View>
        <View style={styles.back} />
      </View>

      {__DEV__ && (
        <View style={styles.devRow}>
          <Text style={styles.devLabel}>Send with…</Text>
          {DEV_EFFECTS.map((e) => (
            <Pressable
              key={e}
              onPress={() => send(e)}
              style={styles.devChip}
              accessibilityRole="button"
              accessibilityLabel={`Send with ${EFFECT_LABEL[e]}`}
            >
              <Text style={styles.devChipText}>{EFFECT_LABEL[e]}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.plus}>
          <Text style={styles.plusText}>+</Text>
        </View>
        <View style={styles.inputWrap}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="iMessage"
            placeholderTextColor="#6e6e73"
            style={styles.input}
            multiline
            keyboardAppearance="dark"
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={sendPlain}
            onLongPress={openSheet}
            delayLongPress={350}
            style={[styles.send, !draft.trim() && styles.sendIdle]}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityHint="Hold to send with an effect"
          >
            <Text style={styles.sendArrow}>↑</Text>
          </Pressable>
        </View>
      </View>

      {player}

      {sheet !== null && (
        <EffectsSheet
          text={sheet}
          onClose={() => setSheet(null)}
          onSend={sendWith}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: IM_BG,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  runGap: {
    marginBottom: 8,
  },
  delivered: {
    alignSelf: 'flex-end',
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    marginRight: 16,
    marginTop: 3,
  },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(22,22,24,0.94)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
    paddingBottom: 6,
  },
  back: {
    width: 56,
    height: 44,
    justifyContent: 'center',
    paddingLeft: 10,
  },
  backChevron: {
    color: IM_BLUE,
    fontSize: 36,
    lineHeight: 40,
    marginTop: -4,
  },
  contact: {
    alignItems: 'center',
    gap: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8e8e93',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  contactName: {
    color: '#fff',
    fontSize: 11,
  },

  devRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  devLabel: {
    color: '#6e6e73',
    fontSize: 12,
  },
  devChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1c1c1e',
  },
  devChipText: {
    color: '#d1d1d6',
    fontSize: 12,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 6,
    backgroundColor: IM_BG,
  },
  plus: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1c1c1e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  plusText: {
    color: '#8e8e93',
    fontSize: 22,
    marginTop: -2,
  },
  inputWrap: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 3,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    maxHeight: 110,
    paddingTop: 5,
    paddingBottom: 5,
  },
  send: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: IM_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendIdle: {
    backgroundColor: '#48484a',
  },
  sendArrow: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2,
  },
});
