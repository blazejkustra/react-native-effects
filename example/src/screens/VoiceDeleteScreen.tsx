import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VoiceComposer from '../components/instagram/VoiceComposer';
import {
  IG_BG as BG,
  IG_ICONS as ICONS,
  IG_MUTED as MUTED,
  IG_SURFACE as SURFACE,
} from '../components/instagram/icons';

// Instagram DM thread clone. The chrome (icons, colours, spacing) mirrors the
// real app; the people, posts and copy are placeholders.

const AVATAR = { uri: 'https://picsum.photos/seed/rne-dm-avatar/200/200' };
const POST_IMAGE = { uri: 'https://picsum.photos/seed/rne-dm-post/720/612' };
const REEL_IMAGE = { uri: 'https://picsum.photos/seed/rne-dm-reel/480/870' };
const REEL_AVATAR = {
  uri: 'https://picsum.photos/seed/rne-dm-reel-av/100/100',
};

function Icon({
  source,
  size,
  color = '#fff',
}: {
  source: number;
  size: number;
  color?: string;
}) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}

function CircleButton({
  size,
  color,
  children,
  style,
  onPress,
  label,
}: {
  size: number;
  color: string;
  children: React.ReactNode;
  style?: object;
  onPress?: () => void;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

function MessageActions({ top }: { top: number }) {
  return (
    <View style={[styles.actions, { marginTop: top }]}>
      <View style={styles.actionCircle}>
        <Icon source={ICONS.share} size={16} />
      </View>
      <View style={[styles.actionCircle, { marginTop: 14 }]}>
        <Icon source={ICONS.bookmark} size={16} />
      </View>
    </View>
  );
}

export default function VoiceDeleteScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const headerHeight = insets.top + 56;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BG} translucent />

      <ScrollView
        contentContainerStyle={[
          styles.thread,
          { paddingTop: headerHeight, paddingBottom: insets.bottom + 70 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Shared post */}
        <View style={styles.row}>
          <MessageActions top={15} />
          <View style={styles.postCard}>
            <Image source={POST_IMAGE} style={styles.postImage} />
            <View style={styles.aiPill}>
              <Icon source={ICONS.info} size={18} />
              <Text style={styles.aiPillText}>AI info</Text>
            </View>
            <View style={styles.postCaption}>
              <Text style={styles.captionText} numberOfLines={3}>
                <Text style={styles.captionUser}>reanimated_daily </Text>
                Tomasz Zawadzki is the goat 🐐
              </Text>
            </View>
            <View style={styles.reaction}>
              <Text style={styles.reactionText}>❤️</Text>
            </View>
          </View>
        </View>

        <Text style={styles.date}>16 AUG AT 10:10</Text>

        {/* Shared reel */}
        <View style={styles.row}>
          <MessageActions top={104} />
          <View style={styles.reelCard}>
            <Image source={REEL_IMAGE} style={styles.reelImage} />
            <View style={styles.reelShade} />
            <View style={styles.reelHeader}>
              <Image source={REEL_AVATAR} style={styles.reelAvatar} />
              <Text style={styles.reelUser} numberOfLines={2}>
                yarn_ios_enjoyer and the…
              </Text>
            </View>
            <Text style={styles.reelCaption}>
              What it's like living with someone who runs pod install a lot?
            </Text>
            <View style={styles.playButton}>
              <Icon source={ICONS.play} size={18} />
            </View>
            <View style={styles.reelBadge}>
              <Icon source={ICONS.play} size={9} color="#1c1c1c" />
            </View>
          </View>
        </View>

        <Text style={styles.seen}>Seen</Text>
      </ScrollView>

      {/* Header */}
      <View style={[styles.header, { height: headerHeight }]}>
        <View style={styles.headerRow}>
          <CircleButton
            size={44}
            color={SURFACE}
            onPress={() => navigation.goBack()}
            label="Back"
          >
            <Icon source={ICONS.back} size={24} />
          </CircleButton>
          <Image source={AVATAR} style={styles.avatar} />
          <View style={styles.headerText}>
            <Text style={styles.name}>
              Metro Bundler <Text style={styles.chevron}>›</Text>
            </Text>
            <Text style={styles.active}>Bundling 99% for 22m</Text>
          </View>
          <CircleButton size={44} color={SURFACE}>
            <Icon source={ICONS.phone} size={24} />
          </CircleButton>
          <CircleButton size={44} color={SURFACE} style={{ marginLeft: 12 }}>
            <Icon source={ICONS.video} size={24} />
          </CircleButton>
        </View>
        {/* Fade the thread out under the header. */}
        <View style={styles.headerFade} pointerEvents="none">
          {[0.85, 0.7, 0.55, 0.4, 0.25, 0.12, 0.04].map((o, i) => (
            <View
              key={i}
              style={{ flex: 1, backgroundColor: BG, opacity: o }}
            />
          ))}
        </View>
      </View>

      {/* Composer */}
      <View style={[styles.composerWrap, { bottom: insets.bottom + 9 }]}>
        <VoiceComposer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  thread: {
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  actions: {
    marginRight: 9,
    alignItems: 'center',
  },
  actionCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Post card
  postCard: {
    width: 240,
    borderRadius: 16,
    backgroundColor: SURFACE,
    overflow: 'visible',
  },
  postImage: {
    width: 240,
    height: 204,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#3a4a5a',
  },
  aiPill: {
    position: 'absolute',
    left: 8,
    top: 204 - 8 - 30,
    height: 30,
    paddingLeft: 7,
    paddingRight: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(18,16,14,0.82)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiPillText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  postCaption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 50,
    justifyContent: 'center',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  captionText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 17,
  },
  captionUser: {
    fontWeight: '700',
  },
  reaction: {
    position: 'absolute',
    left: 5,
    bottom: -23,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 13,
  },

  date: {
    marginTop: 42,
    marginBottom: 23,
    textAlign: 'center',
    color: MUTED,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  // Reel card
  reelCard: {
    width: 160,
    height: 289,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  reelImage: {
    ...StyleSheet.absoluteFill,
    width: 160,
    height: 289,
  },
  reelShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 70,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  reelHeader: {
    position: 'absolute',
    left: 19,
    top: 13,
    right: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reelAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#555',
  },
  reelUser: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  reelCaption: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 55,
    color: '#fff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    fontStyle: 'italic',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
  playButton: {
    position: 'absolute',
    left: 60,
    top: 125,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  reelBadge: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 1,
  },

  seen: {
    marginTop: 8,
    marginRight: 14,
    textAlign: 'right',
    color: MUTED,
    fontSize: 12,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: BG,
    justifyContent: 'flex-end',
  },
  headerRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 11,
    backgroundColor: '#444',
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '400',
  },
  active: {
    color: MUTED,
    fontSize: 13,
    marginTop: 1,
  },
  headerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    height: 28,
  },

  // Composer
  composerWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
  },
});
