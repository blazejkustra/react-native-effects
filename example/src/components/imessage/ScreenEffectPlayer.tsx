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
 * front of the chat, the way iMessage draws them; unmount it when `onDone`
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
      if (!target.snapshotUri) {
        return null;
      }
      return (
        <EchoEffect
          rect={target.rect}
          snapshotUri={target.snapshotUri}
          onDone={onDone}
        />
      );
  }
}
