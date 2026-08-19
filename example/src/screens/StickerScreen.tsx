import { useCallback, useRef, useState } from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'react-native-effects';
import Sticker, { stickerLayout } from '../components/Sticker';
import { useStickerPeel, type SpawnChannel } from '../hooks/useStickerPeel';

type StickerArt = {
  id: string;
  source: ImageSourcePropType;
  /** Width / height of the source image. */
  aspect: number;
  /** How far the art sits inside the sticker rect, leaving room for the border. */
  inset?: number;
};

const ART: StickerArt[] = [
  {
    id: 'star',
    source: require('../../assets/stickers/star.png'),
    aspect: 1,
  },
  {
    id: 'heart',
    source: require('../../assets/stickers/heart.png'),
    aspect: 1,
  },
  {
    id: 'bolt',
    source: require('../../assets/stickers/bolt.png'),
    aspect: 1,
  },
  {
    id: 'smile',
    source: require('../../assets/stickers/smile.png'),
    aspect: 1,
  },
  {
    // Any transparent PNG works — this one is a real cut-out, not generated art.
    id: 'charizard',
    source: require('../../assets/charizard.png'),
    aspect: 474 / 659,
    inset: 0.92,
  },
];

const STICKER_SIZE = 148;
/** Each sticker is its own WebGPU canvas, so the board is capped. */
const MAX_STICKERS = 6;

type Placed = {
  key: string;
  art: StickerArt;
  x: number;
  y: number;
};

/**
 * A board you can stick things to.
 *
 * Drag a sticker out of the tray and it comes off already curled, hanging from
 * your finger; let go and it presses down where you put it, leading edge first.
 * Drag one that is already stuck and it peels up into your hand the same way.
 * Hold one and it peels off for good — from whichever corner you pressed.
 */
export default function StickerScreen() {
  const navigation = useNavigation();
  const [placed, setPlaced] = useState<Placed[]>([]);
  const counter = useRef(0);

  // One drag out of the tray at a time, so a single channel carries it: the
  // sticker mounts under a finger that is already moving and reads the drag
  // straight off these, instead of the tray reaching into the new component.
  const spawnX = useSharedValue(0);
  const spawnY = useSharedValue(0);
  const spawnVelocityX = useSharedValue(0);
  const spawnVelocityY = useSharedValue(0);
  const spawnActive = useSharedValue(0);
  const spawn: SpawnChannel = {
    x: spawnX,
    y: spawnY,
    velocityX: spawnVelocityX,
    velocityY: spawnVelocityY,
    active: spawnActive,
  };

  // Only the newest sticker follows the spawn channel; everything before it has
  // already been put down.
  const [carriedKey, setCarriedKey] = useState<string | null>(null);

  const add = useCallback((art: StickerArt, atX: number, atY: number) => {
    counter.current += 1;
    const key = `${art.id}-${counter.current}`;
    setPlaced((prev) => [
      ...prev.slice(-(MAX_STICKERS - 1)),
      { key, art, x: atX, y: atY },
    ]);
    setCarriedKey(key);
  }, []);

  const remove = useCallback((key: string) => {
    setPlaced((prev) => prev.filter((item) => item.key !== key));
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      {/* The wall. Static, so it renders once and the loop stops. */}
      <LinearGradient
        startColor="#f4f5f7"
        endColor="#dfe2e8"
        angle={115}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {placed.map((item) => (
        <PlacedSticker
          key={item.key}
          art={item.art}
          x={item.x}
          y={item.y}
          spawn={item.key === carriedKey ? spawn : undefined}
          onRemoved={() => remove(item.key)}
        />
      ))}

      <View style={styles.header} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.back}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Stickers</Text>
        <Text style={styles.subtitle}>
          Drag one out of the tray onto the wall · drag to move · pinch to
          resize · hold to peel it off
        </Text>
      </View>

      <View style={styles.tray}>
        {ART.map((art) => (
          <TraySlot
            key={art.id}
            art={art}
            spawn={spawn}
            onSpawn={(atX, atY) => add(art, atX, atY)}
          />
        ))}
      </View>
    </View>
  );
}

type TraySlotProps = {
  art: StickerArt;
  spawn: SpawnChannel;
  onSpawn: (x: number, y: number) => void;
};

/**
 * A slot in the tray. Dragging off it pulls a sticker out under the finger —
 * the only way to place one, so a sticker always ends up exactly where it was
 * let go rather than somewhere chosen for you.
 */
function TraySlot({ art, spawn, onSpawn }: TraySlotProps) {
  const pan = Gesture.Pan()
    .onStart((event) => {
      spawn.x.value = event.absoluteX;
      spawn.y.value = event.absoluteY;
      spawn.velocityX.value = 0;
      spawn.velocityY.value = 0;
      spawn.active.value = 1;
      runOnJS(onSpawn)(event.absoluteX, event.absoluteY);
    })
    .onChange((event) => {
      spawn.x.value = event.absoluteX;
      spawn.y.value = event.absoluteY;
      spawn.velocityX.value = event.velocityX;
      spawn.velocityY.value = event.velocityY;
    })
    .onEnd((event) => {
      spawn.velocityX.value = event.velocityX;
      spawn.velocityY.value = event.velocityY;
    })
    .onFinalize(() => {
      spawn.active.value = 0;
    });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={styles.traySlot}>
        <Image source={art.source} style={styles.trayArt} />
      </Animated.View>
    </GestureDetector>
  );
}

type PlacedStickerProps = {
  art: StickerArt;
  x: number;
  y: number;
  spawn?: SpawnChannel;
  onRemoved: () => void;
};

function PlacedSticker({ art, x, y, spawn, onRemoved }: PlacedStickerProps) {
  const layout = stickerLayout(STICKER_SIZE, art.aspect);
  // Nothing is drawn until the texture is on the GPU, so the sticker does not
  // flash in as an empty box under the finger.
  const [ready, setReady] = useState(false);
  const onImageLoad = useCallback(() => setReady(true), []);

  const { paramsSynchronizable, gesture, animatedStyle } = useStickerPeel({
    layout,
    x,
    y,
    // Every sticker arrives by being dragged off the tray, so it is always
    // already lifted and curled when it mounts.
    startHeld: true,
    stickOnMount: false,
    spawn,
    onRemoved,
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.sticker,
          { width: layout.canvasWidth, height: layout.canvasHeight },
          animatedStyle,
          !ready && styles.hidden,
        ]}
      >
        <Sticker
          image={art.source}
          layout={layout}
          inset={art.inset}
          paramsSynchronizable={paramsSynchronizable}
          onImageLoad={onImageLoad}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eef0f3',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  back: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(17, 20, 26, 0.06)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(17, 20, 26, 0.1)',
  },
  backText: {
    color: '#2b303a',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    marginTop: 18,
    color: '#171a20',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 6,
    color: '#6c727e',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 300,
  },
  sticker: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  hidden: {
    opacity: 0,
  },
  tray: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(17, 20, 26, 0.06)',
  },
  traySlot: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.04)',
  },
  trayArt: {
    width: 38,
    height: 38,
    resizeMode: 'contain',
  },
});
