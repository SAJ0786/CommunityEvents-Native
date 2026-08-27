const { withPodfile } = require('@expo/config-plugins');

const DISABLE_SPM_LINE = '$RNFirebaseDisableSPM = true';
const HAISHINKIT_WORKAROUND_MARKER = '# Community Connect: HaishinKit Xcode 26 workaround';
const POST_INSTALL_LINE = 'post_install do |installer|';
const HAISHINKIT_WORKAROUND = `${POST_INSTALL_LINE}
    ${HAISHINKIT_WORKAROUND_MARKER}
    # HaishinKit 1.9.3 crashes the Xcode 26 Swift compiler under whole-module
    # optimisation. Compile this pod per-file while preserving Release -O.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'HaishinKit'

      target.build_configurations.each do |build_config|
        build_config.build_settings['SWIFT_COMPILATION_MODE'] = 'singlefile'
        build_config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-O'
      end
    end`;

/**
 * React Native Firebase 26 defaults to Swift Package Manager on iOS, but its
 * published Expo plugin does not currently apply the documented disableSPM
 * option. Our livestream dependency needs CocoaPods/static linkage, so keep
 * Firebase on the CocoaPods resolver until the upstream plugin handles this.
 */
module.exports = function withReactNativeFirebaseCocoaPods(config) {
  return withPodfile(config, podfileConfig => {
    let podfile = podfileConfig.modResults.contents;

    if (!podfile.includes(DISABLE_SPM_LINE)) {
      podfile = `${DISABLE_SPM_LINE}\n${podfile}`;
    }

    if (!podfile.includes(HAISHINKIT_WORKAROUND_MARKER)) {
      if (!podfile.includes(POST_INSTALL_LINE)) {
        throw new Error('Unable to locate the CocoaPods post_install hook for the HaishinKit workaround.');
      }

      podfile = podfile.replace(POST_INSTALL_LINE, HAISHINKIT_WORKAROUND);
    }

    podfileConfig.modResults.contents = podfile;
    return podfileConfig;
  });
};
