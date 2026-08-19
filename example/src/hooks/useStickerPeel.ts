import { useCallback, useEffect } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  runOnUI,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useParamsSynchronizable } from 'react-native-effects';
import { STICKER_LIVE_REST, type StickerLayout } from '../components/Sticker';

/**
 * Wrap angle the sheet holds while it is off the surface. A held sticker is not
 * flat — it is a peeled sticker being carried, so it keeps a standing curl. At
 * this wrap the footprint only foreshortens ~8%: alive, not distorted.
 */
const HELD_WRAP = 0.7;
/** Extra wrap the curl gains at speed, so the sheet visibly flexes as it moves. */
const HELD_WRAP_FLEX = 0.45;
/** Drag speed (px/s) at which the flex saturates. */
const FLEX_FULL_SPEED = 2000;
/** Conical lift while held — one corner hangs lower, like a carried sheet. */
const HELD_CONE = 0.32;

/**
 * Wrap angle at the free edge as the sticker presses down, from a gentle
 * set-down to a thrown slam. Past PI/2 the crest tips far enough to show a
 * sliver of backing.
 */
const STICK_WRAP_MIN = 1.4;
const STICK_WRAP_MAX = 2.5;
/** Drop speed (px/s) at which the press reaches its hardest. */
const SLAM_SPEED = 2200;

/**
 * While peeling, the sheet folds back over itself: past PI the backing faces
 * the camera. Stopping a little past PI keeps some of the face in view the
 * whole way — wrap it much further and the sticker disappears into its own roll
 * within the first fifth of the animation and the rest reads as a freeze.
 */
const PEEL_WRAP = 3.2;
/**
 * Roll radius the material settles into once peeling, in sticker heights. Big
 * enough that the wrap angle keeps growing right through the animation instead
 * of saturating early.
 */
const PEEL_RADIUS = 0.3;
/**
 * How far the peel has to get before the sticker comes away. Detaching here
 * rather than at the spring's end cuts out the tail, where the sheet is fully
 * rolled and nothing visibly changes — that dead beat is what made the removal
 * read as a grey object sitting still.
 */
const DETACH_AT = 0.25;

/** Hover height while a sticker is held, in sticker heights. */
const DRAG_LIFT = 0.11;
/** Release speed (px/s) below which the drop has no clear direction. */
const DIRECTIONAL_DROP = 260;
/** Drag speed (px/s) below which the peel axis stops chasing the motion. */
const AXIS_TRACK_MIN = 60;

/**
 * Step an angle toward a target the short way round. Chasing a raw target
 * across the +/-PI seam would spin the curl the long way instead of easing it.
 */
function approachAngle(current: number, target: number, rate: number): number {
  'worklet';
  let delta = target - current;
  while (delta > Math.PI) {
    delta -= 2 * Math.PI;
  }
  while (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }
  return current + delta * rate;
}

/**
 * A channel the screen uses to carry a sticker out of the tray. Only one spawn
 * can be in flight at a time, so a single set of shared values is enough —
 * and the freshly mounted sticker can read the drag that is already underway
 * without the tray having to reach into it.
 */
export type SpawnChannel = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  velocityX: SharedValue<number>;
  velocityY: SharedValue<number>;
  /** 1 while the finger is still carrying it. */
  active: SharedValue<number>;
};

type StickerPeelOptions = {
  layout: StickerLayout;
  /** Where the sticker's centre starts, in screen points. */
  x: number;
  y: number;
  /** Play the press-down the moment it mounts, as if it was just dropped. */
  stickOnMount?: boolean;
  /**
   * Mount already lifted and curled, mid-drag. Used by stickers dragged out of
   * the tray, which appear under a finger that is already moving.
   */
  startHeld?: boolean;
  /** Follow `spawn` until the finger that pulled this sticker out lets go. */
  spawn?: SpawnChannel;
  /** Called once a peeled sticker has flown off and can be unmounted. */
  onRemoved?: () => void;
};

/**
 * Drives one sticker: the springs behind the stick / peel roll, the transform
 * while it is dragged around, and the gestures that switch between them.
 *
 * The sticker is never "flat, then suddenly bent". Picking it up IS a small
 * peel, carrying it holds that curl and flexes it with the motion, and putting
 * it down just rolls the curl that is already there back onto the surface — one
 * continuous piece of material through every state.
 *
 * The roll parameters live in a synchronizable the shader's render loop reads
 * every frame, so the animation never touches the JS thread — the springs run
 * on the UI thread and write straight into the channel.
 */
export function useStickerPeel({
  layout,
  x: initialX,
  y: initialY,
  stickOnMount = true,
  startHeld = false,
  spawn,
  onRemoved,
}: StickerPeelOptions) {
  const { paramsSynchronizable } = useParamsSynchronizable(STICKER_LIVE_REST);

  // Placement.
  const x = useSharedValue(initialX);
  const y = useSharedValue(initialY);
  const rotation = useSharedValue(0);
  const userScale = useSharedValue(1);
  const savedRotation = useSharedValue(0);
  const savedScale = useSharedValue(1);
  // Hover scale-up while held and the press-on squash are kept apart from the
  // user's pinch so neither clobbers the other.
  const holdScale = useSharedValue(startHeld ? 1.06 : 1);
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const tilt = useSharedValue(0);

  // The roll. A sticker that mounts under a moving finger starts already
  // peeled off its sheet rather than flat.
  const front = useSharedValue(startHeld ? 0 : 1);
  const axis = useSharedValue(Math.PI / 2);
  const rMin = useSharedValue(0.02);
  const wMax = useSharedValue(startHeld ? HELD_WRAP : 0.02);
  const cone = useSharedValue(startHeld ? HELD_CONE : 0);
  const lift = useSharedValue(startHeld ? DRAG_LIFT : 0);
  const alpha = useSharedValue(1);

  // Once the peel starts the sticker stops taking input — otherwise the pan
  // that Race cancels in favour of the long press would immediately glue it
  // back down.
  const peeling = useSharedValue(0);
  const detached = useSharedValue(0);
  const held = useSharedValue(startHeld ? 1 : 0);
  // A sticker rides the spawn channel exactly once. Without the latch it would
  // still be listening when the NEXT sticker is pulled out of the tray, and
  // teleport across the board to that finger.
  const spawnSpent = useSharedValue(0);
  /**
   * Whether a long press may peel this sticker. A carried sticker mounts under
   * a finger that is already down, and that in-flight touch can reach the
   * freshly mounted view and satisfy its long press — peeling a sticker the
   * moment it is placed. Arming only after the drag is well over closes that.
   */
  const armed = useSharedValue(startHeld ? 0 : 1);

  // Push the roll parameters into the shader channel whenever one changes.
  useAnimatedReaction(
    () => [
      front.value,
      axis.value,
      rMin.value,
      wMax.value,
      cone.value,
      lift.value,
      alpha.value,
    ],
    (values) => {
      paramsSynchronizable.setBlocking(() =>
        Float64Array.of(
          values[0]!,
          values[1]!,
          values[2]!,
          values[3]!,
          values[4]!,
          values[5]!,
          values[6]!,
          0
        )
      );
    },
    [paramsSynchronizable]
  );

  const settle = useCallback(() => {
    'worklet';
    // The last moment of the press: the sticker squashes against the surface
    // and springs back. Small on purpose — more reads as a bounce, not a press.
    squashX.value = withSequence(
      withTiming(1.016, { duration: 70 }),
      withSpring(1, { damping: 9, stiffness: 300 })
    );
    squashY.value = withSequence(
      withTiming(0.985, { duration: 70 }),
      withSpring(1, { damping: 9, stiffness: 300 })
    );
  }, [squashX, squashY]);

  /**
   * Lift it off the surface. This is a small peel, not a flattening: the
   * contact line runs off the near edge and the sheet keeps a standing curl for
   * as long as it is carried.
   */
  const pickUp = useCallback(() => {
    'worklet';
    if (peeling.value === 1 || held.value === 1) {
      return;
    }
    held.value = 1;
    cancelAnimation(front);
    cancelAnimation(wMax);
    cancelAnimation(squashX);
    cancelAnimation(squashY);
    squashX.value = withTiming(1, { duration: 120 });
    squashY.value = withTiming(1, { duration: 120 });

    wMax.value = withTiming(HELD_WRAP, {
      duration: 210,
      easing: Easing.out(Easing.quad),
    });
    front.value = withTiming(0, {
      duration: 230,
      easing: Easing.out(Easing.cubic),
    });
    cone.value = withTiming(HELD_CONE, { duration: 230 });
    rMin.value = withTiming(0.02, { duration: 200 });
    lift.value = withSpring(DRAG_LIFT, { damping: 20, stiffness: 190 });
    holdScale.value = withSpring(1.06, { damping: 18, stiffness: 200 });
  }, [
    peeling,
    held,
    front,
    wMax,
    cone,
    rMin,
    lift,
    holdScale,
    squashX,
    squashY,
  ]);

  /**
   * One frame of carrying it. The curl flexes with speed and the peel axis
   * trails the motion, so the free edge is always the one lagging behind —
   * which is also the edge that will lift last when it goes back down.
   */
  const dragTo = useCallback(
    (nextX: number, nextY: number, velocityX: number, velocityY: number) => {
      'worklet';
      if (peeling.value === 1) {
        return;
      }
      x.value = nextX;
      y.value = nextY;

      const speed = Math.hypot(velocityX, velocityY);
      tilt.value = Math.max(-0.13, Math.min(0.13, velocityX / 5200));

      // Approach rather than assign: the first frames of a drag arrive while
      // pickUp's ramp is still running, and snapping would undo it.
      const target =
        HELD_WRAP + Math.min(1, speed / FLEX_FULL_SPEED) * HELD_WRAP_FLEX;
      wMax.value = wMax.value + (target - wMax.value) * 0.15;

      if (speed > AXIS_TRACK_MIN) {
        // Screen Y grows downward, UV Y grows upward. The axis runs from the
        // leading edge toward the trailing one.
        const aim = Math.atan2(velocityY, -velocityX) - rotation.value;
        axis.value = approachAngle(axis.value, aim, 0.12);
      }
    },
    [peeling, x, y, tilt, wMax, axis, rotation]
  );

  /**
   * Put it down. Nothing about the curl is re-derived here — it is already
   * curled and already aimed from the carry, so the contact line just rolls it
   * back onto the surface. How hard it presses follows how fast it was moving.
   */
  const glue = useCallback(
    (velocityX: number, velocityY: number) => {
      'worklet';
      if (peeling.value === 1) {
        return;
      }
      held.value = 0;
      const speed = Math.hypot(velocityX, velocityY);

      // The carry already aimed the axis; only a decisive throw re-points it.
      if (speed > DIRECTIONAL_DROP) {
        axis.value = Math.atan2(velocityY, -velocityX) - rotation.value;
      }
      cone.value = withTiming(0, { duration: 180 });
      rMin.value = 0.02;

      const wrap =
        STICK_WRAP_MIN +
        Math.min(1, speed / SLAM_SPEED) * (STICK_WRAP_MAX - STICK_WRAP_MIN);
      wMax.value = withTiming(wrap, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
      front.value = withSpring(
        1,
        { damping: 18, stiffness: 80, mass: 1.0 },
        (finished) => {
          if (finished) {
            settle();
          }
        }
      );

      lift.value = withTiming(0, { duration: 170 });
      holdScale.value = withSpring(1, { damping: 20, stiffness: 210 });
      tilt.value = withSpring(0, { damping: 15, stiffness: 170 });
    },
    [
      peeling,
      held,
      axis,
      rotation,
      cone,
      rMin,
      front,
      wMax,
      lift,
      holdScale,
      tilt,
      settle,
    ]
  );

  /**
   * It comes away. Not a fade in place — it keeps rolling as it goes and is
   * flung along the peel axis, the direction it was being pulled.
   */
  const flyOff = useCallback(() => {
    'worklet';
    if (detached.value === 1) {
      return;
    }
    detached.value = 1;

    const heading = axis.value + rotation.value;
    const dirX = Math.cos(heading);
    const dirY = -Math.sin(heading);
    const DISTANCE = 640;
    const DURATION = 430;
    const ease = Easing.in(Easing.quad);

    x.value = withTiming(x.value + dirX * DISTANCE, {
      duration: DURATION,
      easing: ease,
    });
    y.value = withTiming(
      y.value + dirY * DISTANCE,
      { duration: DURATION, easing: ease },
      (finished) => {
        if (finished && onRemoved) {
          runOnJS(onRemoved)();
        }
      }
    );
    rotation.value = withTiming(rotation.value + 1.1, {
      duration: DURATION,
      easing: ease,
    });
    holdScale.value = withTiming(0.82, { duration: DURATION });
    // The roll keeps closing on the way out, so it never freezes mid-air.
    wMax.value = withTiming(PEEL_WRAP + 1.3, { duration: DURATION });
    alpha.value = withDelay(DURATION - 130, withTiming(0, { duration: 130 }));
  }, [detached, axis, rotation, x, y, holdScale, wMax, alpha, onRemoved]);

  /**
   * The reverse: a corner lifts, the curl travels across, and it releases.
   * `originAngle` is where on the sticker the finger was, in local UV radians —
   * the peel starts at the corner you actually pressed.
   */
  const peel = useCallback(
    (originAngle: number) => {
      'worklet';
      // Deliberately no `held` guard: the pan's onBegin has already run pickUp
      // by the time a long press resolves, so every peel starts from the held
      // state. `armed` is what keeps a stray in-flight touch out.
      if (peeling.value === 1 || armed.value !== 1) {
        return;
      }
      peeling.value = 1;
      held.value = 0;
      cancelAnimation(front);
      cancelAnimation(wMax);
      // A real peel starts at a corner, so the contact line goes diagonal and
      // the roll tightens toward one side of it.
      axis.value = originAngle;
      cone.value = withTiming(0.5, { duration: 220 });
      rMin.value = withTiming(PEEL_RADIUS, { duration: 220 });
      wMax.value = withTiming(PEEL_WRAP, { duration: 260 });
      lift.value = withTiming(0.05, { duration: 300 });
      holdScale.value = withSpring(1.03, { damping: 18, stiffness: 180 });
      front.value = withDelay(
        80,
        // Slightly under-damped: an over-damped spring spends its whole long
        // tail parked at the fully-rolled state, where nothing visibly changes.
        withSpring(0, { damping: 17, stiffness: 90, mass: 1.0 }, (finished) => {
          if (finished) {
            flyOff();
          }
        })
      );
    },
    [
      peeling,
      armed,
      held,
      front,
      axis,
      cone,
      rMin,
      wMax,
      lift,
      holdScale,
      flyOff,
    ]
  );

  // Let go the moment the peel has gone far enough, instead of waiting for the
  // spring to finish crawling to zero.
  useAnimatedReaction(
    () => peeling.value === 1 && front.value <= DETACH_AT,
    (ready) => {
      if (ready) {
        flyOff();
      }
    }
  );

  // Carried out of the tray: follow the finger that is already dragging.
  useAnimatedReaction(
    () =>
      spawn ? [spawn.active.value, spawn.x.value, spawn.y.value] : [0, 0, 0],
    (values, previous) => {
      if (!spawn || spawnSpent.value === 1) {
        return;
      }
      if (values[0] === 1) {
        dragTo(
          values[1]!,
          values[2]!,
          spawn.velocityX.value,
          spawn.velocityY.value
        );
      } else if (previous && previous[0] === 1) {
        spawnSpent.value = 1;
        glue(spawn.velocityX.value, spawn.velocityY.value);
        // Arm the long press only once the touch that placed this sticker is
        // long gone.
        armed.value = withDelay(400, withTiming(1, { duration: 1 }));
      }
    }
  );

  // Drop it on the surface the moment it appears.
  useEffect(() => {
    if (!stickOnMount) {
      return;
    }
    runOnUI(() => {
      'worklet';
      // Start from the carried state so the mount press is the same motion as
      // any other put-down, rather than a curl appearing out of a flat sheet.
      front.value = 0;
      wMax.value = HELD_WRAP;
      glue(0, 0);
    })();
  }, [stickOnMount, glue, front, wMax]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      pickUp();
    })
    .onChange((event) => {
      dragTo(
        x.value + event.changeX,
        y.value + event.changeY,
        event.velocityX,
        event.velocityY
      );
    })
    .onEnd((event) => {
      glue(event.velocityX, event.velocityY);
    })
    .onFinalize((_event, success) => {
      if (!success) {
        glue(0, 0);
      }
    });

  const longPress = Gesture.LongPress()
    .minDuration(420)
    .maxDistance(14)
    .onStart((event) => {
      // Peel from the corner under the finger. Gesture coordinates are in the
      // view's own frame, which rotates with the sticker, so this is already
      // local — no need to take the rotation back out.
      const dx = event.x - layout.canvasWidth / 2;
      const dy = event.y - layout.canvasHeight / 2;
      const fromCentre = Math.hypot(dx, dy);
      const origin =
        fromCentre > layout.canvasWidth * 0.08
          ? Math.atan2(-dy, dx)
          : Math.PI * 0.25;
      peel(origin);
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = userScale.value;
      pickUp();
    })
    .onChange((event) => {
      if (peeling.value === 1) {
        return;
      }
      userScale.value = Math.max(
        0.45,
        Math.min(2.6, savedScale.value * event.scale)
      );
    })
    .onEnd(() => {
      glue(0, 0);
    });

  const rotate = Gesture.Rotation()
    .onBegin(() => {
      savedRotation.value = rotation.value;
      pickUp();
    })
    .onChange((event) => {
      if (peeling.value === 1) {
        return;
      }
      rotation.value = savedRotation.value + event.rotation;
    })
    .onEnd(() => {
      glue(0, 0);
    });

  // Race so a still finger reaches the long press while any movement claims the
  // drag; the two-finger gestures run alongside either of them.
  const gesture = Gesture.Simultaneous(
    Gesture.Race(pan, longPress),
    Gesture.Simultaneous(pinch, rotate)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value - layout.canvasWidth / 2 },
      { translateY: y.value - layout.canvasHeight / 2 },
      { rotateZ: `${rotation.value + tilt.value}rad` },
      { scaleX: userScale.value * holdScale.value * squashX.value },
      { scaleY: userScale.value * holdScale.value * squashY.value },
    ],
  }));

  return { paramsSynchronizable, gesture, animatedStyle };
}
