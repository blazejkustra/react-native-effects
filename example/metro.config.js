const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { bundleModeMetroConfig } = require('react-native-worklets/bundleMode');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const pak = require(path.join(root, 'package.json'));

// Peer deps must only resolve from the example app where native modules are linked.
// Block the library root's copies so Metro never picks them up.
const peerDeps = Object.keys(pak.peerDependencies || {});

const blockPatterns = peerDeps.map(
  (dep) =>
    new RegExp(
      '^' +
        path.resolve(root, 'node_modules', dep).replace(/[/\\]/g, '[/\\\\]') +
        '[/\\\\]'
    )
);

const config = {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(root, 'node_modules'),
    ],
    blockList: [/(\/__tests__\/.*)$/, ...blockPatterns],
  },
};

module.exports = mergeConfig(
  getDefaultConfig(__dirname),
  bundleModeMetroConfig,
  config
);
