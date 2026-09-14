export type EffectId =
  | 'none'
  | 'echo'
  | 'spotlight'
  | 'confetti'
  | 'fireworks'
  | 'lasers';

export const SCREEN_EFFECTS = [
  'echo',
  'spotlight',
  'confetti',
  'fireworks',
  'lasers',
] as const satisfies readonly EffectId[];
export type ScreenEffectId = (typeof SCREEN_EFFECTS)[number];

export const EFFECT_LABEL: Record<EffectId, string> = {
  none: 'None',
  echo: 'Echo',
  spotlight: 'Spotlight',
  confetti: 'Confetti',
  fireworks: 'Fireworks',
  lasers: 'Lasers',
};

export function isScreenEffect(e: EffectId): e is ScreenEffectId {
  return (SCREEN_EFFECTS as readonly string[]).includes(e);
}

export type Message = {
  id: string;
  from: 'me' | 'them';
  text: string;
  effect: EffectId;
  time: string;
};

/** A rect in window (screen) logical px, y-down. */
export type Rect = { x: number; y: number; w: number; h: number };

/** What a screen effect needs to know about the bubble it plays for. */
export type BubbleTarget = {
  rect: Rect;
  /** A view-shot of the bubble, present once captured; echo needs it. */
  snapshotUri: string | null;
};
