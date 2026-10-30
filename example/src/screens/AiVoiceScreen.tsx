import { MicGlyph } from '../components/catalog/Glyphs';
import { View, Text, StyleSheet, StatusBar, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VoiceWave from '../components/VoiceWave';
import { useAudioReactive } from '../hooks/useAudioReactive';

export default function AiVoiceScreen() {
  const insets = useSafeAreaInsets();
  const { paramsSynchronizable, listening, error, toggle } = useAudioReactive();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.title}>
          {listening ? 'Listening…' : 'Tap to talk'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.center}>
        <View style={styles.waveWrap}>
          <VoiceWave
            paramsSynchronizable={paramsSynchronizable}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 28 }]}>
        <Pressable
          style={[styles.mic, listening && styles.micOn]}
          onPress={toggle}
        >
          <MicGlyph />
        </Pressable>
        <Text style={styles.hint}>
          {listening ? 'Tap to stop' : 'Tap to speak'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06070a',
  },
  header: {
    paddingHorizontal: 26,
  },
  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveWrap: {
    width: '100%',
    height: 200,
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
  hint: {
    color: '#8a8a99',
    fontSize: 14,
    fontWeight: '600',
  },
});
