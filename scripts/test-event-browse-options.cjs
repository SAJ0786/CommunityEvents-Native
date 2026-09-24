const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const babel = require('@babel/core');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function load(file, mocks = {}) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  } });
  return exports;
}
function extractFunction(name, values, callback = false) {
  const source = read('App.js');
  let found;
  babel.transformSync(source, {
    configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
    plugins: [() => ({ visitor: {
      FunctionDeclaration(p) { if (!callback && p.node.id.name === name) found = p.node; },
      VariableDeclarator(p) { if (callback && p.node.id.name === name) found = callback === 'arrow' ? p.node.init : p.node.init.arguments[0]; },
    } })],
  });
  assert.ok(found, name);
  return vm.runInNewContext(`(${source.slice(found.start, found.end)})`, values);
}

async function main() {
  const cities = load('src/utils/cities.js');
  const options = load('src/utils/eventOptions.js');
  const browse = load('src/utils/eventBrowseOptions.js', { './cities': cities });
  const event = { id: 'e', createdByUserId: 'host', metroArea: 'sydney' };
  const member = { uid: 'member', isAnonymous: false };
  const niaz = browse.canArrangeEventNiaz;
  assert.equal(niaz(event, { uid: 'host' }, {}), true);
  assert.equal(niaz(event, member, {}), false);
  assert.equal(niaz(event, member, { role: 'admin', adminCity: 'sydney' }), true);
  assert.equal(niaz(event, member, { role: 'admin', adminCity: 'melbourne' }), false);
  assert.equal(niaz(event, member, { role: 'admin' }), false);
  assert.equal(niaz(event, member, { role: 'admin', adminCity: 'invalid' }), false);
  assert.equal(niaz(event, member, { role: 'superAdmin' }), true);
  assert.equal(niaz(event, { ...member, isAnonymous: true }, { role: 'superAdmin' }), false);
  assert.equal(niaz(event, { uid: 'host' }, {}, true), false);
  assert.equal(niaz(null, member, { role: 'superAdmin' }), false);
  assert.equal(niaz({ ...event, createdByUserId: 'new-owner', ownerUid: 'host' }, { uid: 'host' }, {}), false);
  for (const field of ['ownerUid', 'createdBy']) assert.equal(niaz({ id: 'e', [field]: 'host' }, { uid: 'host' }, {}), true);
  for (const allowed of [false, true]) {
    let opened = false;
    extractFunction('openNiazArrangement', {
      canArrangeEventNiaz: () => allowed, currentUser: member, profile: {}, isGuest: false,
      getEventMetroArea: () => 'sydney', handleCityChange: () => {}, setSelectedEvent: () => {},
      setSelectedBusinessId: () => {}, setDirectoryFilter: () => {}, setDirectoryTab: () => {},
      setAppModule: () => { opened = true; }, Date,
    }, true)(event);
    assert.equal(opened, allowed);
  }
  console.log('PASS Niaz: owner, transferred owner, city admin, super admin, guests and handler guard');

  assert.deepEqual(Array.from(browse.EVENT_BROWSE_PRESETS, item => item.label),
    ['Upcoming', 'Near Me', 'Today', 'Tomorrow', 'This Week', 'This Month', 'Prayers', 'Majlis', 'Milad']);
  const now = new Date(2026, 8, 24, 18, 0);
  const matches = (date, period, clock = now) => browse.matchesEventPeriod({ eventDate: date }, period, clock);
  assert.equal(matches('2026-09-24', 'today'), true);
  assert.equal(matches('2026-09-25', 'today'), false);
  assert.equal(matches('2026-09-24', 'tomorrow'), false);
  assert.equal(matches('2026-09-25', 'tomorrow'), true);
  assert.equal(matches('2026-09-27', 'week'), true);
  assert.equal(matches('2026-09-28', 'week'), false);
  assert.equal(matches('2026-09-23', 'week'), false);
  assert.equal(matches('2026-09-30', 'month'), true);
  assert.equal(matches('2026-10-01', 'month'), false);
  assert.equal(matches('2027-01-01', 'tomorrow', new Date(2026, 11, 31, 22)), true);
  assert.equal(matches('2026-09-28', 'week', new Date(2026, 8, 27)), false);
  assert.equal(matches('2028-02-29', 'month', new Date(2028, 1, 20)), true);
  assert.equal(browse.matchesEventPeriod({ isLive: true, eventDate: '2026-09-23' }, 'today', now), false);
  assert.equal(browse.matchesEventPeriod({}, 'today', now), false);
  const appSource = read('App.js');
  assert.match(appSource, /<EventMapView events=\{displayedEvents\}/);
  assert.doesNotMatch(appSource, /homeViewMode === 'list' \? <HomeFilters/);
  assert.doesNotMatch(appSource, /contentContainerStyle=\{styles.browseChips\}/);
  const mapSource = read('src/components/EventMapView.js');
  assert.doesNotMatch(mapSource, /TIME_FILTERS|timeFilter|filterEventsByTime|filteredEvents/);
  assert.match(mapSource, /style=\{styles.legend\}/);
  const filters = { period: 'tomorrow', eventType: 'Majlis', audienceType: 'Family Event', organiser: 'private', hostName: 'Ali', suburb: 'Auburn' };
  const filtered = extractFunction('filterHomeEvents', {
    matchesEventPeriod: (item, period) => browse.matchesEventPeriod(item, period, now),
    EVENT_TYPE_GROUPS: options.EVENT_TYPE_GROUPS, compareEventsByDateTime: (a, b) => a.id.localeCompare(b.id),
  });
  const matching = { id: 'match', eventDate: '2026-09-25', eventType: 'Majlis', audienceType: 'Family Event', organiserType: 'private', hostName: 'Ali', address: { suburb: 'Auburn' } };
  const events = [matching, { ...matching, id: 'date', eventDate: '2026-09-24' }, { ...matching, id: 'type', eventType: 'Milad' }, { ...matching, id: 'audience', audienceType: 'Gents only' }, { ...matching, id: 'host', hostName: 'Another' }];
  assert.deepEqual(Array.from(filtered(events, '', filters), item => item.id), ['match']);
  assert.equal(filtered(events, 'doesnotexist', filters).length, 0);
  const noFilters = { period: '', eventType: '', audienceType: '', organiser: '', hostName: '', suburb: '' };
  assert.equal(filtered(events, '', noFilters).length, events.length);
  for (const status of ['granted', 'denied', 'error']) {
    let enabled = false;
    let location = null;
    let alerted = false;
    const toggle = extractFunction('enableNearbyEvents', {
      nearbyEventsOnly: false, setNearbyEventsOnly: value => { enabled = value; },
      setEventUserLocation: value => { location = value; }, Alert: { alert: () => { alerted = true; } },
      Location: { Accuracy: { Balanced: 1 }, requestForegroundPermissionsAsync: async () => ({ status: status === 'denied' ? 'denied' : 'granted' }),
        getCurrentPositionAsync: async () => { if (status === 'error') throw new Error('offline'); return { coords: { latitude: -33.8, longitude: 151.1 } }; } },
    }, 'arrow');
    await toggle();
    assert.equal(enabled, status === 'granted');
    assert.equal(Boolean(location), status === 'granted');
    assert.equal(alerted, status !== 'granted');
  }
  const react = { useMemo: fn => fn(), createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }) };
  const EventPresetStrip = load('src/components/HomeFilters.js', {
    react, 'react-native': { ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: value => value } },
    '@expo/vector-icons/MaterialCommunityIcons': 'Icon', '../utils/eventOptions': options,
    '../utils/eventBrowseOptions': browse, '../theme': { colors: {}, radius: {}, spacing: {} }, './CompactSelect': 'CompactSelect',
  }).EventPresetStrip;
  const selections = [];
  const filterTree = EventPresetStrip({ filters: noFilters,
    onNearbyChange: () => selections.push('nearby'), onPresetChange: (field, value) => selections.push([field, value]) });
  function nodes(tree) { return tree && typeof tree === 'object' ? [tree, ...(tree.children || []).flatMap(nodes)] : []; }
  for (const preset of browse.EVENT_BROWSE_PRESETS) {
    const button = nodes(filterTree).find(node => node.type === 'Pressable' && node.children.some(child => child?.children?.includes(preset.label)));
    assert.ok(button, preset.label);
    button.props.onPress();
    assert.deepEqual(selections.at(-1), preset.field === 'nearby' ? 'nearby' : [preset.field, preset.value]);
  }
  console.log('PASS filters: nine presets, date boundaries, combined filters, List/Map wiring and audience legends');

  assert.equal(options.EVENT_TYPES.length, 13);
  for (const name of ['Friday Prayers', 'Dua-e-Kumail', 'Dua-e-Tawassul', 'Dua-e-Nutba']) {
    assert.equal(options.getEventTypeCategory(name), 'faith');
    assert.equal(options.RELIGIOUS_EVENT_TYPES.has(name), true);
  }
  assert.equal(options.getEventTypeCategory('Marriage'), 'community');
  assert.equal(options.RELIGIOUS_EVENT_TYPES.has('Marriage'), false);
  const groups = options.buildEventTypeGroups(['Lecture', 'Picnic', 'Legacy', 'Majlis'], { Lecture: 'faith', Picnic: 'community' });
  assert.ok(groups.find(group => group.key === 'faith').eventTypes.includes('Lecture'));
  assert.ok(groups.find(group => group.key === 'community').eventTypes.includes('Picnic'));
  assert.ok(groups.find(group => group.key === 'other').eventTypes.includes('Legacy'));
  assert.equal(groups.flatMap(group => group.eventTypes).filter(name => name === 'Majlis').length, 1);

  let saved = { eventTypes: ['Legacy', { label: 'Old Option' }], reciterTypes: ['Guest Reciter'] };
  const auth = { currentUser: { uid: 'admin', isAnonymous: false } };
  const service = load('src/services/eventOptionsAdmin.js', {
    '../utils/eventOptions': options, '../firebase/firebase': { auth, db: {} },
    '@react-native-firebase/firestore': {
      doc: () => 'settings/eventOptions', serverTimestamp: () => 'timestamp',
      getDoc: async () => ({ exists: () => true, data: () => saved }),
      runTransaction: async (_, fn) => fn({
        get: async () => ({ exists: () => true, data: () => saved }),
        set: (_, data, config) => { assert.equal(config.merge, true); saved = { ...saved, ...data }; },
      }),
    },
  });
  await assert.rejects(() => service.addDynamicEventOption('eventType', 'Lecture'), /Choose an event category/);
  await assert.rejects(() => service.addDynamicEventOption('eventType', 'Lecture', 'invalid'), /Choose an event category/);
  const response = await service.addDynamicEventOption('eventType', 'Lecture', 'faith');
  assert.equal(saved.eventTypes.at(-1).category, 'faith');
  assert.equal(saved.eventTypes.at(-1).addedByUid, 'admin');
  assert.equal(response.eventTypeCategories.Lecture, 'faith');
  assert.ok(response.legacyEventTypes.includes('Legacy'));
  assert.ok(response.legacyEventTypes.includes('Old Option'));
  assert.equal(response.legacyEventTypes.includes('Lecture'), false);
  assert.equal(response.reciterTypes[0], 'Guest Reciter');
  await service.addDynamicEventOption('eventType', 'Picnic', 'community');
  await service.addDynamicEventOption('eventType', 'Workshop', 'other');
  await assert.rejects(() => service.addDynamicEventOption('eventType', ' lecture ', 'other'), /already exists/);
  await assert.rejects(() => service.addDynamicEventOption('eventType', 'Friday Prayers', 'faith'), /already exists/);
  await service.addDynamicEventOption('reciterType', 'Guest Speaker');
  assert.equal('category' in saved.reciterTypes.at(-1), false);
  auth.currentUser = { uid: 'guest', isAnonymous: true };
  await assert.rejects(() => service.addDynamicEventOption('eventType', 'Another', 'faith'), /Sign in/);
  const form = read('src/components/CreateEventForm.js');
  assert.match(form, /buildEventTypeGroups\(dynamicOptions, categories\)/);
  assert.match(form, /categories=\{dynamicOptions.eventTypeCategories\}/);
  assert.match(form, /legacyEventTypes\?\.includes\(form.eventType\)/);
  const admin = read('src/components/AdminDashboardScreen.js');
  assert.match(admin, /!newEventCategory \|\| newEventType.trim\(\).length < 2/);
  assert.match(admin, /kind === 'eventType' \? newEventCategory : undefined/);
  console.log('PASS categories: defaults, saved categories, legacy/reciter compatibility and duplicate protection');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
