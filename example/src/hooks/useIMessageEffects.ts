import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EFFECT_LABEL,
  isScreenEffect,
  type BubbleTarget,
  type EffectId,
  type Message,
  type ScreenEffectId,
} from '../components/imessage/types';

// iMessage starts the screen effect a beat after the bubble lands, so the eye
// has something to anchor the effect to.
export const EFFECT_START_DELAY_MS = 150;

// A scripted demo. It opens with one text from Kacper; each effect has its
// own line from "me" written to match the effect's energy, and Kacper answers
// a beat later, except after the spotlight, which needs the last word.
// Fond, not bitter: the jokes are about the reasoning, not the people.
const OPENER = 'shopify is going back to native 💀';

type Step = { effect: ScreenEffectId; me: string; reply: string | null };
const STEPS: Step[] = [
  {
    effect: 'echo',
    me: 'back to native? from what, react NATIVE?',
    reply: 'they let the agents rewrite the app twice',
  },
  {
    effect: 'lasers',
    me: 'we deleted the bridge. they added two codebases and an agent',
    reply: 'they rebuilt shop in 12 weeks though',
  },
  {
    effect: 'fireworks',
    me: '12 weeks and zero pod installs. jealous honestly',
    reply: 'still shipping flashlist fixes though',
  },
  {
    effect: 'confetti',
    me: "flashlist does 1M a week. you don't just leave that",
    reply: 'so what do we do',
  },
  {
    effect: 'spotlight',
    me: 'keep shipping. react native for the win',
    reply: null,
  },
];

/** The effects in the order the demo means them to be used. */
export const DEMO_ORDER: ScreenEffectId[] = STEPS.map((s) => s.effect);

/** The beat between the effect ending and Kacper's reply landing. */
export const REPLY_DELAY_MS = 450;
/** If an effect never reports finishing, reply anyway after this long. */
const REPLY_FALLBACK_MS = 8000;

/** What a button or the debug hook sends once the script has run out. */
export const DEFAULT_TEXT: Record<EffectId, string> = {
  none: 'hello from the new architecture',
  echo: 'back to native',
  spotlight: 'read the january post again',
  confetti: 'skia hit 2M downloads a week 🎉',
  fireworks: 'new arch is the default now',
  lasers: 'hermes go brrr',
};

export type Playing = {
  /** Increments per play so the same effect can play twice in a row. */
  key: number;
  effect: EffectId;
  messageId: string;
};

// Every bubble that a screen effect plays for reports its window rect (and
// snapshot) here once laid out, so the effect can start where the bubble is.
const targets = new Map<string, BubbleTarget>();
const targetWaiters = new Map<string, ((t: BubbleTarget) => void)[]>();

export function reportTarget(id: string, target: BubbleTarget) {
  targets.set(id, target);
  const waiters = targetWaiters.get(id);
  if (waiters) {
    targetWaiters.delete(id);
    waiters.forEach((w) => w(target));
  }
}

export function forgetTarget(id: string) {
  targets.delete(id);
}

function waitForTarget(
  id: string,
  needSnapshot: boolean
): Promise<BubbleTarget> {
  const have = targets.get(id);
  if (have && (!needSnapshot || have.snapshotUri)) {
    return Promise.resolve(have);
  }
  return new Promise((resolve) => {
    const list = targetWaiters.get(id) ?? [];
    list.push((t) => {
      if (!needSnapshot || t.snapshotUri) {
        resolve(t);
      } else {
        waitForTarget(id, true).then(resolve);
      }
    });
    targetWaiters.set(id, list);
  });
}

// Message ids carry the mount time so that a Fast Refresh, which re-evaluates
// this module, cannot hand out an id that a bubble already holds.
let nextId = 1;
const MOUNT = Date.now().toString(36);
function newId() {
  return `m${MOUNT}-${nextId++}`;
}
function stamp() {
  const d = new Date();
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The conversation and the one screen effect that can play at a time. `send`
 * appends a real bubble; when it carries a screen effect, the effect starts
 * once the bubble has laid out and reported where it is (and, for echo, has
 * been snapshotted), never sooner than the iMessage beat.
 */
export function useIMessageEffects() {
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: 's0', from: 'them', text: OPENER, effect: 'none', time: stamp() },
  ]);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const playKey = useRef(0);
  // Steps already spoken; a second press of the same effect falls back to
  // the default line and gets no reply.
  const spoken = useRef(new Set<ScreenEffectId>());
  // Kacper's next line, held until the effect has finished playing. While it
  // is held, presses are ignored so a quick run of taps cannot post three
  // lines before his first answer lands.
  const pendingReply = useRef<{
    text: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const deliverReply = useCallback(() => {
    const pending = pendingReply.current;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pendingReply.current = null;
    setBusy(false);
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        from: 'them',
        text: pending.text,
        effect: 'none',
        time: stamp(),
      },
    ]);
  }, []);

  const send = useCallback(
    (effect: EffectId, text?: string) => {
      if (pendingReply.current !== null) {
        return null;
      }
      let body = text?.trim();
      let reply: string | null = null;
      if (!body) {
        const step = STEPS.find((st) => st.effect === effect);
        if (step && !spoken.current.has(step.effect)) {
          spoken.current.add(step.effect);
          body = step.me;
          reply = step.reply;
        } else {
          body = DEFAULT_TEXT[effect];
        }
      }
      if (!body) {
        return null;
      }
      const id = newId();
      const msg: Message = {
        id,
        from: 'me',
        text: body,
        effect,
        time: stamp(),
      };
      setMessages((prev) => [...prev, msg]);
      if (isScreenEffect(effect)) {
        const startedAt = Date.now();
        waitForTarget(id, effect === 'echo').then(() => {
          const wait = Math.max(
            0,
            EFFECT_START_DELAY_MS - (Date.now() - startedAt)
          );
          setTimeout(() => {
            playKey.current += 1;
            setPlaying({ key: playKey.current, effect, messageId: id });
          }, wait);
        });
      }
      // Kacper waits for the effect to end (finishPlaying schedules the
      // delivery), with a fallback in case it never reports back.
      if (reply !== null) {
        setBusy(true);
        pendingReply.current = {
          text: reply,
          timer: setTimeout(deliverReply, REPLY_FALLBACK_MS),
        };
        if (!isScreenEffect(effect)) {
          setTimeout(deliverReply, REPLY_DELAY_MS);
        }
      }
      return id;
    },
    [deliverReply]
  );

  const finishPlaying = useCallback(
    (key: number) => {
      setPlaying((p) => (p && p.key === key ? null : p));
      if (pendingReply.current !== null) {
        setTimeout(deliverReply, REPLY_DELAY_MS);
      }
    },
    [deliverReply]
  );

  const getTarget = useCallback((id: string) => targets.get(id) ?? null, []);

  useEffect(
    () => () => {
      targets.clear();
      targetWaiters.clear();
      if (pendingReply.current !== null) {
        clearTimeout(pendingReply.current.timer);
      }
    },
    []
  );

  return { messages, playing, busy, send, finishPlaying, getTarget };
}

/**
 * Dev-only globals so the simulator can drive the screen without the
 * keyboard or a long-press:
 *  - `__imsgSend(effect, text?)` — append an outgoing bubble and play its
 *    effect; `effect` is one of none, echo, spotlight, confetti,
 *    fireworks, lasers. Returns the new message id.
 *  - `__imsgState()` — the messages and what is playing.
 */
export function useIMessageDebugHooks(
  send: (effect: EffectId, text?: string) => string | null,
  getMessages: () => Message[],
  getPlaying: () => Playing | null
) {
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as Record<string, unknown>;
    g.__imsgSend = (effect: EffectId = 'none', text?: string) => {
      if (!(effect in EFFECT_LABEL)) {
        throw new Error(`unknown effect ${String(effect)}`);
      }
      return send(effect, text);
    };
    g.__imsgState = () => ({
      messages: getMessages().map((m) => ({
        id: m.id,
        from: m.from,
        effect: m.effect,
        text: m.text,
      })),
      playing: getPlaying(),
    });
    return () => {
      delete g.__imsgSend;
      delete g.__imsgState;
    };
  }, [getMessages, getPlaying, send]);
}
