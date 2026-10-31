import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import type { CameraView } from 'expo-camera';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type PolaroidCameraHandle = {
  /** Null when no real camera is available or the capture failed. */
  takePhoto: () => Promise<string | null>;
  blink: () => void;
};

type ExpoCamera = typeof import('expo-camera');

type LiveCapture = Pick<PolaroidCameraHandle, 'takePhoto'>;

/** Throws on a binary built before expo-camera was added. */
function loadExpoCamera(): ExpoCamera | null {
  try {
    return require('expo-camera');
  } catch {
    return null;
  }
}

const expoCamera = loadExpoCamera();

const STRIPE = ['#d8d4cb', '#8b8880'];
const WINDOW_SIZE = 164;
export const CAMERA_BODY_HEIGHT = 216;

function CameraPrompt({
  canAsk,
  onAsk,
}: {
  canAsk: boolean;
  onAsk: () => void;
}) {
  return (
    <Pressable
      onPress={canAsk ? onAsk : Linking.openSettings}
      accessibilityRole="button"
      style={styles.prompt}
    >
      <Text style={styles.promptText}>
        {canAsk ? 'Use camera' : 'Open Settings'}
      </Text>
    </Pressable>
  );
}

/** The live feed and the permission prompt, over the fallback photo. */
function LiveViewfinder({
  ref,
  expo,
}: {
  ref: Ref<LiveCapture>;
  expo: ExpoCamera;
}) {
  const [permission, requestPermission] = expo.useCameraPermissions();
  const [ready, setReady] = useState(false);
  const camera = useRef<CameraView>(null);
  const allowed = permission?.granted === true;

  useImperativeHandle(
    ref,
    () => ({
      takePhoto: async () => {
        if (!ready) {
          return null;
        }
        const photo = await camera.current?.takePictureAsync({
          quality: 0.8,
          shutterSound: false,
        });
        return photo?.uri ?? null;
      },
    }),
    [ready]
  );

  return (
    <>
      {allowed ? (
        <expo.CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          animateShutter={false}
          onCameraReady={() => setReady(true)}
        />
      ) : null}
      {permission && !allowed ? (
        <CameraPrompt
          canAsk={permission.canAskAgain}
          onAsk={requestPermission}
        />
      ) : null}
    </>
  );
}

/**
 * The back of the camera: print slot along the top edge, a square viewfinder
 * and the shutter. The window shows the live camera once allowed. Without
 * permission or a working session (the simulator never gets one, and would
 * return a generated placeholder image) it shows the bundled photo the next
 * shot will print.
 */
export default function PolaroidCamera({
  ref,
  fallbackPhoto,
  bottomInset,
  slotWidth,
  onShutter,
}: {
  ref: Ref<PolaroidCameraHandle>;
  fallbackPhoto: ImageSourcePropType;
  bottomInset: number;
  slotWidth: number;
  onShutter: () => void;
}) {
  const live = useRef<LiveCapture>(null);
  const shade = useSharedValue(0);

  useImperativeHandle(
    ref,
    () => ({
      takePhoto: async () => (await live.current?.takePhoto()) ?? null,
      blink: () => {
        shade.value = withSequence(
          withTiming(1, { duration: 40 }),
          withTiming(0, { duration: 220 })
        );
      },
    }),
    [shade]
  );

  const shadeStyle = useAnimatedStyle(() => ({ opacity: shade.value }));

  return (
    <View style={[styles.body, { height: CAMERA_BODY_HEIGHT + bottomInset }]}>
      <View style={[styles.slot, { width: slotWidth }]} />
      <View style={styles.stripe}>
        {STRIPE.map((color) => (
          <View key={color} style={[styles.band, { backgroundColor: color }]} />
        ))}
      </View>

      <View style={styles.bezel}>
        <View style={styles.window}>
          <Image
            source={fallbackPhoto}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          {expoCamera ? <LiveViewfinder ref={live} expo={expoCamera} /> : null}
          <Animated.View
            style={[styles.shade, shadeStyle]}
            pointerEvents="none"
          />
        </View>
      </View>

      <Pressable
        onPress={onShutter}
        accessibilityRole="button"
        accessibilityLabel="Take a photo"
        hitSlop={16}
        style={({ pressed }) => [
          styles.shutterRing,
          pressed && styles.shutterPressed,
        ]}
      >
        <View style={styles.shutter} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 26,
    backgroundColor: '#191817',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
  },
  slot: {
    position: 'absolute',
    top: 8,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#050505',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  stripe: {
    position: 'absolute',
    left: 34,
    top: 0,
    bottom: 0,
    width: 30,
    flexDirection: 'row',
  },
  band: {
    flex: 1,
  },
  bezel: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: '#0a0a0a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  window: {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
  },
  prompt: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  promptText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  shutterRing: {
    position: 'absolute',
    right: 26,
    top: 72,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
  },
  shutter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e2402c',
    borderWidth: 3,
    borderColor: '#b52d1d',
  },
});
