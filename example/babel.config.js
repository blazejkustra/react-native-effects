const path = require('path');

/** @type {import('react-native-worklets/plugin').PluginOptions} */
const workletsPluginOptions = {
  bundleMode: true,
  strictGlobal: true,
};

/** @type {import('@babel/core').TransformOptions} */
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [['react-native-worklets/plugin', workletsPluginOptions]],
  overrides: [
    {
      include: path.resolve(__dirname, '..', 'src'),
      plugins: [['react-native-worklets/plugin', workletsPluginOptions]],
    },
  ],
};
