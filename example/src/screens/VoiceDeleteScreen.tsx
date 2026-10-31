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
  IG_AVATAR as AVATAR,
  IG_BG as BG,
  IG_CARD_AVATAR as CARD_AVATAR,
  IG_CARD_PHOTO as CARD_IMAGE,
  IG_ICONS as ICONS,
  IG_MUTED as MUTED,
  IG_POST_PHOTO as POST_IMAGE,
  IG_SURFACE as SURFACE,
} from '../components/instagram/icons';

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

export default function VoiceDeleteScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const headerHeight = insets.top + 56;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={[
          styles.thread,
          { paddingTop: headerHeight, paddingBottom: insets.bottom + 70 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.row}>
          <View style={styles.postCard}>
            <Image source={POST_IMAGE} style={styles.postImage} />
            <Text style={styles.captionText}>
              Last light on the ridge trail, about an hour from the car park.
            </Text>
          </View>
        </View>

        <Text style={styles.date}>Saturday 10:10</Text>

        <View style={styles.row}>
          <View style={styles.photoCard}>
            <Image source={CARD_IMAGE} style={styles.photoImage} />
            <View style={styles.photoHeader}>
              <Image source={CARD_AVATAR} style={styles.photoAvatar} />
              <Text style={styles.photoUser} numberOfLines={1}>
                Morning fog
              </Text>
            </View>
            <View style={styles.playButton}>
              <Icon source={ICONS.play} size={18} />
            </View>
          </View>
        </View>

        <Text style={styles.seen}>Read</Text>
      </ScrollView>

      {/* Header */}
      <View style={[styles.header, { height: headerHeight }]}>
        <View style={styles.headerRow}>
          <CircleButton
            size={44}
            color={BG}
            onPress={() => navigation.goBack()}
            label="Back"
          >
            <Icon source={ICONS.back} size={24} />
          </CircleButton>
          <Image source={AVATAR} style={styles.avatar} />
          <View style={styles.headerText}>
            <Text style={styles.name}>Juno</Text>
            <Text style={styles.active}>Back on Monday</Text>
          </View>
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
  postCard: {
    width: 248,
    borderRadius: 13,
    borderTopRightRadius: 3,
    backgroundColor: SURFACE,
    overflow: 'hidden',
  },
  postImage: {
    width: 248,
    height: 200,
  },
  captionText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    lineHeight: 20,
  },

  date: {
    marginTop: 22,
    marginBottom: 14,
    textAlign: 'center',
    color: MUTED,
    fontSize: 12,
  },

  photoCard: {
    width: 180,
    height: 300,
    borderRadius: 13,
    borderTopRightRadius: 3,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  photoImage: {
    ...StyleSheet.absoluteFill,
    width: 180,
    height: 300,
  },
  photoHeader: {
    position: 'absolute',
    left: 10,
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  photoUser: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  playButton: {
    position: 'absolute',
    left: 70,
    top: 130,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },

  seen: {
    marginTop: 8,
    marginRight: 6,
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
    paddingLeft: 6,
    paddingRight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 4,
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
