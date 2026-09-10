const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const projectRoot = path.resolve(__dirname, '..');
const files = ['App.js'];

function collectJavaScriptFiles(relativeDirectory) {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(relativePath);
    } else if (entry.name.endsWith('.js')) {
      files.push(relativePath);
    }
  }
}

collectJavaScriptFiles('src');

for (const file of files) {
  const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
  parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
}

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8')).expo;
const easJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'eas.json'), 'utf8'));
const appConfigSource = fs.readFileSync(path.join(projectRoot, 'app.config.js'), 'utf8');
const moduleExperienceSource = fs.readFileSync(path.join(projectRoot, 'src', 'config', 'moduleExperience.js'), 'utf8');
const legalSource = fs.readFileSync(path.join(projectRoot, 'src', 'config', 'legal.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'ProfileScreen.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'App.js'), 'utf8');
const firebaseSource = fs.readFileSync(path.join(projectRoot, 'src', 'firebase', 'firebase.js'), 'utf8');
const appCheckSource = fs.readFileSync(path.join(projectRoot, 'src', 'firebase', 'appCheck.js'), 'utf8');
const externalLinkSource = fs.readFileSync(path.join(projectRoot, 'src', 'utils', 'openExternalUrl.js'), 'utf8');
const liveStreamSource = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'NativeLiveStreamModal.js'), 'utf8');
const androidStreamBridgeSource = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'AndroidRootEncoderLiveStreamView.js'), 'utf8');
const androidStreamViewSource = fs.readFileSync(path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'info', 'siza', 'communityevents', 'app', 'AndroidRootEncoderLiveStreamView.java'), 'utf8');
const androidGradleSource = fs.readFileSync(path.join(projectRoot, 'android', 'app', 'build.gradle'), 'utf8');
const businessWorkflowSource = fs.readFileSync(path.join(projectRoot, 'backend', 'functions-business-workflow', 'index.js'), 'utf8');
const iosLivestreamPatch = fs.readFileSync(path.join(projectRoot, 'patches', '@api.video+react-native-livestream+2.0.2.patch'), 'utf8');
const iosPodfilePlugin = fs.readFileSync(path.join(projectRoot, 'plugins', 'with-rnfirebase-cocoapods.js'), 'utf8');
const diagnosticRegistrySource = fs.readFileSync(path.join(projectRoot, 'src', 'services', 'diagnostics', 'registry.js'), 'utf8');
const diagnosticPanelSource = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'DiagnosticRegisterPanel.js'), 'utf8');
const firestoreRulesSource = fs.readFileSync(path.join(projectRoot, 'backend', 'firestore.rules'), 'utf8');
const storageRulesSource = fs.readFileSync(path.join(projectRoot, 'backend', 'storage.rules'), 'utf8');

if (packageJson.dependencies.expo !== '~54.0.37') {
  throw new Error(`Expected Expo SDK 54 dependency, found ${packageJson.dependencies.expo || 'missing'}.`);
}
if (!androidGradleSource.includes('signingConfig signingConfigs.release') ||
    !androidGradleSource.includes('ANDROID_RELEASE_STORE_PASSWORD')) {
  throw new Error('Android release builds must use production signing credentials from secure properties or environment variables.');
}
if (!firestoreRulesSource.includes("request.resource.data.role == 'user'") ||
    !firestoreRulesSource.includes('cityAdminBusinessFieldsOnly()') ||
    !firestoreRulesSource.includes('isCityAdminForBusiness(resource.data, request.resource.data)')) {
  throw new Error('Firestore user creation and city-admin business update guards are missing.');
}
if (!storageRulesSource.includes('request.auth.uid == userId')) {
  throw new Error('Event image writes must be restricted to the owning user.');
}
if (!appJson.android?.package || !appJson.ios?.bundleIdentifier) {
  throw new Error('Android package or iOS bundle identifier is missing from app.json.');
}
if (packageJson.dependencies['@react-native-firebase/app-check'] !== '^26.1.0' ||
    !appJson.plugins?.includes('@react-native-firebase/app-check') ||
    appJson.ios?.entitlements?.['com.apple.developer.devicecheck.appattest-environment'] !== 'production') {
  throw new Error('Native Firebase App Check dependency, Expo plugin or App Attest entitlement is missing.');
}
for (const appCheckGuard of [
  'ReactNativeFirebaseAppCheckProvider',
  "provider: useDebugProvider ? 'debug' : 'playIntegrity'",
  "provider: useDebugProvider ? 'debug' : 'appAttestWithDeviceCheckFallback'",
  'isTokenAutoRefreshEnabled: true',
]) {
  if (!appCheckSource.includes(appCheckGuard)) {
    throw new Error(`Firebase App Check initialization guard is missing: ${appCheckGuard}`);
  }
}
if (!firebaseSource.includes("from './appCheck'") || firebaseSource.indexOf("from './appCheck'") > firebaseSource.indexOf('export const auth')) {
  throw new Error('Firebase App Check must initialize before Firebase backend services are used.');
}
for (const profileName of ['development', 'apk', 'preview', 'ios-simulator']) {
  if (easJson.build?.[profileName]?.env?.APP_CHECK_PROVIDER !== 'debug') {
    throw new Error(`The ${profileName} EAS profile must use the App Check debug provider.`);
  }
}
for (const profileName of ['ios-personal-testflight', 'production']) {
  if (easJson.build?.[profileName]?.env?.APP_CHECK_PROVIDER !== 'production') {
    throw new Error(`The ${profileName} EAS profile must use production App Check attestation.`);
  }
}
if (!appConfigSource.includes('FIREBASE_APP_CHECK_DEBUG_TOKEN') ||
    !appConfigSource.includes("appCheckProvider === 'debug'")) {
  throw new Error('App Check debug tokens must be injected only into explicitly configured test builds.');
}
if (/from\s+['"]react-native['"]/.test(moduleExperienceSource)) {
  throw new Error('Module experience content must remain platform-neutral for native/PWA parity.');
}
if (!moduleExperienceSource.includes('Community Events Australia') || !moduleExperienceSource.includes('Community Businesses Australia')) {
  throw new Error('Module-specific product titles are missing from the shared experience configuration.');
}
if (!legalSource.includes("SUPPORT_EMAIL = 'support@siza.info'") || !legalSource.includes("SIZA_WEBSITE_URL = 'https://siza.info'")) {
  throw new Error('Shared legal/contact configuration is missing the production SIZA support details.');
}
const appVersionSource = fs.readFileSync(path.join(projectRoot, 'src', 'services', 'appVersion.js'), 'utf8');
if (!appSource.includes("from './src/services/appVersion'") ||
    !appVersionSource.includes('Application.nativeApplicationVersion') ||
    !appVersionSource.includes('Application.nativeBuildVersion') ||
    !appSource.includes('appBuild={appBuild}')) {
  throw new Error('The About section must receive the native platform version and build metadata.');
}
if (!externalLinkSource.includes("Platform.OS === 'web'") || !externalLinkSource.includes("window.open(url, '_blank'")) {
  throw new Error('PWA external policy links must open in a separate browser tab.');
}
for (const legacyReference of [
  ['communityeventssydney', 'gmail.com'].join('@'),
  ['communityevents.siza.info', 'shia-events-australia.html'].join('/'),
  ['bussiness.support', 'siza.info'].join('@'),
]) {
  if (profileSource.includes(legacyReference) || businessWorkflowSource.includes(legacyReference)) {
    throw new Error(`Legacy legal/contact reference remains in app source: ${legacyReference}`);
  }
}

for (const requiredStreamingGuard of [
  'CAMERA_SETTLE_MS',
  'NATIVE_STOP_SETTLE_MS',
  'nativeStreamStartedRef',
  'connectionStateRef',
  "STREAM_CONNECTION_SUCCESS",
]) {
  if (!liveStreamSource.includes(requiredStreamingGuard)) {
    throw new Error(`Native streaming lifecycle guard is missing: ${requiredStreamingGuard}`);
  }
}
if (!liveStreamSource.includes('OrientationLock.LANDSCAPE_RIGHT') ||
    liveStreamSource.includes('OrientationLock.LANDSCAPE);')) {
  throw new Error('Native streaming must use the stable concrete landscape lock before mounting the camera.');
}
if (!liveStreamSource.includes("Platform.OS === 'android'") ||
    !liveStreamSource.includes("require('./AndroidRootEncoderLiveStreamView').default")) {
  throw new Error('Android phone streaming must use the stable RootEncoder native view.');
}
for (const requiredAndroidStreamingGuard of [
  'RtmpCamera2',
  'portraitMode ? 90 : 0',
  'startPendingWhenSurfaceReady',
  'stopStreamingExplicitly',
  'getStreamClient().reTry',
]) {
  if (!androidStreamViewSource.includes(requiredAndroidStreamingGuard)) {
    throw new Error(`Android RootEncoder streaming guard is missing: ${requiredAndroidStreamingGuard}`);
  }
}
const androidHostPauseBody = androidStreamViewSource.match(/public void onHostPause\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
if (androidHostPauseBody.includes('stopAllInternal(') || androidHostPauseBody.includes('camera.stopStream(')) {
  throw new Error('Android PiP/background lifecycle must not stop an active user stream.');
}
if (liveStreamSource.includes("stopNativeStreamOnce('connection_timeout')")) {
  throw new Error('A slow YouTube acknowledgement must not automatically stop the user stream.');
}
for (const requiredIosStreamingGuard of [
  'PiPHKView(frame: .zero)',
  'AVPictureInPictureController.ContentSource',
  'applicationWillResignActive',
  'The stream belongs to the user',
]) {
  if (!iosLivestreamPatch.includes(requiredIosStreamingGuard)) {
    throw new Error(`iOS native Picture in Picture lifecycle guard is missing: ${requiredIosStreamingGuard}`);
  }
}
if (!iosPodfilePlugin.includes('preserve user-owned iOS livestreams') ||
    !iosPodfilePlugin.includes('Community Connect keeps the stream user-owned') ||
    !iosPodfilePlugin.includes('File.chmod(File.stat(api_video_source).mode | 0200')) {
  throw new Error('The ApiVideo iOS forced-background-stop patch is missing.');
}
for (const backgroundMode of ['audio', 'voip']) {
  if (!appJson.ios?.infoPlist?.UIBackgroundModes?.includes(backgroundMode)) {
    throw new Error(`iOS native streaming requires the ${backgroundMode} background mode.`);
  }
}
if (liveStreamSource.includes('STREAM_IOS_BACKGROUND_PAUSE') ||
    !liveStreamSource.includes('STREAM_IOS_BACKGROUND_CONTINUING')) {
  throw new Error('JavaScript must preserve the native iOS stream owner during background/PiP transitions.');
}
if (!androidStreamBridgeSource.includes('dispatchViewManagerCommand') ||
    !androidGradleSource.includes('com.github.pedroSG94.RootEncoder:library:2.5.9')) {
  throw new Error('Android RootEncoder bridge or pinned native dependency is missing.');
}

for (const diagnosticGuard of [
  'diagnosticSessions',
  'installationId',
  'didCrashOnPreviousExecution',
  'recentEvents',
  'listenDiagnosticSessions',
  'updateDiagnosticAdminReview',
]) {
  const combinedDiagnostics = `${diagnosticRegistrySource}\n${diagnosticPanelSource}\n${fs.readFileSync(path.join(projectRoot, 'src', 'services', 'diagnostics', 'index.js'), 'utf8')}`;
  if (!combinedDiagnostics.includes(diagnosticGuard)) {
    throw new Error(`Privacy-safe diagnostics register guard is missing: ${diagnosticGuard}`);
  }
}
if (!firestoreRulesSource.includes('match /diagnosticSessions/{diagnosticId}') ||
    !firestoreRulesSource.includes('allow delete: if false;') ||
    !firestoreRulesSource.includes('diagnosticAdminReviewOnly')) {
  throw new Error('Diagnostic session security rules or archive-only admin workflow are missing.');
}

console.log(`Source check passed: ${files.length} JavaScript files parsed; Expo, app identifiers, shared legal contacts, privacy-safe diagnostics register, cross-platform module configuration, native iOS PiP and guarded iOS/Android streaming lifecycles verified.`);
