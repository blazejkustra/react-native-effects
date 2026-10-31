import ConfettiEffect from './ConfettiEffect';
import EchoEffect from './EchoEffect';
import FireworksEffect from './FireworksEffect';
import LasersEffect from './LasersEffect';
import SpotlightEffect from './SpotlightEffect';
import type { BubbleTarget, ScreenEffectId } from './types';

type Props = {
  effect: ScreenEffectId;
  target: BubbleTarget;
  onDone: () => void;
};

/**
 * One play of a screen effect for a bubble, as a transparent overlay in
 * front of the chat, drawn above everything; unmount it when `onDone`
 * fires.
 */
export default function ScreenEffectPlayer({ effect, target, onDone }: Props) {
  switch (effect) {
    case 'confetti':
      return <ConfettiEffect onDone={onDone} />;
    case 'fireworks':
      return <FireworksEffect onDone={onDone} />;
    case 'spotlight':
      return <SpotlightEffect rect={target.rect} onDone={onDone} />;
    case 'lasers':
      return <LasersEffect onDone={onDone} />;
    case 'echo':
      return <EchoEffect rect={target.rect} onDone={onDone} />;
  }
}
