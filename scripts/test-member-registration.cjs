const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: key => { if (!(key in mocks)) throw Error('Unexpected import ' + key); return mocks[key]; } });
  return exports;
}
const helper = load('src/utils/memberProfile.js');
const { createMemberRegistrationHandlers, LEGAL_VERSION } = require('../backend/functions-lifecycle/memberRegistration');
const user = { uid: 'member', phoneNumber: '+61400000000' };
const details = { fullName: ' Test  Member ', email: ' MEMBER@EXAMPLE.COM ', privacyAccepted: true, termsAccepted: true, legalVersion: LEGAL_VERSION };
const request = data => ({ auth: { uid: user.uid, token: { firebase: { sign_in_provider: 'phone' } } }, data });
function backend(initial = {}, account = user) {
  let record = initial;
  const writes = [];
  const date = { seconds: 1000000 };
  const snapshot = ref => ({ exists: record !== null, data: () => record, createTime: date, ref });
  const db = {
    collection: name => ({ doc: uid => `${name}/${uid}` }),
    runTransaction: fn => fn({
      get: async ref => snapshot(ref),
      set: (ref, payload, options) => { assert.equal(ref, 'users/member'); assert.equal(options.merge, true); writes.push(payload); record = { ...(record || {}), ...payload }; },
      update: (ref, payload) => { writes.push(payload); record = { ...record, ...payload }; },
    }),
  };
  const handlers = createMemberRegistrationHandlers({ db, auth: { getUser: async uid => { assert.equal(uid, 'member'); return account; } }, serverTimestamp: () => 'SERVER_NOW', HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } } });
  return { ...handlers, record: () => record, writes, date };
}
async function main() {
  assert.equal(helper.memberEntryState(null, null, true), 'guest');
  assert.equal(helper.memberEntryState({ isAnonymous: true }, null, false), 'guest');
  assert.equal(helper.memberEntryState(user, null, true), 'loading');
  assert.equal(helper.memberEntryState(user, null, false), 'retry');
  assert.equal(helper.memberEntryState(user, {}, false), 'complete-profile');
  assert.equal(helper.memberEntryState(user, { fullName: 'Jane', email: 'bad' }, false), 'complete-profile');
  const complete = { fullName: 'Jane Doe', email: 'jane@example.com' };
  assert.equal(helper.memberEntryState(user, complete, false), 'ready');
  assert.equal(helper.memberEntryState({ uid: 'old-social' }, complete, false), 'verify-phone');
  assert.equal(helper.memberEntryState(user, { ...complete, accountStatus: 'banned' }, false), 'blocked');
  const rows = [{ id: 'unknown' }, { id: 'old', createdAt: '2020-01-01' }, { id: 'new', registeredAt: { seconds: 1800000000 } }, { id: 'middle', joinedAt: { toMillis: () => 1700000000000 } }];
  assert.equal(rows.sort(helper.newestMembersFirst).map(row => row.id).join(','), 'new,middle,old,unknown');
  assert.equal(helper.memberJoinedMillis({ createdAt: 'invalid', registeredAt: { _seconds: 100 } }), 100000);
  assert.equal(helper.memberJoinedLabel({}), 'Date unavailable');

  for (const bad of [{ ...details, fullName: '' }, { ...details, fullName: 'x' }, { ...details, email: 'bad' }, { ...details, email: 'x'.repeat(260) + '@a.co' }, { ...details, termsAccepted: false }, { ...details, legalVersion: 'outdated' }]) {
    const b = backend(); await assert.rejects(b.complete(request(bad))); assert.equal(b.writes.length, 0);
  }
  await assert.rejects(backend().complete({ data: details }), { code: 'unauthenticated' });
  await assert.rejects(backend().complete({ ...request(details), auth: { uid: 'member', token: { firebase: { sign_in_provider: 'anonymous' } } } }), { code: 'unauthenticated' });
  for (const account of [{ ...user, disabled: true }, { uid: 'member' }]) await assert.rejects(backend({}, account).complete(request(details)));
  for (const status of ['banned', 'archived', 'deleted']) await assert.rejects(backend({ accountStatus: status }).complete(request(details)), { code: 'permission-denied' });

  const b = backend({ role: 'admin', savedEvents: ['keep'], defaultCity: 'perth' });
  await b.complete(request({ ...details, uid: 'victim', phone: '+61411111111', role: 'superAdmin', registeredAt: 'FAKE' }));
  assert.equal(b.record().role, 'admin'); assert.equal(b.record().phone, user.phoneNumber);
  assert.equal(b.record().fullName, 'Test Member'); assert.equal(b.record().email, 'member@example.com');
  assert.equal(b.record().savedEvents[0], 'keep'); assert.equal(b.record().defaultCity, 'perth');
  assert.equal(b.record().registeredAt, b.date);
  const firstDate = b.record().registeredAt;
  await b.complete(request(details)); assert.equal(b.record().registeredAt, firstDate);
  const fresh = backend(null); await fresh.complete(request({ ...details, role: 'superAdmin' }));
  assert.equal(fresh.record().role, 'user'); assert.equal(fresh.record().registeredAt, 'SERVER_NOW');
  const trigger = backend(); await trigger.recordCreated({ data: { ref: 'users/member' } });
  await trigger.recordCreated({ data: { ref: 'users/member' } }); assert.equal(trigger.writes.length, 1);
  const deleted = backend(null); await deleted.recordCreated({ data: { ref: 'users/member' } }); assert.equal(deleted.writes.length, 0);

  // Render/interaction smoke tests without a native device or network.
  let slots = [], cursor = 0, saved = null;
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = next; }]; } };
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'Switch', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: styles => styles };
  const Component = load('src/components/CompleteProfileScreen.js', {
    react: React, 'react-native': native, './KeyboardAwareScrollView': { __esModule: true, default: 'ScrollView' },
    '../theme': { colors: {}, radius: {}, spacing: {} }, '../config/legal': { LEGAL_URLS: {}, LEGAL_DOCUMENT_VERSION: LEGAL_VERSION },
    '../utils/openExternalUrl': { openExternalUrl() {} }, '../utils/memberProfile': helper,
  }).default;
  const flat = value => Array.isArray(value) ? value.flatMap(flat) : value && typeof value === 'object' ? [value, ...flat(value.children)] : [];
  const render = (state = 'complete-profile', busy = false, error = '') => { cursor = 0; return flat(Component({ user, profile: {}, state, busy, error, onSave: async data => { saved = data; }, onRetry() {}, onSignOut() {} })); };
  let nodes = render();
  await nodes.find(n => n.props.testID === 'registration-save').props.onPress(); assert.equal(saved, null);
  nodes = render(); nodes.find(n => n.props.testID === 'registration-full-name').props.onChangeText('Jane Doe');
  nodes.find(n => n.props.testID === 'registration-email').props.onChangeText('JANE@example.com');
  nodes = render(); await nodes.find(n => n.props.testID === 'registration-save').props.onPress(); assert.equal(saved, null);
  nodes.find(n => n.type === 'Switch').props.onValueChange(true);
  nodes = render(); await nodes.find(n => n.props.testID === 'registration-save').props.onPress(); assert.equal(saved.email, 'jane@example.com');
  assert.equal(render('complete-profile', true).find(n => n.props.testID === 'registration-save').props.disabled, true);
  assert.equal(render('retry').some(n => n.props.testID === 'registration-save'), false);
  assert.equal(render('blocked').some(n => n.props.testID === 'registration-save'), false);
  const app = read('App.js');
  assert.ok(app.indexOf('const entryState = memberEntryState') < app.indexOf('if (isGuest && !guestAccessGranted)'));
  assert.match(app, /activeRequest === profileRequestRef.current/);
  for (const file of ['src/components/AdminDashboardScreen.js', 'src/business/BusinessAdminDashboard.js']) assert.match(read(file), /\.sort\(newestMembersFirst\)/);
  const rules = read('backend/firestore.rules');
  assert.match(rules, /'registeredAt', 'profileCompletedAt', 'legalAcceptedAt'/);
  assert.ok(read('src/config/legal.js').includes(LEGAL_VERSION));
  console.log('PASS: member gate, validation/consent, UI interactions, server authorization, profile preservation, trusted phone/date, retry-safe trigger, newest-first sorting and shared date formats. No live calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
