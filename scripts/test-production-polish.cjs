const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function load(file, mocks = {}, globals = {}) {
  const { code } = babel.transformSync(read(file), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, __DEV__: false, ...globals, require: id => {
    assert.ok(id in mocks, `Unexpected dependency: ${id}`);
    return mocks[id];
  } });
  return exports;
}

const appSource = read('App.js');
// Evaluate actual callback bodies, not a reimplementation of their guards.
function callback(name, values) {
  let found;
  babel.transformSync(appSource, {
    configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
    plugins: [() => ({ visitor: { VariableDeclarator(p) {
      if (p.node.id.name === name) found = p.node.init.arguments[0];
    } } })],
  });
  assert.ok(found, `Missing callback ${name}`);
  const body = appSource.slice(found.start, found.end);
  return vm.runInNewContext(`(${body})`, values);
}
function notificationBell(values) {
  let found;
  babel.transformSync(appSource, {
    configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
    plugins: [() => ({ visitor: { JSXAttribute(p) {
      if (p.node.name.name === 'onOpenNotifications') found = p.node.value.expression;
    } } })],
  });
  return vm.runInNewContext(`(${appSource.slice(found.start, found.end)})`, values);
}

function testNavigationAndCopy() {
  const titles = load('src/config/moduleExperience.js');
  assert.equal(titles.getModuleExperience('events').productTitle, 'Events');
  assert.equal(titles.getModuleExperience('directory').productTitle, 'Business Directory');
  assert.match(read('src/components/AppHeaderModern.js'), /\? 'Business Directory' : 'Events'/);
  assert.match(read('src/components/EventDetailsModal.js'), /label="Niaz Arrangement"[^>]*disabled=\{isGuest \|\| !canArrangeNiaz\}/);
  for (const isGuest of [true, false]) {
    const calls = [];
    const values = { isGuest, currentUser: {}, profile: {}, canArrangeEventNiaz: () => !isGuest, requestSignIn: () => calls.push('login'),
      setAccountMenuOpen: () => calls.push('closeMenu'), setNotificationsDrawerOpen: () => calls.push('drawer'),
      getEventMetroArea: () => 'sydney', handleCityChange: () => calls.push('city'),
      setSelectedEvent: () => {}, setSelectedBusinessId: () => {}, setDirectoryFilter: () => {},
      setDirectoryTab: () => {}, setAppModule: () => calls.push('directory'), Date };
    notificationBell(values)();
    assert.deepEqual(calls, isGuest ? ['login'] : ['closeMenu', 'drawer']);
    calls.length = 0;
    callback('openNiazArrangement', values)({});
    assert.deepEqual(calls, isGuest ? [] : ['city', 'directory']);
  }
  for (const route of ['notifications', 'business-notifications']) {
    let requested = false;
    callback('handleHeaderNavigate', { isGuest: true, requestSignIn: () => { requested = true; } })(route);
    assert.ok(requested);
  }
  assert.match(appSource, /visible=\{!isGuest && notificationsDrawerOpen\}/);
  assert.match(appSource, /currentUser\?\.isAnonymous \? null : currentUser\?\.uid/);
  const share = load('src/utils/storeLinks.js');
  const content = share.buildAppShareContent();
  assert.ok(content.message.includes('https://download.communityconnect.siza.info'));
  assert.equal(content.message.split(share.APP_OPEN_LINK).length - 1, 1);
  assert.match(appSource, /Share\.share\(buildAppShareContent\(\)\)/);
  assert.match(read('src/components/ProfileScreen.js'), /Share\.share\(buildAppShareContent\(\)\)/);
  for (const operation of ['send_phone_code', 'verify_phone_code', 'guest_sign_in']) {
    assert.ok(appSource.includes(`recordAuthenticationFailure(err, '${operation}')`));
  }
  assert.match(appSource, /profileError \?[^\n]*<AuthDiagnosticReportButton/);
}

async function testDiagnostics() {
  const details = load('src/services/diagnostics/authFailureDetails.js');
  const privateText = 'person@example.test +61400000000 OTP=123456 AIza_FAKE_SECRET Bearer SECRET_TOKEN';
  const failure = { code: 'auth/internal-error', nativeErrorMessage:
    `HTTP status code: 403 API_KEY_SERVICE_BLOCKED firebaseappcheck.googleapis.com ${privateText}` };
  const parsed = details.getAuthFailureDetails(failure);
  assert.equal(parsed.code, 'auth/internal-error');
  assert.equal(parsed.httpStatus, 403);
  assert.equal(parsed.reasons[0], 'API_KEY_SERVICE_BLOCKED');
  const circular = { message: failure.nativeErrorMessage }; circular.cause = circular;
  assert.equal(details.getAuthFailureDetails(circular).httpStatus, 403);
  assert.equal(details.getAuthFailureDetails(new Error('auth/network-request-failed')).code, 'auth/network-request-failed');
  let persisted = null;
  let probes = 0;
  let nativeReports = 0;
  const mocks = {
    '@react-native-async-storage/async-storage': {
      getItem: async () => persisted, setItem: async (_, value) => { persisted = value; },
    },
    'expo-application': { applicationId: 'info.siza.communityevents' },
    'react-native': { Platform: { OS: 'ios' } },
    '@react-native-firebase/app': { getApp: () => ({ options: {
      appId: 'production-app-id', projectId: 'community-event-8b639', apiKey: 'DO_NOT_EXPORT_THIS_KEY',
    } }) },
    '@react-native-firebase/crashlytics': () => ({
      setCrashlyticsCollectionEnabled: async () => {}, setAttributes: async () => {},
      recordError: error => { nativeReports++; assert.ok(!error.message.includes('SECRET')); },
    }),
    '../appVersion': { appVersion: '2.0.0', appBuild: '99' },
    '../../firebase/appCheck': { appCheckProviderName: 'device-attestation',
      requestFirebaseAppCheckToken: async () => { probes++; throw failure; } },
    './authFailureDetails': details,
  };
  const api = load('src/services/diagnostics/authFailures.js', mocks);
  api.recordAuthenticationFailure(failure, 'guest_sign_in');
  await new Promise(resolve => setImmediate(resolve));
  const raw = await api.getAuthenticationDiagnosticReport();
  let report = JSON.parse(raw);
  assert.equal(report.runtime.bundleId, 'info.siza.communityevents');
  assert.equal(report.recentFailures.length, 2);
  assert.equal(report.recentFailures[1].operation, 'app_check');
  assert.ok(nativeReports >= 2);
  for (const text of ['person@example.test', '+61400000000', '123456', 'AIza_FAKE_SECRET', 'SECRET_TOKEN', 'DO_NOT_EXPORT_THIS_KEY']) {
    assert.ok(!raw.includes(text), `Report leaked ${text}`);
    assert.ok(!persisted.includes(text), `Storage leaked ${text}`);
  }
  for (let i = 0; i < 25; i++) api.recordAuthenticationFailure(failure, 'send_phone_code');
  report = JSON.parse(await api.getAuthenticationDiagnosticReport());
  assert.equal(report.recentFailures.length, 20);
  assert.equal(probes, 1, 'Repeated failures must not flood App Check');
  const restarted = load('src/services/diagnostics/authFailures.js', mocks);
  assert.equal(JSON.parse(await restarted.getAuthenticationDiagnosticReport()).recentFailures.length, 20);
  persisted = JSON.stringify([{ at: new Date(Date.now() - 8 * 86400000).toISOString(), operation: 'guest_sign_in' }]);
  const expired = load('src/services/diagnostics/authFailures.js', mocks);
  assert.equal(JSON.parse(await expired.getAuthenticationDiagnosticReport()).recentFailures.length, 0);
  persisted = 'not json';
  const broken = load('src/services/diagnostics/authFailures.js', {
    ...mocks,
    '@react-native-async-storage/async-storage': { getItem: async () => { throw Error('offline'); }, setItem: async () => { throw Error('full'); } },
    '@react-native-firebase/crashlytics': () => { throw Error('unavailable'); },
  });
  broken.recordAuthenticationFailure({ code: 'auth/invalid-verification-code' }, 'verify_phone_code');
  assert.equal(JSON.parse(await broken.getAuthenticationDiagnosticReport()).recentFailures.length, 1);
  assert.equal(probes, 1, 'An incorrect OTP must not trigger an App Check probe');
}

(async () => {
  testNavigationAndCopy();
  await testDiagnostics();
  console.log('Production polish passed: titles, guest access, share URLs, offline diagnostics, redaction, retention and reporting failure isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
