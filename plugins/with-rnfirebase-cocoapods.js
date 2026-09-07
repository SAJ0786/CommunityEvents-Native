const { withPodfile, withXcodeProject } = require('@expo/config-plugins');

const DISABLE_SPM_LINE = '$RNFirebaseDisableSPM = true';
const HAISHINKIT_WORKAROUND_MARKER = '# Community Connect: HaishinKit Xcode 26 workaround';
const IOS_STREAM_LIFECYCLE_MARKER = '# Community Connect: preserve user-owned iOS livestreams';
const POST_INSTALL_LINE = 'post_install do |installer|';
const OBJC_LINKER_FLAG = '"-ObjC"';
const HAISHINKIT_WORKAROUND = `${POST_INSTALL_LINE}
    ${HAISHINKIT_WORKAROUND_MARKER}
    # HaishinKit 1.9.3 crashes the Xcode 26 Swift optimiser, including in
    # per-file mode. Disable optimisation for this legacy pod only.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        if target.name == 'HaishinKit'
          build_config.build_settings['SWIFT_COMPILATION_MODE'] = 'singlefile'
          build_config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
        end
      end
    end

    ${IOS_STREAM_LIFECYCLE_MARKER}
    # ApiVideoLiveStream 1.4.6 unconditionally calls stopStreaming when iOS
    # enters the background. That closes the RTMP publisher while native PiP
    # is starting and leaves the already-created YouTube broadcast waiting.
    # Preserve the same RTMP owner; only the app's confirmed End action may
    # close it. The SDK's existing RTMP error handler reconnects interruptions.
    api_video_source = Dir.glob(
      File.join(installer.sandbox.root.to_s, 'ApiVideoLiveStream', 'Sources', 'ApiVideoLiveStream', 'ApiVideoLiveStream.swift')
    ).first
    if api_video_source && File.exist?(api_video_source)
      source = File.read(api_video_source)
      forced_background_stop = '        self.stopStreaming()'
      unless source.include?('Community Connect keeps the stream user-owned')
        unless source.include?(forced_background_stop)
          raise 'ApiVideoLiveStream background-stop implementation changed; refusing an unsafe iOS build.'
        end
        source = source.sub(
          forced_background_stop,
          '        // Community Connect keeps the stream user-owned until confirmed End.'
        )
        File.write(api_video_source, source)
      end
    else
      raise 'ApiVideoLiveStream.swift was not found; the iOS stream lifecycle patch was not applied.'
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

    if (!podfile.includes(HAISHINKIT_WORKAROUND_MARKER) || !podfile.includes(IOS_STREAM_LIFECYCLE_MARKER)) {
      if (!podfile.includes(POST_INSTALL_LINE)) {
        throw new Error('Unable to locate the CocoaPods post_install hook for the iOS native streaming patches.');
      }

      // EAS generates the iOS project from a clean tree. Refuse to stack a
      // partial/older generated hook locally; recreating ios/ is safer than
      // producing a Podfile with duplicated post_install mutations.
      if (podfile.includes(HAISHINKIT_WORKAROUND_MARKER) || podfile.includes(IOS_STREAM_LIFECYCLE_MARKER)) {
        throw new Error('A partial Community Connect iOS stream hook already exists. Regenerate the ios directory before prebuild.');
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
