/* eslint-disable react-native/no-inline-styles */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ShimmerSweep from '../components/ShimmerSweep';

const THINK_MS = 2600;

const QUESTION = 'What can I cook with eggs, spinach and feta?';

const ANSWER =
  'A quick frittata would work well. Wilt the spinach in a little butter, pour over four beaten eggs, crumble in the feta and cook gently until just set. Finish under the grill for a golden top.';

/** Grey placeholder lines that the iridescent shimmer sweeps across. */
function Skeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.line, { width: '92%' }]} />
      <View style={[styles.line, { width: '100%' }]} />
      <View style={[styles.line, { width: '78%' }]} />
      <View style={[styles.line, { width: '46%' }]} />
    </View>
  );
}

export default function AiShimmerScreen() {
  const insets = useSafeAreaInsets();
  const [thinking, setThinking] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!thinking) {
      return;
    }
    timer.current = setTimeout(() => setThinking(false), THINK_MS);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [thinking]);

  const regenerate = useCallback(() => {
    setThinking(true);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={styles.title}>Assistant</Text>
        <Text style={styles.subtitle}>
          {thinking ? 'Generating…' : 'Recipe ideas'}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{QUESTION}</Text>
          </View>
        </View>

        <View style={styles.aiRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarGlyph}>✦</Text>
          </View>
          <View style={styles.aiBubble}>
            {thinking ? (
              <>
                <Skeleton />
                <ShimmerSweep
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              </>
            ) : (
              <Text style={styles.aiText}>{ANSWER}</Text>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={styles.regenBtn}
          onPress={regenerate}
          disabled={thinking}
        >
          <Text style={styles.regenText}>
            {thinking ? 'Generating…' : '↺  Regenerate'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b10',
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c24',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8a8a99',
    fontWeight: '500',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    paddingTop: 26,
  },
  userRow: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: '#3b3bff',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
  },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1c1c28',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarGlyph: {
    color: '#b7a4ff',
    fontSize: 17,
    fontWeight: '700',
  },
  aiBubble: {
    flex: 1,
    minHeight: 96,
    backgroundColor: '#16161f',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    padding: 16,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  aiText: {
    color: '#e8e8f0',
    fontSize: 16,
    lineHeight: 24,
  },
  skeletonWrap: {
    gap: 11,
  },
  line: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2a2a38',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1c1c24',
  },
  regenBtn: {
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  regenText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
