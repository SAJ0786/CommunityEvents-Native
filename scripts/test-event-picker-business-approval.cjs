// Runs actual service/component code with native boundaries mocked; no live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file, mocks) {
  const { code } = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require: id => {
    if (!(id in mocks)) throw new Error(`Unexpected dependency: ${id}`);
    return mocks[id];
  }, console, setTimeout, clearTimeout });
  return exports;
}
function assertDefined(value, key = 'write') {
  assert.notEqual(value, undefined, `${key} must not be undefined`);
  if (value && typeof value === 'object') {
    for (const [name, child] of Object.entries(value)) assertDefined(child, `${key}.${name}`);
  }
}
async function testBusinessApproval() {
  // Mirrors Native Firebase User's prototype getters, unlike a plain-object mock.
  class NativeUser {
    get uid() { return 'admin-test'; }
    get email() { return null; }
    get isAnonymous() { return false; }
  }
  const nativeUser = new NativeUser();
  assert.equal({ ...nativeUser }.uid, undefined);
  let role = 'superAdmin';
  let business;
  let history = [];
  let committed = [];
  const firestore = {
    doc: (...args) => ({ collection: args.length === 1 ? args[0].collection : args[1], id: args.at(-1) }),
    collection: (_, name) => ({ collection: name }),
    getDoc: async ref => ({ exists: () => true, id: ref.id, data: () => ref.collection === 'users' ? { role } : business }),
    getDocs: async () => ({ docs: history.map(item => ({ id: item.id, data: () => item })) }),
    serverTimestamp: () => ({ sentinel: 'serverTimestamp' }),
    writeBatch: () => {
      const writes = [];
      const write = (ref, data) => { assertDefined(data); writes.push({ ref, data }); };
      return { update: write, set: write, commit: async () => { committed = writes; } };
    },
  };
  const api = load('src/services/businesses.js', {
    '@react-native-firebase/firestore': firestore,
    '@react-native-firebase/functions': { httpsCallable: () => async () => ({ data: { verified: true } }) },
    '../firebase/firebase': { db: {}, functions: {}, ensureFirebaseSession: async () => nativeUser },
  });
  for (const update of [false, true]) {
    for (const hasAbn of [false, true]) {
      business = { name: 'Test business', ownerId: 'owner-test', status: 'pending',
        hasPublishedVersion: update, reviewType: update ? 'update' : '',
        referrer: { name: 'Referrer', phone: '0400000000', location: 'Sydney' },
        abn: hasAbn ? '51824753556' : '', abnVerified: hasAbn,
        abrVerification: { status: 'verified', abn: '51824753556' },
      };
      await api.approveBusinessListing('listing-test', { referrerConfirmed: true, publishWithoutAbn: true });
      assert.equal(committed.length, 4);
      assert.equal(committed[0].data.approvedBy, 'admin-test');
      assert.equal(committed[0].data.referrerReview.checkedBy, 'admin-test');
      assert.equal(committed[2].data.ownerUid, 'owner-test');
      assert.equal(committed[3].data.actorId, 'admin-test');
      assert.equal(committed[3].data.actorEmail, '');
    }
  }
  history = [{ id: 'old-listing', name: 'Old name', status: 'deleted', abn: '51824753556' }];
  await assert.rejects(() => api.approveBusinessListing('listing-test', { referrerConfirmed: true }), /Review its history/);
  await api.approveBusinessListing('listing-test', { referrerConfirmed: true, historyReviewed: true });
  assert.equal(committed[0].data.priorHistoryReview.confirmedBy, 'admin-test');
  role = 'user';
  await assert.rejects(() => api.approveBusinessListing('listing-test'), /Administrator access/);
  console.log('PASS approval: native getters, new listings, updates, ABN/no ABN, historical review and role restrictions');
}
function testPicker() {
  let state;
  let dismissals = 0;
  const platform = { OS: 'ios' };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { if (state === undefined) state = initial; return [state, next => { state = next; }]; },
    useEffect: callback => callback(),
  };
  const native = Object.fromEntries(['Modal', 'Pressable', 'SafeAreaView', 'ScrollView', 'Text', 'View'].map(name => [name, name]));
  const Picker = load('src/components/EventDateTimePicker.js', {
    react,
    'react-native': { ...native, Platform: platform, Keyboard: { dismiss: () => dismissals++ }, StyleSheet: { create: x => x, absoluteFillObject: {} } },
    '@react-native-community/datetimepicker': 'NativePicker',
    '../theme': { colors: {}, spacing: {} },
  }).default;
  function flatten(node) {
    return node && typeof node === 'object' ? [node, ...node.props.children.flat(Infinity).flatMap(flatten)] : [];
  }
  const first = new Date(2026, 8, 12, 12, 0);
  const changed = new Date(2026, 8, 14, 15, 30);
  for (const mode of ['date', 'time']) {
    state = undefined;
    let selected;
    let closed = 0;
    const props = { value: first, mode, title: 'Choose', onChange: (_, date) => { selected = date; }, onClose: () => closed++ };
    let nodes = flatten(Picker(props));
    assert.equal(nodes[0].type, 'Modal');
    nodes.find(n => n.type === 'NativePicker').props.onChange({ type: 'set' }, changed);
    assert.equal(selected, undefined, 'wheel edits must wait for Done');
    assert.equal(closed, 0);
    nodes = flatten(Picker(props));
    const buttons = nodes.filter(n => n.type === 'Pressable');
    buttons.at(-1).props.onPress();
    assert.equal(selected, changed);
    assert.equal(closed, 1);
    selected = undefined;
    buttons.at(-2).props.onPress();
    assert.equal(selected, undefined, 'Cancel must not commit');
    platform.OS = 'android';
    const android = Picker(props);
    assert.equal(android.type, 'NativePicker');
    assert.equal(android.props.mode, mode);
    assert.equal(android.props.onChange, props.onChange);
    platform.OS = 'ios';
  }
  assert.ok(dismissals > 0);
  console.log('PASS picker: iOS modal, staged selection, Done/Cancel, Android native dialog path');
}
testBusinessApproval().then(testPicker).catch(error => { console.error(error); process.exitCode = 1; });
