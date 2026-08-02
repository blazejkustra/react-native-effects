import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ComponentType,
} from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewProps,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import LeatherMaterial from '../components/materials/LeatherMaterial';
import WoodMaterial from '../components/materials/WoodMaterial';
import SandMaterial from '../components/materials/SandMaterial';
import FabricMaterial from '../components/materials/FabricMaterial';
import FrostMaterial from '../components/materials/FrostMaterial';
import MetalMaterial from '../components/materials/MetalMaterial';

type MaterialProps = ViewProps & { expanded?: boolean };

type MaterialDef = {
  key: string;
  /** The small line: which particular one of this material it is. */
  caption: string;
  /** The big line: the material itself. */
  title: string;
  /** What this material does under a finger, shown briefly when it opens. */
  hint: string;
  Component: ComponentType<MaterialProps>;
};

const MATERIALS: MaterialDef[] = [
  {
    key: 'leather',
    caption: 'Full-grain, cognac tan',
    title: 'Leather',
    hint: 'Tap to re-dye the hide',
    Component: LeatherMaterial,
  },
  {
    key: 'fabric',
    caption: 'Woven linen, undyed',
    title: 'Fabric',
    hint: 'Drag the ball across the cloth',
    Component: FabricMaterial,
  },
  {
    key: 'sand',
    caption: 'Wind-rippled dune, low sun',
    title: 'Sand',
    hint: 'Write in the sand',
    Component: SandMaterial,
  },
  {
    key: 'wood',
    caption: 'Flat-sawn walnut, oiled',
    title: 'Wood',
    hint: 'Drag to burn the board',
    Component: WoodMaterial,
  },
  {
    key: 'frost',
    caption: 'Window pane at night',
    title: 'Frost',
    hint: 'Wipe the glass clear',
    Component: FrostMaterial,
  },
  {
    key: 'metal',
    caption: 'Brushed stainless, wet',
    title: 'Metal',
    hint: 'Hold to pool water — it runs',
    Component: MetalMaterial,
  },
];

const CARD_HEIGHT = 122;
const CARD_RADIUS = 30;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * A stack of material banners. Tapping a banner morphs it into a full-screen
 * view of the material: the full-screen shader is mounted at its final window
 * size inside a clipping container that animates from the card's rect to the
 * whole screen (so the WebGPU canvas itself never resizes mid-flight), with a
 * counter-translation keeping it screen-aligned during the reveal.
 */
export default function MaterialsScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [expanded, setExpanded] = useState<{
    def: MaterialDef;
    rect: Rect;
  } | null>(null);
  const progress = useSharedValue(0);
  // Shows what the open material responds to, then gets out of the way.
  const hint = useSharedValue(0);
  const cardRefs = useRef<
    Record<string, ComponentRef<typeof Pressable> | null>
  >({});
  const navigation = useNavigation();

  // The expanded materials are drawing surfaces — the stack's back-swipe pan
  // steals horizontal strokes (a left-to-right drag gets cancelled after
  // ~25pt), so the gesture is off while a material is open.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !expanded });
  }, [navigation, expanded]);

  const open = (def: MaterialDef) => {
    const node = cardRefs.current[def.key];
    if (!node || expanded) {
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setExpanded({ def, rect: { x, y, width, height } });
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: 480,
        easing: Easing.out(Easing.cubic),
      });
      hint.value = 0;
      hint.value = withDelay(
        420,
        withSequence(
          withTiming(1, { duration: 260 }),
          withDelay(2400, withTiming(0, { duration: 600 }))
        )
      );
    });
  };

  const close = () => {
    hint.value = withTiming(0, { duration: 140 });
    progress.value = withTiming(
      0,
      { duration: 380, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(setExpanded)(null);
        }
      }
    );
  };

  const rect = expanded?.rect;

  const containerStyle = useAnimatedStyle(() => {
    if (!rect) {
      return { opacity: 0 };
    }
    const p = progress.value;
    return {
      // The expanded material renders a different pattern window than the
      // card, so a hard cut reads as a jarring texture swap. Crossfade the
      // overlay in over the growing card instead — the real card stays
      // visible beneath while the fullscreen material develops on top. This
      // also hides the first blank frame of the fresh WebGPU canvas.
      opacity: interpolate(p, [0, 0.45], [0, 1], Extrapolation.CLAMP),
      top: interpolate(p, [0, 1], [rect.y, 0]),
      left: interpolate(p, [0, 1], [rect.x, 0]),
      width: interpolate(p, [0, 1], [rect.width, winW]),
      height: interpolate(p, [0, 1], [rect.height, winH]),
      borderRadius: interpolate(p, [0, 1], [CARD_RADIUS, 0]),
    };
  }, [rect, winW, winH]);

  // Counter-translate the full-screen shader so it stays screen-aligned while
  // the clipping window grows over it.
  const innerStyle = useAnimatedStyle(() => {
    if (!rect) {
      return {};
    }
    const p = progress.value;
    return {
      top: -interpolate(p, [0, 1], [rect.y, 0]),
      left: -interpolate(p, [0, 1], [rect.x, 0]),
    };
  }, [rect]);

  const closeFade = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.65, 1], [0, 1]),
  }));

  const hintFade = useAnimatedStyle(() => ({
    opacity: hint.value,
    transform: [{ translateY: interpolate(hint.value, [0, 1], [8, 0]) }],
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {MATERIALS.map((def) => (
          <Pressable
            key={def.key}
            ref={(r) => {
              cardRefs.current[def.key] = r;
            }}
            style={styles.card}
            onPress={() => open(def)}
          >
            <def.Component style={StyleSheet.absoluteFill} />
            <View style={styles.textWrap} pointerEvents="none">
              <Text style={styles.caption}>{def.caption}</Text>
              <Text style={styles.title}>{def.title}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View
        style={[styles.backWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>

      {expanded && rect && (
        <Animated.View style={[styles.overlay, containerStyle]}>
          <Animated.View
            style={[
              // eslint-disable-next-line react-native/no-inline-styles
              { position: 'absolute', width: winW, height: winH },
              innerStyle,
            ]}
          >
            <expanded.def.Component expanded style={StyleSheet.absoluteFill} />
          </Animated.View>

          {/* No label copy here: while the overlay is still translucent the
              card's own labels show through, and by the time it turns opaque
              the material has taken over. */}
          <Animated.View
            style={[styles.closeWrap, { top: insets.top + 6 }, closeFade]}
          >
            <Pressable style={styles.closeButton} onPress={close} hitSlop={12}>
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </Animated.View>

          <Animated.View
            style={[styles.hintWrap, { bottom: insets.bottom + 26 }, hintFade]}
            pointerEvents="none"
          >
            <View style={styles.hintPill}>
              <Text style={styles.hintText}>{expanded.def.hint}</Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingHorizontal: 14,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#070708',
    justifyContent: 'center',
    marginBottom: 14,
  },
  textWrap: {
    paddingHorizontal: 26,
  },
  // White throughout, so the shadows have to carry legibility on the pale
  // materials (sand, linen, frost) as well as the dark ones.
  caption: {
    color: 'rgba(255, 255, 255, 0.86)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.62)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 9,
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
  overlay: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#070708',
    zIndex: 200,
  },
  closeWrap: {
    position: 'absolute',
    right: 22,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(20, 20, 24, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeGlyph: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 17,
    fontWeight: '600',
  },
  hintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(18, 18, 22, 0.58)',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
