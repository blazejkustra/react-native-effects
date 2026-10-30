import { memo } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { colors, SCREEN_MARGIN, type } from '../../catalog/theme';
import type { Effect } from '../../catalog/effects';
import { EffectRow } from './EffectRow';
import { OverlayCaption } from './OverlayCaption';
import { PressableScale } from './PressableScale';

const POSTER_ASPECT = 0.62;
const POSTER_GAP = 12;
const POSTER_WIDTH_RATIO = 0.6;
const TILE_SIZE = 148;
const ORB_SIZE = 132;
const LEAD_ASPECT = 1.15;
const WIDE_ASPECT = 16 / 10;
const WALL_GAP = 2;
const WALL_ASPECTS = [
  [0.72, 1.05, 0.8, 0.9, 1, 0.76],
  [1.05, 0.74, 0.95, 0.72, 0.84, 1.1],
];

export type LayoutProps = {
  effects: Effect[];
  onOpen: (effect: Effect) => void;
};

function EffectImage({
  effect,
  style,
}: {
  effect: Effect;
  style: StyleProp<ImageStyle>;
}) {
  return <Image source={effect.image} style={[styles.image, style]} />;
}

function chunkPairs<T>(items: T[]) {
  const pairs: T[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    pairs.push(items.slice(index, index + 2));
  }
  return pairs;
}

export const PosterRail = memo(function PosterRail({
  effects,
  onOpen,
}: LayoutProps) {
  const { width } = useWindowDimensions();
  const posterWidth = Math.round(width * POSTER_WIDTH_RATIO);

  return (
    <FlatList
      horizontal
      data={effects}
      keyExtractor={(effect) => effect.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
      snapToInterval={posterWidth + POSTER_GAP}
      decelerationRate="fast"
      initialNumToRender={3}
      renderItem={({ item }) => (
        <PressableScale
          onPress={() => onOpen(item)}
          accessibilityLabel={item.title}
          accessibilityHint={item.line}
          style={{ width: posterWidth }}
        >
          <EffectImage
            effect={item}
            style={[
              styles.rounded,
              { width: posterWidth, height: posterWidth / POSTER_ASPECT },
            ]}
          />
          <Text style={[type.captionTitle, styles.caption]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={type.captionLine} numberOfLines={2}>
            {item.line}
          </Text>
        </PressableScale>
      )}
      ItemSeparatorComponent={PosterGap}
    />
  );
});

function PosterGap() {
  return <View style={styles.posterGap} />;
}

export const Diptych = memo(function Diptych({ effects, onOpen }: LayoutProps) {
  return (
    <View style={styles.diptych}>
      {effects.map((effect, index) => (
        <PressableScale
          key={effect.id}
          onPress={() => onOpen(effect)}
          accessibilityLabel={effect.title}
          accessibilityHint={effect.line}
          style={index === 0 ? styles.diptychWide : styles.diptychNarrow}
        >
          <EffectImage effect={effect} style={styles.fill} />
          <OverlayCaption effect={effect} />
        </PressableScale>
      ))}
    </View>
  );
});

export const LeadStory = memo(function LeadStory({
  effects,
  onOpen,
}: LayoutProps) {
  const { width } = useWindowDimensions();
  const [lead, ...rest] = effects;
  if (!lead) {
    return null;
  }

  return (
    <View>
      <PressableScale
        onPress={() => onOpen(lead)}
        accessibilityLabel={lead.title}
        accessibilityHint={lead.line}
      >
        <EffectImage
          effect={lead}
          style={{ width, height: width / LEAD_ASPECT }}
        />
        <OverlayCaption effect={lead} showLine />
      </PressableScale>
      <View style={styles.leadRows}>
        <EffectRows effects={rest} onOpen={onOpen} />
      </View>
    </View>
  );
});

export const TileRail = memo(function TileRail({
  effects,
  onOpen,
}: LayoutProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
    >
      {chunkPairs(effects).map((pair, column) => (
        <View
          key={pair[0]?.id}
          style={[styles.tileColumn, column % 2 === 1 && styles.tileColumnDrop]}
        >
          {pair.map((effect) => (
            <PressableScale
              key={effect.id}
              onPress={() => onOpen(effect)}
              accessibilityLabel={effect.title}
              accessibilityHint={effect.line}
              style={styles.tile}
            >
              <EffectImage effect={effect} style={styles.tileImage} />
              <Text
                style={[type.captionTitle, styles.caption]}
                numberOfLines={1}
              >
                {effect.title}
              </Text>
            </PressableScale>
          ))}
        </View>
      ))}
    </ScrollView>
  );
});

export const WideStack = memo(function WideStack({
  effects,
  onOpen,
}: LayoutProps) {
  const { width } = useWindowDimensions();
  const imageWidth = width - SCREEN_MARGIN * 2;

  return (
    <View style={styles.wideStack}>
      {effects.map((effect) => (
        <PressableScale
          key={effect.id}
          onPress={() => onOpen(effect)}
          accessibilityLabel={effect.title}
          accessibilityHint={effect.line}
          style={styles.wide}
        >
          <EffectImage
            effect={effect}
            style={{ width: imageWidth, height: imageWidth / WIDE_ASPECT }}
          />
          <OverlayCaption effect={effect} showLine />
        </PressableScale>
      ))}
    </View>
  );
});

export const OrbRail = memo(function OrbRail({ effects, onOpen }: LayoutProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
    >
      {effects.map((effect) => (
        <PressableScale
          key={effect.id}
          onPress={() => onOpen(effect)}
          accessibilityLabel={effect.title}
          accessibilityHint={effect.line}
          style={styles.orb}
        >
          <EffectImage effect={effect} style={styles.orbImage} />
          <Text
            style={[type.captionTitle, styles.orbTitle]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.5}
          >
            {effect.title}
          </Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
});

export const EffectRows = memo(function EffectRows({
  effects,
  onOpen,
}: LayoutProps) {
  return (
    <View>
      {effects.map((effect, index) => (
        <EffectRow
          key={effect.id}
          effect={effect}
          onOpen={onOpen}
          showSeparator={index < effects.length - 1}
        />
      ))}
    </View>
  );
});

export const LightWall = memo(function LightWall({
  effects,
  onOpen,
}: LayoutProps) {
  const { width } = useWindowDimensions();
  const columnWidth = (width - WALL_GAP) / 2;
  const columns = [
    effects.filter((_, index) => index % 2 === 0),
    effects.filter((_, index) => index % 2 === 1),
  ];

  return (
    <View style={styles.wall}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={styles.wallColumn}>
          {column.map((effect, index) => (
            <PressableScale
              key={effect.id}
              onPress={() => onOpen(effect)}
              accessibilityLabel={effect.title}
              accessibilityHint={effect.line}
            >
              <EffectImage
                effect={effect}
                style={{
                  width: columnWidth,
                  height:
                    columnWidth / (WALL_ASPECTS[columnIndex]?.[index] ?? 1),
                }}
              />
              <OverlayCaption effect={effect} />
            </PressableScale>
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  image: {
    width: '100%',
    backgroundColor: colors.surface,
  },
  fill: {
    height: '100%',
  },
  rounded: {
    borderRadius: 16,
  },
  railContent: {
    paddingHorizontal: SCREEN_MARGIN,
  },
  caption: {
    marginTop: 10,
  },
  posterGap: {
    width: POSTER_GAP,
  },
  diptych: {
    flexDirection: 'row',
    gap: WALL_GAP,
    aspectRatio: 1.05,
  },
  diptychWide: {
    flex: 3,
  },
  diptychNarrow: {
    flex: 2,
  },
  leadRows: {
    marginTop: 8,
  },
  tileColumn: {
    gap: 16,
    marginRight: 12,
  },
  tileColumnDrop: {
    marginTop: 28,
  },
  tile: {
    width: TILE_SIZE,
  },
  tileImage: {
    height: TILE_SIZE,
    borderRadius: 14,
  },
  wideStack: {
    gap: 12,
    paddingHorizontal: SCREEN_MARGIN,
  },
  wide: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  orb: {
    width: ORB_SIZE,
    marginRight: 16,
    alignItems: 'center',
  },
  orbImage: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
  },
  orbTitle: {
    marginTop: 10,
    textAlign: 'center',
  },
  wall: {
    flexDirection: 'row',
    gap: WALL_GAP,
  },
  wallColumn: {
    flex: 1,
    gap: WALL_GAP,
  },
});
