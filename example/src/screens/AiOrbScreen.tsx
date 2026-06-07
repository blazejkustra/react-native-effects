import { View, Text, StyleSheet, StatusBar, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThinkingOrb from '../components/ThinkingOrb';
import { useAudioReactive } from '../hooks/useAudioReactive';
import { BackButton } from '../components/BackButton';

export default function AiOrbScreen() {
  const insets = useSafeAreaInsets();
  const { paramsSynchronizable, listening, error, toggle } = useAudioReactive();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#06070a" />

      <View style={styles.center}>
        <View style={styles.orbWrap}>
          <ThinkingOrb
            paramsSynchronizable={paramsSynchronizable}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <Text style={styles.caption}>
          {listening ? 'Listening…' : 'Thinking…'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        <Pressable
          style={[styles.mic, listening && styles.micOn]}
          onPress={toggle}
        >
          <Text style={styles.micGlyph}>🎙️</Text>
        </Pressable>
        <Text style={styles.hint}>
          {listening ? 'Speak — the orb reacts' : 'Tap to talk to it'}
        </Text>
      </View>

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
    backgroundColor: '#06070a',
  },
  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbWrap: {
    width: '100%',
    aspectRatio: 1,
  },
  caption: {
    marginTop: 8,
    color: '#9a9aa8',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  footer: {
    alignItems: 'center',
  },
  mic: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#15161d',
    borderWidth: 1,
    borderColor: '#23242e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  micOn: {
    backgroundColor: '#2a1f4d',
    borderColor: '#6b4bd6',
  },
  micGlyph: {
    fontSize: 26,
  },
  hint: {
    color: '#8a8a99',
    fontSize: 14,
    fontWeight: '600',
  },
});
