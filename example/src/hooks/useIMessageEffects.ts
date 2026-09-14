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

// Two React Native people reading Shopify's "back to native" post together.
// Fond, not bitter: the jokes are about the reasoning, not the people.
const SEED: Message[] = [
  {
    id: 's1',
    from: 'them',
    text: 'did you see shopify is going back to native',
    effect: 'none',
    time: '9:41',
  },
  {
    id: 's2',
    from: 'me',
    text: 'back to native? react native is native. the clue is in the name',
    effect: 'none',
    time: '9:41',
  },
  {
    id: 's3',
    from: 'them',
    text: 'january: react native is the future. september: we don\u2019t hold on to a decision just because it was successful',
    effect: 'none',
    time: '9:42',
  },
  {
    id: 's4',
    from: 'me',
    text: 'so the plan is writing every screen twice again, but this time a robot does the typing',
    effect: 'none',
    time: '9:42',
  },
  {
    id: 's5',
    from: 'them',
    text: '\u201cfewer layers between us and the platform\u201d says the team adding an agent layer',
    effect: 'none',
    time: '9:43',
  },
  {
    id: 's6',
    from: 'me',
    text: 'rebuilt shop in 12 weeks. that is 12 weeks nobody had to run pod install',
    effect: 'none',
    time: '9:43',
  },
  {
    id: 's7',
    from: 'them',
    text: 'they are still shipping flashlist fixes though. 2M downloads a week will do that to you',
    effect: 'none',
    time: '9:44',
  },
  {
    id: 's8',
    from: 'me',
    text: 'love them for it honestly. we will keep the lights on',
    effect: 'none',
    time: '9:44',
  },
];

/** What the dev row and the debug hook send when no text is given. */
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
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const playKey = useRef(0);

  const send = useCallback((effect: EffectId, text?: string) => {
    const body = (text ?? DEFAULT_TEXT[effect]).trim();
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
