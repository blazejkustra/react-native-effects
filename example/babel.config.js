const path = require('path');

/** @type {import('react-native-worklets/plugin').PluginOptions} */
const workletsPluginOptions = {
  bundleMode: true,
  strictGlobal: true,
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['react-native-worklets/plugin', workletsPluginOptions]],
    overrides: [
      {
        include: path.resolve(__dirname, '..', 'src'),
        plugins: [['react-native-worklets/plugin', workletsPluginOptions]],
      },
    ],
  };
};
