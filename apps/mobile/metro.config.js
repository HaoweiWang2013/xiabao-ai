const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = getDefaultConfig(__dirname, {
  isReactNative: true,
});

module.exports = mergeConfig(config, {
  watchFolders: [
    __dirname,
    // 监视 monorepo 兄弟包源码
    // ../../packages/ui-native/src,
    // ../../packages/core/src,
    // ../../packages/state/src,
    // ../../packages/theme/src,
  ],
  resolver: {
    sourceExts: [...config.resolver.sourceExts, 'mjs'],
  },
});
