import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
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
import ScreenEffectPlayer from '../components/imessage/ScreenEffectPlayer';
import {
  EFFECT_LABEL,
  isScreenEffect,
  type BubbleTarget,
  type ScreenEffectId,
} from '../components/imessage/types';
import {
  DEMO_ORDER,
  forgetTarget,
  reportTarget,
  useIMessageDebugHooks,
  useIMessageEffects,
} from '../hooks/useIMessageEffects';

// A made-up chat. Each chip sends the draft with its screen effect. With an
// empty draft it posts the next scripted line, and Noa answers a beat later.

const CONTACT = 'Noa';
const HEADER_H = 56;

export default function IMessageScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { messages, playing, busy, send, finishPlaying, getTarget } =
    useIMessageEffects();
  const [draft, setDraft] = useState('');
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

  const sendWithEffect = useCallback(
    (effect: ScreenEffectId) => {
      send(effect, draft);
      setDraft('');
    },
    [draft, send]
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
                onPress={() => sendWithEffect(e)}
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
              placeholderTextColor="#8FA6A0"
              style={styles.input}
              multiline
              keyboardAppearance="dark"
              accessibilityLabel="Message"
            />
            {draft.trim() ? (
              <Pressable
                onPress={sendPlain}
                style={styles.send}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Text style={styles.sendArrow}>↑</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {player}
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
