const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase Auth's React Native entry points can resolve against different
// component registries when Metro package exports are enabled. Use Metro's
// documented compatibility mode until Firebase's exports are fully aligned.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
