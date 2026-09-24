// Runs actual component and service code with native/Firestore boundaries mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function load(file, mocks = {}) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  return exports;
}
function nodes(tree) { return tree && typeof tree === 'object' ? [tree, ...(tree.children || []).flatMap(nodes)] : []; }
function text(tree) { return nodes(tree).flatMap(node => node.children || []).filter(child => typeof child === 'string').join(' '); }
function getHandler(name, values) {
  const source = read('src/components/AdminDashboardScreen.js');
  let found;
  babel.transformSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
    plugins: [() => ({ visitor: { VariableDeclarator(p) { if (p.node.id.name === name) found = p.node.init; } } })] });
  assert.ok(found);
  return vm.runInNewContext(`(${source.slice(found.start, found.end)})`, values);
}
async function main() {
  const options = load('src/utils/eventOptions.js');
  const cities = load('src/utils/cities.js');
  const presets = load('src/utils/eventBrowseOptions.js', { './cities': cities });
  const react = { useMemo: fn => fn(), createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }) };
  const HomeFilters = load('src/components/HomeFilters.js', {
    react, 'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: value => value } },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon', '../utils/eventOptions': options,
    '../utils/eventBrowseOptions': presets, '../theme': { colors: {}, radius: {}, spacing: {} }, './CompactSelect': 'CompactSelect',
  }).default;
  const filters = { period: '', eventType: '', audienceType: '', organiser: '', hostName: '', suburb: '' };
  for (const expanded of [false, true]) {
    let toggled = false;
    let cleared = false;
    const selected = [];
    const tree = HomeFilters({ query: '', events: [], filters, showFilters: expanded,
      onToggleFilters: () => { toggled = true; }, onClear: () => { cleared = true; },
      onNearbyChange: () => selected.push('nearby'), onPresetChange: (field, value) => selected.push([field, value]) });
    assert.ok(text(tree).includes('Customised filters'));
    for (const preset of presets.EVENT_BROWSE_PRESETS) {
      const button = nodes(tree).find(node => node.type === 'Pressable' && text(node) === preset.label);
      assert.ok(button, `${preset.label} must be visible with showFilters=${expanded}`);
      button.props.onPress();
      assert.deepEqual(selected.at(-1), preset.field === 'nearby' ? 'nearby' : [preset.field, preset.value]);
    }
    const more = nodes(tree).find(node => node.type === 'Pressable' && text(node).includes(expanded ? 'Hide extra filters' : 'More filters'));
    assert.ok(more);
    more.props.onPress();
    assert.equal(toggled, true);
    assert.equal(nodes(tree).some(node => node.props?.label === 'Audience type'), expanded);
    assert.equal(cleared, false);
  }
  let cleared = false;
  const active = HomeFilters({ query: '', events: [], filters, nearby: true, showFilters: false, onClear: () => { cleared = true; } });
  const clear = nodes(active).find(node => node.type === 'Pressable' && text(node) === 'Clear Filters');
  assert.ok(clear);
  clear.props.onPress();
  assert.equal(cleared, true);
  assert.match(read('App.js'), /<EventMapView events=\{displayedEvents\}/);
  console.log('PASS visibility: nine presets always visible, More filters toggles extra fields, clear remains accessible');

  let role = 'admin';
  let saved = { eventTypes: ['Legacy', { label: 'Lecture', category: 'faith', addedByUid: 'creator' }], reciterTypes: ['Reciter A'] };
  let writes = [];
  const auth = { currentUser: { uid: 'admin', isAnonymous: false } };
  const firestore = {
    doc: (_, collection, id) => ({ collection, id }), serverTimestamp: () => 'timestamp',
    getDoc: async () => ({ exists: () => true, data: () => saved }),
    runTransaction: async (_, fn) => fn({
      get: async ref => ({ exists: () => true, data: () => ref.collection === 'users' ? { role } : saved }),
      set: (ref, data, config) => { writes.push({ ref, data, config }); saved = { ...saved, ...data }; },
    }),
  };
  const service = load('src/services/eventOptionsAdmin.js', {
    '../utils/eventOptions': options, '../firebase/firebase': { auth, db: {} }, '@react-native-firebase/firestore': firestore,
  });
  for (const label of ['Majlis', '  Friday  Prayers ', 'Custom']) {
    await assert.rejects(() => service.deleteDynamicEventType(label), /Built-in/);
  }
  await assert.rejects(() => service.deleteDynamicEventType(''), /Choose/);
  assert.equal(writes.length, 0);
  auth.currentUser = { uid: 'guest', isAnonymous: true };
  await assert.rejects(() => service.deleteDynamicEventType('Lecture'), /Sign in/);
  auth.currentUser = { uid: 'member', isAnonymous: false };
  role = 'user';
  await assert.rejects(() => service.deleteDynamicEventType('Lecture'), /Administrator/);
  assert.equal(writes.length, 0);
  role = 'admin';
  auth.currentUser = { uid: 'admin', isAnonymous: false };
  // A concurrent addition before the transaction read must survive the removal.
  saved.eventTypes.push({ label: 'Picnic', category: 'community' });
  const result = await service.deleteDynamicEventType(' lecture ');
  assert.equal(result.eventTypes.includes('Lecture'), false);
  assert.equal(result.eventTypes.includes('Picnic'), true);
  assert.equal(result.reciterTypes[0], 'Reciter A');
  assert.equal(saved.lastEventTypeDeletion.deletedByUid, 'admin');
  assert.equal(saved.lastEventTypeDeletion.deletedAt, 'timestamp');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ref.collection, 'settings');
  assert.equal(writes[0].ref.id, 'eventOptions');
  assert.equal(writes[0].config.merge, true);
  await assert.rejects(() => service.deleteDynamicEventType('Lecture'), /already been removed/);
  assert.equal(writes.length, 1);
  role = 'superAdmin';
  await service.deleteDynamicEventType('Legacy');
  assert.equal(saved.eventTypes.includes('Legacy'), false);
  await service.addDynamicEventOption('eventType', 'Lecture', 'faith');
  assert.equal(saved.eventTypes.at(-1).label, 'Lecture');
  assert.ok(writes.every(item => item.ref.collection === 'settings'), 'Must never modify an event document');
  console.log('PASS deletion: admin/super-admin, guest/member rejection, built-in protection, transaction preservation, audit and re-add');

  const old = { id: 'old', eventType: 'Removed Type', speakerName: 'Speaker', reciters: [{ name: 'Reciter' }] };
  assert.ok(options.eventTypesForExistingEvent([], old).includes('Removed Type'));
  assert.equal(options.eventTypesForExistingEvent([], undefined).includes('Removed Type'), false);
  assert.equal(options.eventTypesForExistingEvent([], { eventType: 'Removed Type' }).includes('Removed Type'), false);
  assert.equal(options.hasExistingReciterDetails(old, 'Removed Type'), true);
  assert.equal(options.hasExistingReciterDetails(old, 'Marriage'), false);
  assert.equal(options.hasExistingReciterDetails({ ...old, speakerName: '', reciters: [] }, 'Removed Type'), false);
  assert.match(read('src/components/CreateEventForm.js'), /eventTypesForExistingEvent\(dynamicOptions.eventTypes, initialEvent\)/);
  assert.match(read('src/components/CreateEventForm.js'), /hasExistingReciterDetails\(initialEvent, form.eventType\)/);
  console.log('PASS existing events: retired type and reciter information retained during editing, not offered on new events');

  let dialog;
  let deleted = 0;
  let status = '';
  let busy = false;
  const guard = { current: false };
  const values = { canAccess: true, optionBusy: false, eventOptionsLoading: false,
    removableEventTypes: ['Lecture'], deleteEventType: 'Lecture', optionMutationRef: guard,
    Alert: { alert: (...args) => { dialog = args; } },
    deleteDynamicEventType: async label => { assert.equal(label, 'Lecture'); deleted++; return { eventTypes: [] }; },
    setManagedEventOptions: () => {}, setDeleteEventType: () => {},
    setOptionBusy: value => { busy = value; }, setOptionStatus: value => { status = value; } };
  getHandler('removeEventType', values)();
  assert.equal(deleted, 0, 'Opening confirmation must not delete');
  assert.ok(dialog[1].includes('Existing events will not be changed'));
  assert.equal(dialog[2][0].style, 'cancel');
  assert.equal(dialog[2][0].onPress, undefined);
  await dialog[2][1].onPress();
  assert.equal(deleted, 1);
  assert.equal(busy, false);
  assert.equal(guard.current, false);
  assert.ok(status.includes('Existing events are unchanged'));
  getHandler('removeEventType', { ...values, deleteDynamicEventType: async () => { throw new Error('Permission denied'); } })();
  await dialog[2][1].onPress();
  assert.equal(status, 'Permission denied');
  assert.equal(busy, false);
  console.log('PASS admin UI: confirmation before mutation, cancel safe, success/error reporting and busy cleanup');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
