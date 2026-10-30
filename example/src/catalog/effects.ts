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
        id: 'beer',
        title: 'Beer',
        line: 'Tilt to slosh, rotate to drink, tap to refill',
        screen: 'BeerExample',
        image: require('../../assets/catalog/beer.jpg'),
      },
      {
        id: 'lighter',
        title: 'Lighter',
        line: 'Tap to strike. The flame stays upright as you tilt',
        screen: 'LighterExample',
        image: require('../../assets/catalog/lighter.jpg'),
        hero: require('../../assets/catalog/lighter-hero.jpg'),
      },
      {
        id: 'hourglass',
        title: 'Hourglass',
        line: 'Run a Pomodoro, then flip your phone to restart it',
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
        line: 'Tap hard and the glass breaks where you hit it',
        screen: 'CrackedScreenExample',
        image: require('../../assets/catalog/cracked-screen.jpg'),
        hero: require('../../assets/catalog/cracked-screen-hero.jpg'),
      },
      {
        id: 'duo-crackgate',
        title: 'Crackgate',
        line: 'The iPhone Duo hinge crack, white pixels and all',
        screen: 'DuoCrackgateExample',
        image: require('../../assets/catalog/duo-crackgate.jpg'),
      },
      {
        id: 'crt-off',
        title: 'CRT Off',
        line: 'Close the app like an old TV',
        screen: 'CrtOffExample',
        image: require('../../assets/catalog/crt-off.jpg'),
      },
      {
        id: 'thanos',
        title: 'Thanos',
        line: 'Tap to snap a card into dust',
        screen: 'ThanosExample',
        image: require('../../assets/catalog/thanos.jpg'),
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
        line: 'Scratch the foil to reveal your prize',
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
        line: 'The Dynamic Island torch. Swipe to shape the beam',
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
        id: 'wallet',
        title: 'Wallet',
        line: 'Double-click to pay, the card lifts and glints',
        screen: 'WalletPayExample',
        image: require('../../assets/catalog/wallet.jpg'),
      },
      {
        id: 'namedrop',
        title: 'NameDrop',
        line: 'Bring two iPhones together and swap contacts',
        screen: 'NameDropExample',
        image: require('../../assets/catalog/namedrop.jpg'),
      },
      {
        id: 'touch-field',
        title: 'Sauron Eye',
        line: 'The lidless Eye, wreathed in flame',
        screen: 'TouchFieldExample',
        image: require('../../assets/catalog/touch-field.jpg'),
      },
      {
        id: 'scroll-reactive',
        title: 'Scroll Reactive',
        line: 'A background that reacts to your scroll',
        screen: 'ScrollReactiveExample',
        image: require('../../assets/catalog/scroll-reactive.jpg'),
      },
    ],
  },
  {
    id: 'shake',
    title: 'Shake it.',
    layout: 'wide',
    effects: [
      {
        id: 'magic-8-ball',
        title: 'Magic 8-ball',
        line: 'Shake your phone and the answer floats up through the ink',
        screen: 'Magic8BallExample',
        image: require('../../assets/catalog/magic-8-ball.jpg'),
      },
      {
        id: 'polaroid',
        title: 'Polaroid',
        line: 'Snap a photo and shake it while it develops',
        screen: 'PolaroidExample',
        image: require('../../assets/catalog/polaroid.jpg'),
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
        line: 'A morphing orb that listens while it thinks',
        screen: 'AiOrbExample',
        image: require('../../assets/catalog/ai-orb.jpg'),
      },
      {
        id: 'siri-orb',
        title: 'Siri Orb',
        line: 'Luminous breathing sphere with swirling colors',
        screen: 'SiriOrbStatic',
        image: require('../../assets/catalog/siri-orb.jpg'),
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
        id: 'imessage',
        title: 'iMessage Effects',
        line: 'Hold send to pick lasers, confetti, fireworks and more',
        screen: 'IMessageExample',
        image: require('../../assets/catalog/imessage.jpg'),
      },
      {
        id: 'telegram-spoiler',
        title: 'Telegram Spoiler',
        line: 'Tap the hidden text to reveal it for a moment',
        screen: 'TelegramSpoilerExample',
        image: require('../../assets/catalog/telegram-spoiler.jpg'),
      },
      {
        id: 'telegram-dissolve',
        title: 'Telegram Dissolve',
        line: 'Delete a message and watch it turn to dust',
        screen: 'TelegramDissolveExample',
        image: require('../../assets/catalog/telegram-dissolve.jpg'),
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
        line: 'iOS notification banners with shader effects',
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
        line: 'A full forecast app with living skies',
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
      {
        id: 'foamlab',
        title: 'Beer Foam',
        line: 'Three foam treatments side by side',
        screen: 'FoamLabExample',
        image: require('../../assets/catalog/foamlab.jpg'),
      },
      {
        id: 'circular-gradient',
        title: 'Circular Gradient',
        line: 'Customizable radial gradients',
        screen: 'CircularGradientList',
        image: require('../../assets/catalog/circular-gradient.jpg'),
      },
      {
        id: 'linear-gradient',
        title: 'Linear Gradient',
        line: 'Smooth linear gradients, still or animated',
        screen: 'LinearGradientList',
        image: require('../../assets/catalog/linear-gradient.jpg'),
      },
    ],
  },
];

const ALL_EFFECTS = SECTIONS.flatMap((section) => section.effects);

const FEATURED_IDS = [
  'lava-lamp',
  'cracked-screen',
  'lighter',
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

export function searchEffects(query: string) {
  const needle = query.trim().toLowerCase();
  return ALPHABETICAL_ENTRIES.filter((entry) =>
    entry.haystack.includes(needle)
  ).map((entry) => entry.effect);
}
