import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import appConfig from '../../app.json';
import { Chevron } from '../components/catalog/Glyphs';
import { colors, SCREEN_MARGIN, SERIF } from '../catalog/theme';

const REPOSITORY_URL = 'https://github.com/blazejkustra/react-native-effects';

const LINKS = [
  {
    title: 'Privacy Policy',
    url: `${REPOSITORY_URL}/blob/main/docs/privacy-policy.md`,
  },
  {
    title: 'Credits and Licenses',
    url: `${REPOSITORY_URL}/blob/main/docs/credits.md`,
  },
  { title: 'Source Code', url: REPOSITORY_URL },
];

function LinkRow({
  title,
  url,
  isLast,
}: {
  title: string;
  url: string;
  isLast: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    >
      <View style={[styles.linkBody, !isLast && styles.linkSeparator]}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Chevron />
      </View>
    </Pressable>
  );
}

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Image
        source={require('../../assets/icon.png')}
        style={styles.icon}
        accessibilityIgnoresInvertColors
      />
      <Text style={styles.name} accessibilityRole="header">
        {appConfig.expo.name}
      </Text>
      <Text style={styles.version}>Version {appConfig.expo.version}</Text>
      <Text style={styles.description}>
        Shaders you can tilt, blow on, shake and break. Every effect renders
        live on your iPhone&apos;s GPU, built with the open-source
        react-native-effects library.
      </Text>
      <View style={styles.links}>
        {LINKS.map((link, index) => (
          <LinkRow
            key={link.url}
            title={link.title}
            url={link.url}
            isLast={index === LINKS.length - 1}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  content: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: SCREEN_MARGIN,
  },
  icon: {
    width: 88,
    height: 88,
    borderRadius: 20,
  },
  name: {
    marginTop: 16,
    fontFamily: SERIF,
    fontSize: 30,
    fontWeight: '600',
    color: colors.text,
  },
  version: {
    marginTop: 4,
    fontSize: 15,
    color: colors.secondary,
  },
  description: {
    marginTop: 20,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    color: colors.secondary,
  },
  links: {
    alignSelf: 'stretch',
    marginTop: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  link: {
    paddingLeft: 16,
  },
  linkPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  linkBody: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingRight: 16,
  },
  linkSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  linkTitle: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
  },
});
