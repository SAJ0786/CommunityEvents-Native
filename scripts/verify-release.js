const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const requireFile = relativePath => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Required release file is missing: ${relativePath}`);
  return absolutePath;
};

const app = JSON.parse(read('app.json')).expo;
const eas = JSON.parse(read('eas.json'));
const packageJson = JSON.parse(read('package.json'));
const androidGradle = read('android/app/build.gradle');
const gradleProperties = read('android/gradle.properties');
const dynamicAppConfig = read('app.config.js');

if (app.name !== 'Community Connect Australia') throw new Error(`Unexpected store name: ${app.name}`);
if (app.version !== '1.0.0' || packageJson.version !== app.version) {
  throw new Error('App and package release versions must both be 1.0.0.');
}
if (app.android?.package !== 'info.siza.communityevents.app') throw new Error('Unexpected Android application ID.');
if (app.ios?.bundleIdentifier !== 'info.siza.communityevents') throw new Error('Unexpected iOS bundle identifier.');
if (Number(app.android?.versionCode) < 36) throw new Error('Android versionCode must be at least 36.');
if (!app.ios?.buildNumber) throw new Error('iOS buildNumber is required.');
if (app.ios?.supportsTablet !== false) throw new Error('Version 1 is scoped to iPhone and must not claim untested iPad support.');

const buildProperties = (app.plugins || []).find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
if (buildProperties?.[1]?.ios?.useFrameworks !== 'static') {
  throw new Error('iOS must use static frameworks with the Firebase CocoaPods resolver.');
}
if (!(app.plugins || []).includes('./plugins/with-rnfirebase-cocoapods')) {
  throw new Error('The iOS Firebase CocoaPods resolver plugin is required.');
}

if (!/versionName\s+["']1\.0\.0["']/.test(androidGradle)) throw new Error('Checked-in Android versionName is not 1.0.0.');
if (!/versionCode\s+36\b/.test(androidGradle)) throw new Error('Checked-in Android versionCode is not 36.');
if (!/^android\.compileSdkVersion=36$/m.test(gradleProperties)) throw new Error('Android compile SDK 36 is not pinned.');
if (!/^android\.targetSdkVersion=36$/m.test(gradleProperties)) throw new Error('Android target SDK 36 is not pinned.');
if (!dynamicAppConfig.includes("process.env.EXPO_NO_DOTENV === '1'") ||
    !dynamicAppConfig.includes("process.env.EAS_BUILD !== 'true'")) {
  throw new Error('EAS local metadata evaluation must remain separate from the protected-key cloud build guard.');
}

const production = eas.build?.production;
if (production?.environment !== 'production' || production?.env?.APP_RELEASE_MODE !== 'production') {
  throw new Error('EAS production builds must use production environment and disable tester mode.');
}
const requiredIosImage = 'macos-sequoia-15.6-xcode-26.0';
if (production?.ios?.image !== requiredIosImage || eas.build?.['ios-simulator']?.ios?.image !== requiredIosImage) {
  throw new Error('iOS builds must use the pinned Xcode 26.0 image required by the current livestream dependency.');
}
if (!production?.autoIncrement) throw new Error('Production build numbers must auto-increment.');

requireFile('GoogleService-Info.plist');
requireFile('google-services.json');
requireFile('android/app/google-services.json');
const firebaseCocoaPodsPlugin = read('plugins/with-rnfirebase-cocoapods.js');
if (!firebaseCocoaPodsPlugin.includes('$RNFirebaseDisableSPM = true')) {
  throw new Error('Firebase CocoaPods resolver plugin does not disable Firebase SPM.');
}
if (!firebaseCocoaPodsPlugin.includes("target.name == 'HaishinKit'") ||
    !firebaseCocoaPodsPlugin.includes("SWIFT_COMPILATION_MODE'] = 'singlefile'") ||
    !firebaseCocoaPodsPlugin.includes("SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'")) {
  throw new Error('The target-only HaishinKit Xcode 26 compiler workaround is missing.');
}
const livestreamPatch = read('patches/@api.video+react-native-livestream+2.0.2.patch');
if (!livestreamPatch.includes('<react_native_livestream/react_native_livestream-Swift.h>')) {
  throw new Error('The api.video iOS generated Swift-header compatibility patch is missing.');
}
requireFile('docs/legal/Community_Connect_Australia_Privacy_Policy_DRAFT.md');
requireFile('docs/legal/Community_Connect_Australia_Terms_of_Use_DRAFT.md');

const iconPath = requireFile('assets/icon-store-1024.png');
const png = fs.readFileSync(iconPath);
if (png.length < 33 || png.toString('hex', 1, 4) !== '504e47') throw new Error('Store icon is not a valid PNG.');
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const colorType = png[25];
if (width !== 1024 || height !== 1024) throw new Error(`Store icon must be 1024x1024, found ${width}x${height}.`);
if (colorType === 4 || colorType === 6) throw new Error('Store icon contains an alpha channel; iOS icons must be opaque.');

console.log('Release configuration check passed: v1.0.0, store identities, API 36, static iOS frameworks with Firebase CocoaPods, api.video/HaishinKit Xcode 26 compatibility fixes, pinned Xcode 26.0/iOS 26 SDK image, Firebase files, legal drafts, and opaque 1024px icon verified.');
