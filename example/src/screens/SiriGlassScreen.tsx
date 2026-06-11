import {
  View,
  Image,
  StyleSheet,
  StatusBar,
  Pressable,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SiriGlassPill from '../components/SiriGlassPill';
import { useAudioReactive } from '../hooks/useAudioReactive';
import { BackButton } from '../components/BackButton';

/**
 * The iOS 26 Siri moment: an iPhone home screen with the Siri liquid-glass
 * capsule hanging from the Dynamic Island — black on top, refractive glass
 * below, the rainbow spectrum wave flowing across the middle.
 * Tap the pill to start listening — the wave moves with your voice.
 */
export default function SiriGlassScreen() {
  const insets = useSafeAreaInsets();
  const { paramsSynchronizable, listening, simulated, error, toggle } =
    useAudioReactive();

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/ios27-wallpaper.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      <StatusBar barStyle="light-content" backgroundColor="transparent" />

      {/* Siri liquid-glass capsule, hanging from the Dynamic Island. */}
      <Pressable
        style={styles.pillWrap}
        onPress={toggle}
        pointerEvents="box-only"
      >
        <SiriGlassPill paramsSynchronizable={paramsSynchronizable} />
      </Pressable>

      <Text style={[styles.hint, { bottom: insets.bottom + 96 }]}>
        {listening
          ? simulated
            ? 'Simulating a voice (no mic) — tap to stop'
            : 'Listening — talk to Siri, tap to stop'
          : 'Tap the glass to talk'}
      </Text>
      {error ? (
        <Text style={[styles.error, { bottom: insets.bottom + 72 }]}>
          {error}
        </Text>
      ) : null}

      <View
        style={[styles.backWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  pillWrap: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
  },
  error: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#ffb4ab',
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 320,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
});
