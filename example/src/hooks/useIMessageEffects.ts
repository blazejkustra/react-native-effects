import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EFFECT_LABEL,
  isScreenEffect,
  type BubbleTarget,
  type EffectId,
  type Message,
} from '../components/imessage/types';

// iMessage starts the screen effect a beat after the bubble lands, so the eye
// has something to anchor the effect to.
export const EFFECT_START_DELAY_MS = 150;

// A scripted demo: it opens with one text from Kacper, every effect button
// posts the next line from "me" with that effect, and Kacper answers a beat
// later, until the script runs out. Fond, not bitter: the jokes are about the
// reasoning, not the people.
type Line = { from: Message['from']; text: string };
const OPENER: Line = {
  from: 'them',
  text: 'shopify is going back to native 💀',
};
const SCRIPT: Line[] = [
  OPENER,
  { from: 'me', text: 'back to native? from what. react native' },
  { from: 'them', text: 'they let the robots rewrite the app twice' },
  { from: 'me', text: 'cross platform: write once, then write again' },
  { from: 'them', text: 'fewer layers, he says, from behind three agents' },
  { from: 'me', text: '12 weeks and zero pod installs. jealous honestly' },
  { from: 'them', text: 'still shipping flashlist fixes though' },
  { from: 'me', text: "2M downloads a week. you don't just leave that" },
  { from: 'them', text: 'so what do we do' },
  { from: 'me', text: 'keep shipping. react native is native btw' },
  { from: 'them', text: 'hermes go brrr 🔥' },
];

/** How long Kacper takes to type his reply. */
export const REPLY_DELAY_MS = 1000;

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

let nextId = 1;
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
    {
      id: 's0',
      from: 'them',
      text: OPENER.text,
      effect: 'none',
      time: stamp(),
    },
  ]);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const playKey = useRef(0);
  // Next unspoken line of the script.
  const scriptPos = useRef(1);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((effect: EffectId, text?: string) => {
    let body = text?.trim();
    if (!body) {
      const line = SCRIPT[scriptPos.current];
      if (line?.from === 'me') {
        body = line.text;
        scriptPos.current += 1;
      } else {
        body = DEFAULT_TEXT[effect];
      }
    }
    if (!body) {
      return null;
    }
    const id = `m${nextId++}`;
    const msg: Message = { id, from: 'me', text: body, effect, time: stamp() };
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
    // Kacper answers a beat later, if the script has a line for him. One
    // pending reply at a time, so mashing buttons does not queue a monologue.
    const reply = SCRIPT[scriptPos.current];
    if (reply?.from === 'them' && replyTimer.current === null) {
      scriptPos.current += 1;
      replyTimer.current = setTimeout(() => {
        replyTimer.current = null;
        setMessages((prev) => [
          ...prev,
          {
            id: `m${nextId++}`,
            from: 'them',
            text: reply.text,
            effect: 'none',
            time: stamp(),
          },
        ]);
      }, REPLY_DELAY_MS);
    }
    return id;
  }, []);

  const finishPlaying = useCallback((key: number) => {
    setPlaying((p) => (p && p.key === key ? null : p));
  }, []);

  const getTarget = useCallback((id: string) => targets.get(id) ?? null, []);

  useEffect(
    () => () => {
      targets.clear();
      targetWaiters.clear();
      if (replyTimer.current !== null) {
        clearTimeout(replyTimer.current);
      }
    },
    []
  );

  return { messages, playing, send, finishPlaying, getTarget };
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
