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
  IM_MUTED,
} from '../components/imessage/Bubble';
import {
  Chevron,
  Lock,
  Microphone,
  Plus,
  VideoCamera,
} from '../components/imessage/glyphs';
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

// iMessage clone, dark appearance, laid out from a real Messages thread:
// circular back and video buttons flank a large avatar over the name pill,
// the conversation opens with the iMessage / Encrypted / date block, and the
// composer is a translucent pill whose mic becomes the send arrow once there
// is text. Sending can carry a screen effect (echo, spotlight, confetti,
// fireworks, lasers) that plays once over the chat.
// The demo is scripted: it opens with one text from Kacper, each effect
// button posts the next line with that effect and Kacper answers a beat
// later. Long-press the send arrow for the full effects sheet.

const CONTACT = 'Kacper Kapuściak';
const STARTED = '12 Sep 2026 at 09:41';
// Header: avatar + gap + name pill, measured from the reference.
const HEADER_H = 60 + 6 + 30;

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
  const usedEffects = new Set(
    messages.filter((m) => m.from === 'me').map((m) => m.effect)
  );

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
          { paddingTop: insets.top + HEADER_H + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
      >
        <View style={styles.intro}>
          <Text style={styles.introText}>iMessage</Text>
          <View style={styles.introRow}>
            <Lock color={IM_MUTED} />
            <Text style={styles.introText}>Encrypted</Text>
          </View>
          <Text style={styles.introDate}>{STARTED}</Text>
        </View>
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
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Chevron />
        </Pressable>
        <View style={styles.contact}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{CONTACT[0]}</Text>
          </View>
          <View style={styles.namePill}>
            <Text style={styles.contactName}>{CONTACT}</Text>
            <Chevron color="#8E8E93" size={7} direction="right" />
          </View>
        </View>
        <View
          style={styles.circle}
          accessibilityRole="button"
          accessibilityLabel="FaceTime"
        >
          <VideoCamera />
        </View>
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
                style={({ pressed }) => [
                  styles.effectChip,
                  used && styles.effectChipUsed,
                  pressed && styles.effectChipPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: used }}
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
          <View style={styles.plus}>
            <Plus />
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="iMessage"
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
            ) : (
              <View style={styles.micWrap}>
                <Microphone color="#8E8E93" />
              </View>
            )}
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
  intro: {
    alignItems: 'center',
    gap: 2,
    marginBottom: 14,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  introText: {
    color: IM_MUTED,
    fontSize: 14,
  },
  introDate: {
    color: IM_MUTED,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 18,
  },
  runGap: {
    marginBottom: 4,
  },
  delivered: {
    alignSelf: 'flex-end',
    color: IM_MUTED,
    fontSize: 11,
    fontWeight: '600',
    marginRight: 18,
    marginTop: 3,
  },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    backgroundColor: IM_BG,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: IM_CHROME,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  contact: {
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4A465D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 27,
    fontWeight: '700',
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 30,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 15,
    backgroundColor: IM_CHROME,
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
    borderColor: 'rgba(76,149,247,0.45)',
    backgroundColor: 'rgba(76,149,247,0.12)',
  },
  effectChipPressed: {
    borderColor: IM_BLUE,
    backgroundColor: IM_BLUE,
    transform: [{ scale: 0.94 }],
  },
  effectChipText: {
    color: '#D1D1D6',
    fontSize: 12,
    fontWeight: '600',
  },
  effectChipTextUsed: {
    color: IM_BLUE,
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
  plus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: IM_CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 18,
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
  micWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  send: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
