import { useCallback, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Animated, { Easing, withTiming } from 'react-native-reanimated';
import type { BubbleTarget, Message, Rect } from './types';

// Colours sampled from a real Messages thread in the dark appearance.
export const IM_BLUE = '#4C95F7';
export const IM_GREY = '#262629';
export const IM_BG = '#000';
export const IM_MUTED = '#8E8E93';
export const IM_CHROME = '#181818';
const RADIUS = 20;

type ViewHandle = ComponentRef<typeof View>;

// Incoming bubbles ease in from their tail corner, the way Messages lands a
// reply: a short fade with a slight rise and grow, no overshoot.
const EASE_OUT = Easing.out(Easing.cubic);
const popIn = () => {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{ scale: 0.94 }, { translateY: 8 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 200, easing: EASE_OUT }),
      transform: [
        { scale: withTiming(1, { duration: 260, easing: EASE_OUT }) },
        { translateY: withTiming(0, { duration: 260, easing: EASE_OUT }) },
      ],
    },
  };
};

// Layout settles a beat after the row mounts (the thread scrolls to the end);
// measuring before that reports where the bubble was, not where it is.
const MEASURE_DELAY_MS = 60;

type Props = {
  msg: Message;
  /** Only the last bubble of a run gets iMessage's tail. */
  tail: boolean;
  /** Report the window rect (and, when asked, a snapshot) once laid out. */
  onTarget?: (target: BubbleTarget) => void;
  wantSnapshot?: boolean;
};

/**
 * One iMessage bubble: a real `Text` in a rounded view with the tail drawn
 * under it. A bubble that a screen effect will play for measures itself in
 * the window once laid out, and snapshots itself when the effect (echo)
 * needs its pixels.
 */
export default function Bubble({
  msg,
  tail,
  onTarget,
  wantSnapshot = false,
}: Props) {
  const mine = msg.from === 'me';
  const bubbleRef = useRef<ViewHandle>(null);
  const reported = useRef(false);

  const onLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      if (reported.current || !onTarget) {
        return;
      }
      reported.current = true;
      setTimeout(async () => {
        const node = bubbleRef.current;
        if (!node) {
          return;
        }
        try {
          const rect = await new Promise<Rect>((resolve) =>
            node.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }))
          );
          let snapshotUri: string | null = null;
          if (wantSnapshot) {
            const raw = await captureRef(bubbleRef, {
              format: 'png',
              quality: 1,
              result: 'tmpfile',
            });
            snapshotUri = raw.startsWith('file://') ? raw : `file://${raw}`;
          }
          onTarget({ rect, snapshotUri });
        } catch (err) {
          if (__DEV__) {
            console.warn('bubble capture failed', err);
          }
        }
      }, MEASURE_DELAY_MS);
    },
    [onTarget, wantSnapshot]
  );

  const bg = mine ? IM_BLUE : IM_GREY;
  // Only replies animate: an outgoing bubble is measured and snapshotted for
  // its effect right after layout, and a transform in flight would skew that.
  const Wrap = mine ? View : Animated.View;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowThem]}>
      <Wrap style={styles.wrap} entering={mine ? undefined : popIn}>
        {tail && (
          <>
            <View
              style={[
                styles.tailA,
                mine ? styles.tailAMine : styles.tailAThem,
                { backgroundColor: bg },
              ]}
            />
            <View
              style={[styles.tailB, mine ? styles.tailBMine : styles.tailBThem]}
            />
          </>
        )}
        <View
          ref={bubbleRef}
          collapsable={false}
          onLayout={onLayout}
          style={[styles.bubble, { backgroundColor: bg }]}
        >
          <Text style={styles.text}>{msg.text}</Text>
        </View>
      </Wrap>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginTop: 5,
    paddingHorizontal: 16,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowThem: {
    justifyContent: 'flex-start',
  },
  wrap: {
    // Messages caps a bubble at about two thirds of the screen.
    maxWidth: '68%',
    transformOrigin: 'left bottom',
  },
  bubble: {
    borderRadius: RADIUS,
    paddingHorizontal: 15,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  text: {
    color: '#fff',
    fontSize: 17,
    lineHeight: 21,
  },
  // The tail is the CSS two-shape trick: a filled corner under the bubble,
  // cut by a ground-coloured shape beside it.
  tailA: {
    position: 'absolute',
    bottom: 0,
    width: 20,
    height: 24,
  },
  tailAMine: {
    right: -8,
    borderBottomLeftRadius: 16,
  },
  tailAThem: {
    left: -8,
    borderBottomRightRadius: 16,
  },
  tailB: {
    position: 'absolute',
    bottom: 0,
    width: 26,
    height: 24,
    backgroundColor: IM_BG,
  },
  tailBMine: {
    right: -26,
    borderBottomLeftRadius: 10,
  },
  tailBThem: {
    left: -26,
    borderBottomRightRadius: 10,
  },
});
