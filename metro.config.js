const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// Keep host bundling bounded when Android Studio and an emulator share memory.
// The host hit Windows commit limits during Phase 05; reduce bundling parallelism.
const config = {maxWorkers: 2};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
