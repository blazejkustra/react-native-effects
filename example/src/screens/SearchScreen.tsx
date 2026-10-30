import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EffectRow } from '../components/catalog/EffectRow';
import { SearchGlyph } from '../components/catalog/Glyphs';
import { searchEffects, type Effect } from '../catalog/effects';
import { colors, SCREEN_MARGIN } from '../catalog/theme';
import type { HomeScreenNavigationProp } from '../types';

function keyExtractor(effect: Effect) {
  return effect.id;
}

export default function SearchScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchEffects(query), [query]);

  const openEffect = useCallback(
    (effect: Effect) => navigation.navigate(effect.screen as never),
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Effect }) => (
      <EffectRow effect={item} onOpen={openEffect} />
    ),
    [openEffect]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <StatusBar barStyle="light-content" />
      <View style={styles.searchRow}>
        <View style={styles.field}>
          <SearchGlyph />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search, or try “tilt”"
            placeholderTextColor={colors.tertiary}
            style={styles.input}
            keyboardAppearance="dark"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            selectionColor={colors.text}
            accessibilityLabel="Search effects"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      <FlatList
        data={results}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={
          <Text style={styles.empty}>No effects match “{query}”.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: SCREEN_MARGIN,
    paddingBottom: 10,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 17,
    color: colors.text,
  },
  cancel: {
    fontSize: 17,
    color: colors.text,
  },
  empty: {
    paddingTop: 48,
    paddingHorizontal: SCREEN_MARGIN,
    fontSize: 16,
    textAlign: 'center',
    color: colors.secondary,
  },
});
