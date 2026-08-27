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

if (app.name !== 'Community Connect Australia') throw new Error(`Unexpected store name: ${app.name}`);
if (app.version !== '1.0.0' || packageJson.version !== app.version) {
  throw new Error('App and package release versions must both be 1.0.0.');
}
if (app.android?.package !== 'info.siza.communityevents.app') throw new Error('Unexpected Android application ID.');
if (app.ios?.bundleIdentifier !== 'info.siza.communityevents') throw new Error('Unexpected iOS bundle identifier.');
if (Number(app.android?.versionCode) < 36) throw new Error('Android versionCode must be at least 36.');
if (!app.ios?.buildNumber) throw new Error('iOS buildNumber is required.');
if (app.ios?.supportsTablet !== false) throw new Error('Version 1 is scoped to iPhone and must not claim untested iPad support.');

if (!/versionName\s+["']1\.0\.0["']/.test(androidGradle)) throw new Error('Checked-in Android versionName is not 1.0.0.');
if (!/versionCode\s+36\b/.test(androidGradle)) throw new Error('Checked-in Android versionCode is not 36.');
if (!/^android\.compileSdkVersion=36$/m.test(gradleProperties)) throw new Error('Android compile SDK 36 is not pinned.');
if (!/^android\.targetSdkVersion=36$/m.test(gradleProperties)) throw new Error('Android target SDK 36 is not pinned.');

const production = eas.build?.production;
if (production?.environment !== 'production' || production?.env?.APP_RELEASE_MODE !== 'production') {
  throw new Error('EAS production builds must use production environment and disable tester mode.');
}
if (production?.ios?.image !== 'latest') {
  throw new Error('Production iOS must use the current EAS image so App Store builds use the required iOS 26 SDK.');
}
if (!production?.autoIncrement) throw new Error('Production build numbers must auto-increment.');

requireFile('GoogleService-Info.plist');
requireFile('google-services.json');
requireFile('android/app/google-services.json');
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

console.log('Release configuration check passed: v1.0.0, store identities, API 36, iOS 26 build image, Firebase files, legal drafts, and opaque 1024px icon verified.');
