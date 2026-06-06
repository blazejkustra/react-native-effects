import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useParamsSynchronizable } from 'react-native-effects';
import ScrollReactive from '../components/ScrollReactive';
import { BackButton } from '../components/BackButton';

// A serif face does most of the work of escaping the generic glassy-SaaS look.
// System serifs only — no font loading required.
const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

// Copy kept verbatim — it carries the personality.
const ENTRIES = [
  'Scroll me ↓',
  'The background is a live WebGPU shader',
  'Warp intensity follows your scroll',
  'Colors shift as you go',
  'All running off the main thread',
  'Static screens are so 2024',
  'Keep going…',
  'Built with react-native-effects',
];

export default function ScrollReactiveScreen() {
  const insets = useSafeAreaInsets();
  // Drive the shader straight off the render loop — scrolling must never
  // re-render React. `setParamsSynchronizable` writes (progress, overscroll) into u.params1.
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable();

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const y = contentOffset.y;
      const max = Math.max(1, contentSize.height - layoutMeasurement.height);
      const progress = Math.min(1, Math.max(0, y / max));
      // Rubber-band overscroll past either edge, normalized to screen height:
      // negative above the top, positive below the bottom, 0 while in range.
      const h = Math.max(1, layoutMeasurement.height);
      const over = y < 0 ? y / h : y > max ? (y - max) / h : 0;

      // Push to the shader without touching React state.
      setParamsSynchronizable(progress, over, 0, 0);
    },
    [setParamsSynchronizable]
  );

  console.log('render ScrollReactiveScreen'); // Should only log once per page, never every frame.

  return (
    <View style={styles.container}>
      <ScrollReactive
        paramsSynchronizable={paramsSynchronizable}
        colorA="#34d399"
        colorB="#1d4ed8"
        style={StyleSheet.absoluteFill}
      />

      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <View
        style={[styles.backWrap, { top: insets.top + 6 }]}
        pointerEvents="box-none"
      >
        <BackButton />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 92, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        alwaysBounceVertical
        overScrollMode="always"
      >
        {/* Masthead */}
        <Text style={styles.title}>Scroll Reactive</Text>
        <Text style={styles.deck}>
          A live WebGPU contour map, driven entirely by the scroll.
        </Text>

        {/* Editorial index */}
        {ENTRIES.map((text, i) => {
          const isLast = i === ENTRIES.length - 1;
          return (
            <View key={i} style={styles.entry}>
              <View style={styles.rule} />
              <View style={styles.entryRow}>
                {isLast ? (
                  <Text style={styles.fin}>fin</Text>
                ) : (
                  <Text style={styles.numeral}>{i + 1}</Text>
                )}
                <Text style={[styles.headline, isLast && styles.headlineFin]}>
                  {text}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const GOLD = '#a7f3d0';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 26,
  },

  backWrap: {
    position: 'absolute',
    left: 22,
    zIndex: 100,
  },

  /* Masthead */
  title: {
    fontFamily: SERIF,
    fontSize: 38,
    lineHeight: 42,
    color: '#fff',
    letterSpacing: -0.5,
  },
  deck: {
    fontFamily: SERIF,
    fontSize: 17,
    lineHeight: 26,
    color: 'rgba(255, 255, 255, 0.62)',
    marginTop: 20,
    marginBottom: 26,
    maxWidth: 300,
  },

  /* Index entries */
  entry: {
    paddingVertical: 2,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(167, 243, 208, 0.28)',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 30,
  },
  numeral: {
    width: 56,
    fontFamily: SERIF,
    fontSize: 30,
    lineHeight: 34,
    color: GOLD,
  },
  fin: {
    width: 56,
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontSize: 19,
    lineHeight: 34,
    color: 'rgba(167, 243, 208, 0.7)',
  },
  headline: {
    flex: 1,
    fontFamily: SERIF,
    fontSize: 25,
    lineHeight: 34,
    color: '#fff',
    paddingTop: 1,
  },
  headlineFin: {
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.82)',
  },

  /* Folio */
  folioWrap: {
    position: 'absolute',
    right: 26,
    zIndex: 90,
  },
  folio: {
    fontFamily: SERIF,
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.72)',
    letterSpacing: 1,
  },
  folioDim: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
