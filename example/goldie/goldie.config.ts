const screenshot = (
  id: string,
  flow: string,
  headline: string,
  subhead: string,
  layout = 'hero'
) => ({
  kind: 'screenshot',
  id,
  flow,
  layout,
  headline: { 'en-US': headline },
  subhead: { 'en-US': subhead },
});

export default {
  appRoot: '..',
  appPath:
    process.env.EFFECTS_APP_PATH ??
    '/tmp/rnfx-dd/Build/Products/Release-iphonesimulator/Effects.app',
  bundleId: 'com.blazejkustra.rneffects',
  flowsDir: 'flows',
  devices: ['iphone-6.9'],
  locales: ['en-US'],
  appearance: 'dark',
  frame: { variant: '17-pro-silver' },
  theme: {
    background:
      'linear-gradient(170deg, #1a1a1c 0%, #0b0b0c 55%, #000000 100%)',
    headlineColor: '#f5f5f3',
    subheadColor: '#a3a3a0',
    fontFamily: 'Merriweather',
    layout: 'hero',
    copyHeightRatio: 0.2,
    deviceWidthRatio: 0.82,
  },
  store: {
    name: 'Effects',
    subtitle: { 'en-US': 'Screens you can touch' },
    developer: 'Blazej Kustra',
    category: 'Entertainment',
    ageRating: '13+',
    description: {
      'en-US':
        'A collection of real-time effects that respond to touch, tilt, breath and voice.',
    },
  },
  scenes: [
    screenshot(
      'catalog',
      'store-01-catalog',
      'Tilt it. Blow on it. Break it.',
      'Effects that answer your touch.'
    ),
    screenshot(
      'lava-lamp',
      'store-02-lava-lamp',
      'A pocket lava lamp',
      'Warm wax rises and sinks. Tilt to stir it.'
    ),
    screenshot(
      'cracked-screen',
      'store-03-cracked-screen',
      'Crack the glass',
      'Tap and it breaks where you hit it.',
      'classic'
    ),
    screenshot(
      'bubble-wrap',
      'store-04-bubble-wrap',
      'Pop every bubble',
      'Drag a finger and hear each one snap.'
    ),
    screenshot(
      'dandelion',
      'store-05-dandelion',
      'Blow the seeds away',
      'Breathe on your phone and watch them drift.'
    ),
    screenshot(
      'hourglass',
      'store-06-hourglass',
      'Time it with sand',
      'Pick a length, tap to pause, flip to restart.',
      'classic'
    ),
    screenshot(
      'ferrofluid',
      'store-07-ferrofluid',
      'Touch to raise spikes',
      'Hold a finger down and the fluid stands up.'
    ),
    {
      kind: 'preview',
      id: 'preview',
      segments: [{ id: 'tour', flow: 'store-preview' }],
    },
  ],
};
