const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { code } = babel.transformSync(source, { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  const exports = {};
  vm.runInNewContext(code, { exports, setTimeout, clearTimeout, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name]; } });
  return exports;
}
const urls = load('src/utils/storeLinks.js');
const policy = load('src/utils/storeUpdatePolicy.js', { './storeLinks': urls });
const now = Date.parse('2026-10-20T00:00:00Z');
const release = { enabled: true, storeVerified: true, applicationId: 'info.siza.communityevents', version: '2.2.0', publishedAt: '2026-10-19T00:00:00Z', expiresAt: '2026-11-20T00:00:00Z' };
const notice = changes => policy.storeUpdateNotice({ release, platform: 'ios', applicationId: release.applicationId, installedVersion: '2.1.0', now, ...changes });
test('numeric versions avoid lexical comparison and ignore unknown/prerelease versions', () => {
  assert.equal(policy.isNewerStoreVersion('2.9.0', '2.10.0'), true);
  for (const [a, b] of [['2.2', '2.2.0'], ['3.0', '2.2'], ['unknown', '2.2'], ['2.1', '2.2-beta'], ['2.1', 'bad']]) assert.equal(policy.isNewerStoreVersion(a, b), false);
});
test('notice requires matching production app, verified active release and newer version', () => {
  assert.equal(notice().url, urls.APPLE_APP_STORE_URL);
  for (const data of [null, { ...release, enabled: false }, { ...release, storeVerified: false }, { ...release, publishedAt: '2027-01-01' }, { ...release, expiresAt: 'bad' }, { ...release, expiresAt: '2026-10-19' }]) assert.equal(notice({ release: data }), null);
  for (const changes of [{ installedVersion: '2.2.0' }, { installedVersion: '2.3.0' }, { applicationId: 'info.siza.communityconnect.personaltest' }, { platform: 'web' }]) assert.equal(notice(changes), null);
});
test('platform announcements are independent, URLs cannot be overridden remotely', () => {
  assert.equal(notice({ platform: 'android', applicationId: 'info.siza.communityevents.app' }), null);
  assert.equal(notice({ platform: 'android', applicationId: 'info.siza.communityevents.app', release: { ...release, applicationId: 'info.siza.communityevents.app', url: 'https://untrusted.invalid' } }).url, urls.GOOGLE_PLAY_URL);
});
test('Later snoozes for a day; expired or corrupt snoozes do not block updates', () => {
  assert.equal(notice({ snoozedUntil: now + policy.UPDATE_SNOOZE_MS }), null);
  assert.ok(notice({ snoozedUntil: now - 1 }));
  assert.ok(notice({ snoozedUntil: now + policy.UPDATE_SNOOZE_MS * 20 }));
});
const { createStoreReleaseReader } = load('src/services/storeUpdate.js', {
  '@react-native-firebase/firestore': {}, '../firebase/firebase': {}, '../utils/storeUpdatePolicy': policy,
});
test('release reader coalesces, throttles, refreshes and separates platforms', async () => {
  let calls = 0; let time = now;
  const read = createStoreReleaseReader(async platform => { calls++; return platform; }, () => time);
  assert.equal(await read('web'), null);
  assert.deepEqual(await Promise.all([read('ios'), read('ios')]), ['ios', 'ios']);
  assert.equal(calls, 1);
  await read('ios'); assert.equal(calls, 1);
  await read('android'); assert.equal(calls, 2);
  time += policy.STORE_CHECK_INTERVAL_MS; await read('ios'); assert.equal(calls, 3);
});
test('network and permission errors are quiet and retry after a short cooldown', async () => {
  let time = now; let calls = 0;
  const read = createStoreReleaseReader(() => { calls++; throw Error('offline'); }, () => time);
  assert.equal(await read('ios'), null); assert.equal(await read('ios'), null); assert.equal(calls, 1);
  time += 5 * 60 * 1000; assert.equal(await read('ios'), null); assert.equal(calls, 2);
});
test('Home integration, token styling, public read-only rule and receiving team are configured', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('App.js'), /<StoreUpdateNotice visible=\{appModule === 'directory' \? directoryTab === 'home'/);
  const ui = read('src/components/StoreUpdateNotice.js');
  assert.match(ui, /Application.nativeApplicationVersion/);
  assert.match(ui, /AppState.addEventListener/);
  assert.doesNotMatch(ui, /#[0-9a-f]{3,8}\b/i);
  assert.match(read('backend/firestore.rules'), /match \/appReleases\/\{platform\} \{\s*allow get: if platform in \['ios', 'android'\];\s*allow list, write: if false;/);
  assert.equal(JSON.parse(read('eas.json')).submit.production.ios.appleTeamId, 'D36Y75H5BU');
  assert.equal(JSON.parse(read('app.json')).expo.ios.appleTeamId, 'D36Y75H5BU');
});

test('same marketing version announces a newer verified build without prompting current or newer builds', () => {
 const same = { ...release, version:'2.1.1', build:'16' };
 assert.ok(notice({ release:same, installedVersion:'2.1.1', installedBuild:'13' }));
 for(const installedBuild of ['16','17','unknown',undefined]) assert.equal(notice({ release:same, installedVersion:'2.1.1', installedBuild }),null);
 assert.equal(notice({ release:{...same,storeVerified:false}, installedVersion:'2.1.1',installedBuild:'13' }),null);
});
