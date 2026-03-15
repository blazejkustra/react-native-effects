const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const {
  getBundleModeMetroConfig,
} = require('react-native-worklets/bundleMode');

const root = path.resolve(__dirname, '..');

/** @type {import('expo/metro-config').MetroConfig} */
let config = getDefaultConfig(__dirname);

// Monorepo: watch root and resolve from both node_modules
config.watchFolders = [root];
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(root, 'node_modules'),
  ],
};

config = getBundleModeMetroConfig(config);

// CRITICAL: Enable inlineRequires for worklets compatibility in Expo
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      inlineRequires: true,
    },
  }),
};

module.exports = config;
