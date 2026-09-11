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
const legalConfig = read('src/config/legal.js');
const googleServices = JSON.parse(read('google-services.json'));
const checkedInGoogleServices = JSON.parse(read('android/app/google-services.json'));
const iosGoogleServices = read('GoogleService-Info.plist');
const androidGradle = read('android/app/build.gradle');
const gradleProperties = read('android/gradle.properties');
const dynamicAppConfig = read('app.config.js');
const androidStreamPackage = read('android/app/src/main/java/info/siza/communityevents/app/StreamingPipPackage.kt');
const androidStreamManager = read('android/app/src/main/java/info/siza/communityevents/app/AndroidRootEncoderLiveStreamManager.java');
const androidStreamView = read('android/app/src/main/java/info/siza/communityevents/app/AndroidRootEncoderLiveStreamView.java');

if (app.name !== 'Community Connect Australia') throw new Error(`Unexpected store name: ${app.name}`);
if (app.version !== '2.0.0' || packageJson.version !== app.version) {
  throw new Error('App and package release versions must both be 2.0.0.');
}
if (app.android?.package !== 'info.siza.communityevents.app') throw new Error('Unexpected Android application ID.');
if (app.ios?.bundleIdentifier !== 'info.siza.communityevents') throw new Error('Unexpected iOS bundle identifier.');
if (Number(app.android?.versionCode) < 63) throw new Error('Android versionCode must be at least 63.');
if (!app.ios?.buildNumber) throw new Error('iOS buildNumber is required.');
if (app.ios?.supportsTablet !== false) throw new Error('This release is scoped to iPhone and must not claim untested iPad support.');

const buildProperties = (app.plugins || []).find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
if (buildProperties?.[1]?.ios?.useFrameworks !== 'static') {
  throw new Error('iOS must use static frameworks with the Firebase CocoaPods resolver.');
}
if (!(app.plugins || []).includes('./plugins/with-rnfirebase-cocoapods')) {
  throw new Error('The iOS Firebase CocoaPods resolver plugin is required.');
}

if (!/versionName\s+["']2\.0\.0["']/.test(androidGradle)) throw new Error('Checked-in Android versionName is not 2.0.0.');
if (!new RegExp(`versionCode\\s+${Number(app.android.versionCode)}\\b`).test(androidGradle)) {
  throw new Error(`Checked-in Android versionCode does not match app.json (${app.android.versionCode}).`);
}
if (!/^android\.compileSdkVersion=36$/m.test(gradleProperties)) throw new Error('Android compile SDK 36 is not pinned.');
if (!/^android\.targetSdkVersion=36$/m.test(gradleProperties)) throw new Error('Android target SDK 36 is not pinned.');
if (!androidGradle.includes('EAS_BUILD_ANDROID_KEYSTORE_PATH') ||
    !androidGradle.includes('EAS_BUILD_ANDROID_KEYSTORE_PASSWORD') ||
    !androidGradle.includes('EAS_BUILD_ANDROID_KEY_ALIAS') ||
    !androidGradle.includes('EAS_BUILD_ANDROID_KEY_PASSWORD') ||
    !androidGradle.includes('file("eas-build.gradle").exists()') ||
    !androidGradle.includes('!easManagedSigning') ||
    !androidGradle.includes('findProperty("releaseStoreFile")') ||
    !androidGradle.includes('findProperty("releaseStorePassword")') ||
    !androidGradle.includes('findProperty("releaseKeyAlias")') ||
    !androidGradle.includes('findProperty("releaseKeyPassword")') ||
    !androidGradle.includes('signingConfig signingConfigs.release')) {
  throw new Error('Android release signing must accept EAS-managed and Codemagic credentials without falling back to debug signing.');
}
if (!dynamicAppConfig.includes("process.env.EXPO_NO_DOTENV === '1'") ||
    !dynamicAppConfig.includes("process.env.EAS_BUILD !== 'true'")) {
  throw new Error('EAS local metadata evaluation must remain separate from the protected-key cloud build guard.');
}
if (!androidGradle.includes('com.github.pedroSG94.RootEncoder:library:2.5.9') ||
    !androidStreamPackage.includes('AndroidRootEncoderLiveStreamManager()') ||
    !androidStreamManager.includes('AndroidRootEncoderLiveStreamView') ||
    !androidStreamView.includes('RtmpCamera2')) {
  throw new Error('Stable Android RootEncoder streaming implementation is missing or not registered.');
}

const production = eas.build?.production;
const apk = eas.build?.apk;
const preview = eas.build?.preview;
if (apk?.environment !== 'preview' ||
    apk?.distribution !== 'internal' ||
    apk?.android?.buildType !== 'apk' ||
    apk?.env?.APP_RELEASE_MODE !== 'tester' ||
    apk?.env?.APP_CHECK_PROVIDER !== 'debug' ||
    preview?.environment !== 'preview' ||
    preview?.distribution !== 'internal' ||
    preview?.env?.APP_RELEASE_MODE !== 'tester' ||
    preview?.env?.APP_CHECK_PROVIDER !== 'debug') {
  throw new Error('EAS apk and preview profiles must remain internal tester builds with debug App Check.');
}
if (production?.environment !== 'production' ||
    production?.env?.APP_RELEASE_MODE !== 'production' ||
    production?.env?.APP_CHECK_PROVIDER !== 'production') {
  throw new Error('EAS production builds must use production environment and disable tester mode.');
}
if (production?.env?.FIREBASE_APP_CHECK_DEBUG_TOKEN ||
    production?.env?.IOS_BUNDLE_IDENTIFIER ||
    production?.env?.IOS_GOOGLE_SERVICES_FILE) {
  throw new Error('Production must use the checked-in store identity and Firebase file, with no tester overrides or App Check debug token.');
}
const requiredIosImage = 'macos-sequoia-15.6-xcode-26.0';
if (production?.ios?.image !== requiredIosImage ||
    eas.build?.['ios-simulator']?.ios?.image !== requiredIosImage ||
    eas.build?.['ios-personal-testflight']?.ios?.image !== requiredIosImage) {
  throw new Error('iOS builds must use the pinned Xcode 26.0 image required by the current livestream dependency.');
}
if (!production?.autoIncrement) throw new Error('Production build numbers must auto-increment.');

requireFile('GoogleService-Info.plist');
requireFile('google-services.json');
requireFile('android/app/google-services.json');
const expectedFirebaseProject = 'community-event-8b639';
const androidFirebaseMatches = config => (
  config.project_info?.project_id === expectedFirebaseProject &&
  config.client?.some(client => client.client_info?.android_client_info?.package_name === app.android.package)
);
if (!androidFirebaseMatches(googleServices) || !androidFirebaseMatches(checkedInGoogleServices)) {
  throw new Error('Android Firebase configuration must contain the production app and project identifiers.');
}
const plistValue = key => {
  const match = iosGoogleServices.match(new RegExp(`<key>\\s*${key}\\s*</key>\\s*<string>([^<]+)</string>`));
  return match?.[1]?.trim() || '';
};
if (plistValue('BUNDLE_ID') !== app.ios.bundleIdentifier ||
    plistValue('PROJECT_ID') !== expectedFirebaseProject) {
  throw new Error('iOS Firebase configuration does not match the production bundle and project identifiers.');
}
if (app.ios?.entitlements?.['com.apple.developer.devicecheck.appattest-environment'] !== 'production') {
  throw new Error('Production iOS builds must carry the App Attest production entitlement.');
}
if (!(app.plugins || []).includes('@react-native-firebase/app-check')) {
  throw new Error('The native Firebase App Check plugin is required for production builds.');
}
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
if (!livestreamPatch.includes('guard isStreaming else { return }') ||
    !livestreamPatch.includes('PiPHKView(frame: .zero)') ||
    !livestreamPatch.includes('AVPictureInPictureController.ContentSource') ||
    !livestreamPatch.includes('The stream belongs to the user')) {
  throw new Error('The api.video iOS idempotent streaming teardown patch is missing.');
}
if (!firebaseCocoaPodsPlugin.includes('preserve user-owned iOS livestreams') ||
    !firebaseCocoaPodsPlugin.includes('Community Connect keeps the stream user-owned')) {
  throw new Error('The ApiVideo forced-background-stop CocoaPods patch is missing.');
}
for (const backgroundMode of ['audio', 'voip']) {
  if (!app.ios?.infoPlist?.UIBackgroundModes?.includes(backgroundMode)) {
    throw new Error(`iOS release is missing the ${backgroundMode} background mode required by native PiP streaming.`);
  }
}
requireFile('docs/legal/Community_Connect_Australia_Privacy_Policy_DRAFT.md');
requireFile('docs/legal/Community_Connect_Australia_Terms_of_Use_DRAFT.md');
if (!legalConfig.includes("LEGAL_DOCUMENT_VERSION = '2026-09-08-community-connect'") ||
    !legalConfig.includes("SUPPORT_EMAIL = 'support@siza.info'")) {
  throw new Error('The in-app legal acceptance version or SIZA support address is not the published launch version.');
}
for (const requiredUrl of [
  'https://siza.info/privacy.html?source=native',
  'https://siza.info/terms.html?source=native',
  'https://siza.info/support.html?source=native',
  'https://siza.info/delete-account.html?source=native',
  'https://siza.info/docs/user-guide.html?source=native',
]) {
  if (!legalConfig.includes(requiredUrl)) throw new Error(`Missing canonical SIZA.info documentation URL: ${requiredUrl}`);
}
if (legalConfig.includes('communityevents.siza.info')) {
  throw new Error('Legal and support links must use SIZA.info, not the product subdomain.');
}
if (packageJson.dependencies?.['react-native-maps'] !== '1.27.2' ||
    !packageJson.expo?.install?.exclude?.includes('react-native-maps')) {
  throw new Error('The device-tested react-native-maps release must remain exactly pinned and explicitly exempted from Expo Doctor version replacement.');
}

const iconPath = requireFile('assets/icon-store-1024.png');
const png = fs.readFileSync(iconPath);
if (png.length < 33 || png.toString('hex', 1, 4) !== '504e47') throw new Error('Store icon is not a valid PNG.');
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const colorType = png[25];
if (width !== 1024 || height !== 1024) throw new Error(`Store icon must be 1024x1024, found ${width}x${height}.`);
if (colorType === 4 || colorType === 6) throw new Error('Store icon contains an alpha channel; iOS icons must be opaque.');

console.log('Release configuration check passed: v2.0.0/build baseline 63, existing store identities, production Firebase/App Check settings, canonical SIZA.info legal links, API 36, device-tested maps dependency, stable Android RootEncoder streaming, native iOS sample-buffer PiP with user-owned RTMP lifecycle, static iOS frameworks with Firebase CocoaPods, api.video/HaishinKit Xcode 26 compatibility fixes, pinned Xcode 26.0/iOS 26 SDK image, and opaque 1024px icon verified.');
