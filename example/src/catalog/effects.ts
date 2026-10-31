import type { ImageSourcePropType } from 'react-native';
import type { RootStackParamList } from '../types';

export type Effect = {
  id: string;
  title: string;
  line: string;
  screen: keyof RootStackParamList;
  image: ImageSourcePropType;
  hero?: ImageSourcePropType;
};

export type SectionLayout =
  | 'posters'
  | 'diptych'
  | 'lead'
  | 'tiles'
  | 'wide'
  | 'orbs'
  | 'rows'
  | 'wall';

export type CatalogSection = {
  id: string;
  title: string;
  layout: SectionLayout;
  effects: Effect[];
};

export const SECTIONS: CatalogSection[] = [
  {
    id: 'tilt',
    title: 'Tilt it.',
    layout: 'posters',
    effects: [
      {
        id: 'hourglass',
        title: 'Hourglass',
        line: 'Run a focus timer, then flip your phone to restart it',
        screen: 'HourglassExample',
        image: require('../../assets/catalog/hourglass.jpg'),
      },
      {
        id: 'lava-lamp',
        title: 'Lava Lamp',
        line: 'Warm wax rises. Tilt to stir it',
        screen: 'LavaLampExample',
        image: require('../../assets/catalog/lava-lamp.jpg'),
        hero: require('../../assets/catalog/lava-lamp-hero.jpg'),
      },
      {
        id: 'holo-foil',
        title: 'Holo Foil',
        line: 'Rainbow foil that shifts as you tilt',
        screen: 'HoloFoilExample',
        image: require('../../assets/catalog/holo-foil.jpg'),
      },
      {
        id: 'holo-card',
        title: 'Cards',
        line: 'Iridescent bank cards that catch the light',
        screen: 'HoloCardExample',
        image: require('../../assets/catalog/holo-card.jpg'),
      },
    ],
  },
  {
    id: 'blow',
    title: 'Blow on it.',
    layout: 'diptych',
    effects: [
      {
        id: 'birthday-candle',
        title: 'Birthday Candle',
        line: 'Blow on your phone to put it out, tap to relight',
        screen: 'BirthdayCandleExample',
        image: require('../../assets/catalog/birthday-candle.jpg'),
        hero: require('../../assets/catalog/birthday-candle-hero.jpg'),
      },
      {
        id: 'dandelion',
        title: 'Dandelion',
        line: 'Blow on your phone and the seeds drift away',
        screen: 'DandelionExample',
        image: require('../../assets/catalog/dandelion.jpg'),
        hero: require('../../assets/catalog/dandelion-hero.jpg'),
      },
    ],
  },
  {
    id: 'break',
    title: 'Break it.',
    layout: 'lead',
    effects: [
      {
        id: 'cracked-screen',
        title: 'Cracked Screen',
        line: 'Tap and the glass breaks where you hit it',
        screen: 'CrackedScreenExample',
        image: require('../../assets/catalog/cracked-screen.jpg'),
        hero: require('../../assets/catalog/cracked-screen-hero.jpg'),
      },
      {
        id: 'hinge-crack',
        title: 'Hinge Crack',
        line: 'A folding screen gives out along its crease',
        screen: 'HingeCrackExample',
        image: require('../../assets/catalog/hinge-crack.jpg'),
      },
      {
        id: 'crt-off',
        title: 'CRT Off',
        line: 'Switch off like an old TV',
        screen: 'CrtOffExample',
        image: require('../../assets/catalog/crt-off.jpg'),
      },
      {
        id: 'dust',
        title: 'Dust',
        line: 'Tap to snap a card into dust',
        screen: 'DustExample',
        image: require('../../assets/catalog/dust.jpg'),
      },
      {
        id: 'particle-dispersion',
        title: 'Particle Dispersion',
        line: 'Lift the subject and the background blows away as dust',
        screen: 'ParticleDispersionExample',
        image: require('../../assets/catalog/particle-dispersion.jpg'),
      },
    ],
  },
  {
    id: 'touch',
    title: 'Touch it.',
    layout: 'tiles',
    effects: [
      {
        id: 'scratch-off',
        title: 'Scratch-off',
        line: 'Scratch the foil to find three matching symbols',
        screen: 'ScratchOffExample',
        image: require('../../assets/catalog/scratch-off.jpg'),
      },
      {
        id: 'bubble-wrap',
        title: 'Bubble Wrap',
        line: 'Pop every last bubble',
        screen: 'BubbleWrapExample',
        image: require('../../assets/catalog/bubble-wrap.jpg'),
      },
      {
        id: 'flashlight',
        title: 'Flashlight',
        line: 'Tilt a beam around a dark corridor and shape it',
        screen: 'FlashlightExample',
        image: require('../../assets/catalog/flashlight.jpg'),
      },
      {
        id: 'ferrofluid',
        title: 'Ferrofluid',
        line: 'Hold a real magnet near your phone',
        screen: 'FerrofluidExample',
        image: require('../../assets/catalog/ferrofluid.jpg'),
      },
      {
        id: 'metal-card',
        title: 'Metal Card',
        line: 'Tap and the card lifts as light runs across it',
        screen: 'MetalCardExample',
        image: require('../../assets/catalog/metal-card.jpg'),
      },
      {
        id: 'wave-reveal',
        title: 'Wave Reveal',
        line: 'A wave of light carries you from morning to dusk',
        screen: 'WaveRevealExample',
        image: require('../../assets/catalog/wave-reveal.jpg'),
      },
      {
        id: 'touch-field',
        title: 'The Eye',
        line: 'A burning eye that follows your finger',
        screen: 'TouchFieldExample',
        image: require('../../assets/catalog/touch-field.jpg'),
      },
      {
        id: 'lighter',
        title: 'Lighter',
        line: 'Tap to strike. The flame stays upright as you tilt',
        screen: 'LighterExample',
        image: require('../../assets/catalog/lighter.jpg'),
      },
      {
        id: 'beer',
        title: 'Beer',
        line: 'Tilt to slosh, rotate to empty it, tap to refill',
        screen: 'BeerExample',
        image: require('../../assets/catalog/beer.jpg'),
      },
    ],
  },
  {
    id: 'shake',
    title: 'Shake it.',
    layout: 'wide',
    effects: [
      {
        id: 'mystic-ball',
        title: 'Mystic Ball',
        line: 'Shake your phone and the answer surfaces through the mist',
        screen: 'MysticBallExample',
        image: require('../../assets/catalog/mystic-ball.jpg'),
      },
      {
        id: 'instant-camera',
        title: 'Instant Camera',
        line: 'Snap a photo and shake it while it develops',
        screen: 'InstantCameraExample',
        image: require('../../assets/catalog/instant-camera.jpg'),
      },
    ],
  },
  {
    id: 'talk',
    title: 'Talk to it.',
    layout: 'orbs',
    effects: [
      {
        id: 'ai-orb',
        title: 'AI Orb',
        line: 'Morphing thinking blob',
        screen: 'AiOrbExample',
        image: require('../../assets/catalog/ai-orb.jpg'),
      },
      {
        id: 'glow-orb',
        title: 'Glow Orb',
        line: 'Luminous breathing sphere with swirling colors',
        screen: 'GlowOrbStatic',
        image: require('../../assets/catalog/glow-orb.jpg'),
      },
      {
        id: 'ai-voice',
        title: 'AI Voice',
        line: 'A waveform that follows your voice',
        screen: 'AiVoiceExample',
        image: require('../../assets/catalog/ai-voice.jpg'),
      },
      {
        id: 'ai-shimmer',
        title: 'AI Shimmer',
        line: 'The shimmer that plays while an answer arrives',
        screen: 'AiShimmerExample',
        image: require('../../assets/catalog/ai-shimmer.jpg'),
      },
    ],
  },
  {
    id: 'send',
    title: 'Send it.',
    layout: 'rows',
    effects: [
      {
        id: 'send-effects',
        title: 'Message Flourishes',
        line: 'Pick a chip and your message lands with a flourish',
        screen: 'SendEffectsExample',
        image: require('../../assets/catalog/send-effects.jpg'),
      },
      {
        id: 'hidden-text',
        title: 'Hidden Text',
        line: 'Tap the hidden text to reveal it for a moment',
        screen: 'HiddenTextExample',
        image: require('../../assets/catalog/hidden-text.jpg'),
      },
      {
        id: 'message-dissolve',
        title: 'Message Dissolve',
        line: 'Delete a message and watch it turn to dust',
        screen: 'MessageDissolveExample',
        image: require('../../assets/catalog/message-dissolve.jpg'),
      },
      {
        id: 'voice-delete',
        title: 'Voice Delete',
        line: 'Delete a voice message in a puff of smoke',
        screen: 'VoiceDeleteExample',
        image: require('../../assets/catalog/voice-delete.jpg'),
      },
      {
        id: 'banners',
        title: 'Banners',
        line: 'Alert banners with living shader backgrounds',
        screen: 'BannersExample',
        image: require('../../assets/catalog/banners.jpg'),
      },
    ],
  },
  {
    id: 'watch',
    title: 'Just watch.',
    layout: 'wall',
    effects: [
      {
        id: 'aurora',
        title: 'Aurora',
        line: 'Northern lights with flowing curtains of light',
        screen: 'AuroraStatic',
        image: require('../../assets/catalog/aurora.jpg'),
        hero: require('../../assets/catalog/aurora-hero.jpg'),
      },
      {
        id: 'liquid-chrome',
        title: 'Liquid Chrome',
        line: 'Fluid metallic surfaces',
        screen: 'LiquidChromeStatic',
        image: require('../../assets/catalog/liquid-chrome.jpg'),
      },
      {
        id: 'campfire',
        title: 'Campfire',
        line: 'Fire with drifting sparks and smoke',
        screen: 'CampfireStatic',
        image: require('../../assets/catalog/campfire.jpg'),
      },
      {
        id: 'iridescence',
        title: 'Iridescence',
        line: 'Soap-film color in slow motion',
        screen: 'IridescenceStatic',
        image: require('../../assets/catalog/iridescence.jpg'),
      },
      {
        id: 'silk',
        title: 'Silk',
        line: 'Smooth flowing fabric',
        screen: 'SilkStatic',
        image: require('../../assets/catalog/silk.jpg'),
      },
      {
        id: 'ink-bloom',
        title: 'Ink Bloom',
        line: 'A drop of ink curling through water',
        screen: 'InkBloomExample',
        image: require('../../assets/catalog/ink-bloom.jpg'),
      },
      {
        id: 'weather',
        title: 'Weather',
        line: 'Skies that change with the weather',
        screen: 'WeatherExample',
        image: require('../../assets/catalog/weather.jpg'),
      },
      {
        id: 'calico-swirl',
        title: 'Calico Swirl',
        line: 'Warped noise with flowing colors',
        screen: 'CalicoSwirlStatic',
        image: require('../../assets/catalog/calico-swirl.jpg'),
      },
      {
        id: 'materials',
        title: 'Materials',
        line: 'Natural material banners. Tap to go full screen',
        screen: 'MaterialsExample',
        image: require('../../assets/catalog/materials.jpg'),
      },
    ],
  },
];

const ALL_EFFECTS = SECTIONS.flatMap((section) => section.effects);

const FEATURED_IDS = [
  'lava-lamp',
  'cracked-screen',
  'dandelion',
  'birthday-candle',
  'aurora',
];

export const FEATURED_EFFECTS = ALL_EFFECTS.filter((effect) =>
  FEATURED_IDS.includes(effect.id)
).sort((a, b) => FEATURED_IDS.indexOf(a.id) - FEATURED_IDS.indexOf(b.id));

const ALPHABETICAL_ENTRIES = SECTIONS.flatMap((section) =>
  section.effects.map((effect) => ({
    effect,
    haystack: [section.title, effect.title, effect.line]
      .join(' ')
      .toLowerCase(),
  }))
).sort((a, b) => a.effect.title.localeCompare(b.effect.title));

const MIN_QUERY_LENGTH = 2;

export function searchEffects(query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY_LENGTH) {
    return ALL_EFFECTS;
  }
  return ALPHABETICAL_ENTRIES.filter((entry) =>
    entry.haystack.includes(needle)
  ).map((entry) => entry.effect);
}
