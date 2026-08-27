const { withPodfile } = require('@expo/config-plugins');

const DISABLE_SPM_LINE = '$RNFirebaseDisableSPM = true';

/**
 * React Native Firebase 26 defaults to Swift Package Manager on iOS, but its
 * published Expo plugin does not currently apply the documented disableSPM
 * option. Our livestream dependency needs CocoaPods/static linkage, so keep
 * Firebase on the CocoaPods resolver until the upstream plugin handles this.
 */
module.exports = function withReactNativeFirebaseCocoaPods(config) {
  return withPodfile(config, podfileConfig => {
    const podfile = podfileConfig.modResults.contents;

    if (!podfile.includes(DISABLE_SPM_LINE)) {
      podfileConfig.modResults.contents = `${DISABLE_SPM_LINE}\n${podfile}`;
    }

    return podfileConfig;
  });
};
