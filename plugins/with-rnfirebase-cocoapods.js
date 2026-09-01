const { withPodfile, withXcodeProject } = require('@expo/config-plugins');

const DISABLE_SPM_LINE = '$RNFirebaseDisableSPM = true';
const HAISHINKIT_WORKAROUND_MARKER = '# Community Connect: HaishinKit Xcode 26 workaround';
const POST_INSTALL_LINE = 'post_install do |installer|';
const OBJC_LINKER_FLAG = '"-ObjC"';
const HAISHINKIT_WORKAROUND = `${POST_INSTALL_LINE}
    ${HAISHINKIT_WORKAROUND_MARKER}
    # HaishinKit 1.9.3 crashes the Xcode 26 Swift optimiser, including in
    # per-file mode. Disable optimisation for this legacy pod only.
    installer.pods_project.targets.each do |target|
      next unless target.name == 'HaishinKit'

      target.build_configurations.each do |build_config|
        build_config.build_settings['SWIFT_COMPILATION_MODE'] = 'singlefile'
        build_config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
      end
    end`;

/**
 * React Native Firebase 26 defaults to Swift Package Manager on iOS, but its
 * published Expo plugin does not currently apply the documented disableSPM
 * option. Our livestream dependency needs CocoaPods/static linkage, so keep
 * Firebase on the CocoaPods resolver until the upstream plugin handles this.
 */
function withFirebasePodfile(config) {
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
}

function withFirebaseObjCLinkerFlag(config) {
  return withXcodeProject(config, xcodeConfig => {
    const configurations = xcodeConfig.modResults.pbxXCBuildConfigurationSection();

    for (const [key, configuration] of Object.entries(configurations)) {
      if (key.endsWith('_comment') || !configuration?.buildSettings) {
        continue;
      }

      const currentFlags = configuration.buildSettings.OTHER_LDFLAGS;
      const flags = Array.isArray(currentFlags)
        ? [...currentFlags]
        : currentFlags
          ? [currentFlags]
          : ['"$(inherited)"'];

      if (!flags.some(flag => String(flag).replaceAll('"', '') === '-ObjC')) {
        flags.push(OBJC_LINKER_FLAG);
      }

      configuration.buildSettings.OTHER_LDFLAGS = flags;
    }

    return xcodeConfig;
  });
}

module.exports = function withReactNativeFirebaseCocoaPods(config) {
  config = withFirebasePodfile(config);
  return withFirebaseObjCLinkerFlag(config);
};
