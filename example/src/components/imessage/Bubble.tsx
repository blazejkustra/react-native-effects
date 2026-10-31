import { useCallback, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, withTiming } from 'react-native-reanimated';
import type { BubbleTarget, Message } from './types';

export const IM_BLUE = '#2D7D6A';
export const IM_GREY = '#2A2F36';
export const IM_BG = '#0E1216';
export const IM_CHROME = '#181E24';
const RADIUS = 12;

type ViewHandle = ComponentRef<typeof View>;

// Measure only once the entrance animation has finished and the thread has
// scrolled to the end; earlier, the rect would be where it was, not where it is.
const ENTER_MS = 260;
const MEASURE_DELAY_MS = ENTER_MS + 60;

// Bubbles ease in from their low corner: a short fade with a slight rise and
// grow, no overshoot.
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
        { scale: withTiming(1, { duration: ENTER_MS, easing: EASE_OUT }) },
        { translateY: withTiming(0, { duration: ENTER_MS, easing: EASE_OUT }) },
      ],
    },
  };
};

type Props = {
  msg: Message;
  /** The last bubble of a run gets a square corner on the sender's side. */
  tail: boolean;
  /** Report the window rect once laid out. */
  onTarget?: (target: BubbleTarget) => void;
};

/**
 * One chat bubble: a real `Text` in a rounded view. A bubble that a screen
 * effect will play for measures itself in the window once laid out.
 */
export default function Bubble({ msg, tail, onTarget }: Props) {
  const mine = msg.from === 'me';
  const bubbleRef = useRef<ViewHandle>(null);
  const reported = useRef(false);

  const onLayout = useCallback(
    (_e: LayoutChangeEvent) => {
      if (reported.current || !onTarget) {
        return;
      }
      reported.current = true;
      setTimeout(() => {
        bubbleRef.current?.measureInWindow((x, y, w, h) =>
          onTarget({ rect: { x, y, w, h } })
        );
      }, MEASURE_DELAY_MS);
    },
    [onTarget]
  );

  const bg = mine ? IM_BLUE : IM_GREY;
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowThem]}>
      <Animated.View
        style={[styles.wrap, mine ? styles.wrapMine : styles.wrapThem]}
        entering={popIn}
      >
        <View
          ref={bubbleRef}
          collapsable={false}
          onLayout={onLayout}
          style={[
            styles.bubble,
            { backgroundColor: bg },
            tail && (mine ? styles.cornerMine : styles.cornerThem),
          ]}
        >
          <Text style={styles.text}>{msg.text}</Text>
        </View>
      </Animated.View>
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
    maxWidth: '74%',
  },
  wrapMine: {
    transformOrigin: 'right bottom',
  },
  wrapThem: {
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
  cornerMine: {
    borderBottomRightRadius: 2,
  },
  cornerThem: {
    borderBottomLeftRadius: 2,
  },
});
