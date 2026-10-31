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
import Bubble, {
  IM_BG,
  IM_BLUE,
  IM_CHROME,
} from '../components/imessage/Bubble';
import { Chevron } from '../components/imessage/glyphs';
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
  DEMO_ORDER,
  forgetTarget,
  reportTarget,
  useIMessageDebugHooks,
  useIMessageEffects,
} from '../hooks/useIMessageEffects';

// A made-up chat. Sending can carry a screen effect (echo, spotlight, confetti,
// fireworks, lasers) that plays once over the thread. The demo is scripted: it
// opens with one text from Noa, each effect button posts the next line with
// that effect and Noa answers a beat later. Long-press the send button for the
// full effects sheet.

const CONTACT = 'Noa';
const HEADER_H = 56;

export default function IMessageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { messages, playing, busy, send, finishPlaying, getTarget } =
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

  const usedEffects = new Set(
    messages.filter((m) => m.from === 'me').map((m) => m.effect)
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      <ScrollView
        ref={scroll}
        style={styles.thread}
        contentContainerStyle={[
          styles.threadContent,
          { paddingTop: insets.top + HEADER_H + 16 },
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
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Chevron />
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{CONTACT[0]}</Text>
        </View>
        <Text style={styles.contactName}>{CONTACT}</Text>
      </View>

      <View
        style={[
          styles.bottom,
          { paddingBottom: Math.max(insets.bottom - 6, 8) },
        ]}
      >
        <View style={styles.effectRow}>
          {DEMO_ORDER.map((e) => {
            const used = usedEffects.has(e);
            return (
              <Pressable
                key={e}
                onPress={() => send(e)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.effectChip,
                  used && styles.effectChipUsed,
                  pressed && styles.effectChipPressed,
                  busy && styles.effectChipBusy,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: used, disabled: busy }}
                accessibilityLabel={`Send with ${EFFECT_LABEL[e]}`}
              >
                {({ pressed }) => (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.effectChipText,
                      used && styles.effectChipTextUsed,
                      pressed && styles.effectChipTextPressed,
                    ]}
                  >
                    {EFFECT_LABEL[e]}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.composer}>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write something"
              placeholderTextColor="#6E6E73"
              style={styles.input}
              multiline
              keyboardAppearance="dark"
              accessibilityLabel="Message"
            />
            {draft.trim() ? (
              <Pressable
                onPress={sendPlain}
                onLongPress={openSheet}
                delayLongPress={350}
                style={styles.send}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityHint="Hold to send with an effect"
              >
                <Text style={styles.sendArrow}>↑</Text>
              </Pressable>
            ) : null}
          </View>
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
    paddingBottom: 8,
  },
  runGap: {
    marginBottom: 4,
  },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: IM_CHROME,
  },
  backButton: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: IM_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  contactName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  bottom: {
    backgroundColor: IM_BG,
  },
  // One row, in the order the demo means them to be pressed.
  effectRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  effectChip: {
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  effectChipUsed: {
    borderColor: 'rgba(45,125,106,0.6)',
    backgroundColor: 'rgba(45,125,106,0.2)',
  },
  effectChipPressed: {
    borderColor: IM_BLUE,
    backgroundColor: IM_BLUE,
    transform: [{ scale: 0.94 }],
  },
  // Noa is typing: hold the row until the reply lands.
  effectChipBusy: {
    opacity: 0.4,
  },
  effectChipText: {
    color: '#D1D1D6',
    fontSize: 12,
    fontWeight: '600',
  },
  effectChipTextUsed: {
    color: '#8FD3C1',
  },
  effectChipTextPressed: {
    color: '#fff',
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 11,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
  },
  inputWrap: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: IM_CHROME,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 3,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    maxHeight: 110,
    paddingTop: 7,
    paddingBottom: 7,
  },
  send: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: IM_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendArrow: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
    marginTop: -2,
  },
});
