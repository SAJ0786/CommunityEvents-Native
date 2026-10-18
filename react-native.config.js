module.exports = {
  dependencies: {
    // Android uses our RootEncoder view. The unused api.video Android package
    // would otherwise bundle rtmpdroid 1.2.1's 4 KB native libraries.
    // Leave iOS autolinking enabled for its existing streaming implementation.
    '@api.video/react-native-livestream': { platforms: { android: null } },
  },
};
