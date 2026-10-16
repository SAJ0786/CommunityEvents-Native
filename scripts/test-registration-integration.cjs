const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file) {
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { exports, require: name => load(path.resolve(path.dirname(file), name + '.js')) }); return exports;
}
const view = load(path.join(root, 'src/registration/registrationViewModel.js'));
const contract = load(path.join(root, 'src/registration/registrationClient.js'));
const feed = load(path.join(root, 'src/registration/eventFeed.js'));
test('client stays off by default and discovery uses the callable allowlist', async () => {
  let calls = [];
  const call = async (name, data) => { calls.push({ name, data }); return { data: { events: [] } }; };
  await assert.rejects(contract.createRegistrationClient(call).list({ city: 'sydney' }), /not enabled/);
  assert.equal(calls.length, 0);
  await contract.createRegistrationClient(call, { enabled: true }).list({ city: 'sydney', scope: 'review', cursor: 'next' });
  assert.equal(calls[0].name, 'listRegistrationEvents');
  assert.equal(calls[0].data.cursor, 'next');
});
test('editing requires authorised private detail; custom type and cancellation setting survive', () => {
  assert.throws(() => view.eventDraftFromDetail({ canManage: false }, []), /manage/);
  const detail = { canManage: true, privateDetails: { address: '1 Private Lane', venue: null }, event: { title: 'Event', eventType: 'Workshop', date: '2026-12-01', suburb: 'Parramatta', capacity: 3, closes: '', allowCancellation: false }, form: { fields: [], purpose: 'Attendance' } };
  const draft = view.eventDraftFromDetail(detail, ['Majlis']);
  assert.equal(draft.eventType, 'Custom'); assert.equal(draft.customEventType, 'Workshop');
  assert.equal(draft.allowCancellation, false); assert.equal(draft.address, '1 Private Lane');
});
test('changed form requires fresh consent and does not carry renamed/retyped answers', () => {
  const detail = { form: { fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'changed', type: 'text', label: 'New question' }, { id: 'terms', type: 'consent', label: 'Agreement' }] },
    ownRegistration: { fields: [{ id: 'name', type: 'text', label: 'Name' }, { id: 'changed', type: 'text', label: 'Old question' }], answers: { name: 'Fictional', changed: 'Old answer', terms: true } } };
  const answers = view.answersForReview(detail);
  assert.equal(answers.name, 'Fictional'); assert.equal(answers.changed, undefined); assert.equal(answers.terms, false);
  detail.ownRegistration = { answersDeletedAt: 'now', fields: [], answers: {} };
  assert.equal(view.answersForReview(detail).name, undefined);
});
test('pagination de-duplicates records and cancelled answers export safely', () => {
  const result = view.mergeRegistrationPage([{ id: 'a', title: 'Old' }], [{ id: 'a', title: 'New' }, { id: 'b' }]);
  assert.equal(result.length, 2); assert.equal(result[0].title, 'New');
  assert.doesNotThrow(() => contract.registrationsCsv([{ registrationId: 'x', status: 'cancelled' }]));
  assert.match(contract.registrationsCsv([{ registrationId: 'x', fields: [{ id: 'answer', label: 'Name' }], answers: { answer: '=1+1' } }]), /'=1\+1/);
});
test('entry points stay release gated; public cards do not render private venue; closing feedback is inline', () => {
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const screen = fs.readFileSync(path.join(root, 'src/components/RegistrationScreen.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'src/registration/RegistrationEditor.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
  assert.match(app, /REGISTRATION_ENABLED && activeTab === 'registration'/);
  assert.match(app, /registrationEnabled=\{REGISTRATION_ENABLED\}/);
  assert.match(config, /eventRegistrationEnabled: process.env.EVENT_REGISTRATION_CLIENT_ENABLED === 'true'/);
  assert.match(screen, /if \(!enabled\) return/);
  const details = fs.readFileSync(path.join(root, 'src/components/RegistrationEventDetails.js'), 'utf8');
  assert.match(details, /result.privateDetails\?\.hasPoster/);
  assert.match(details, /registrationPrivate: Boolean\(result.privateDetails\)/);
  assert.match(details, /await api.poster\(event.id\)/);
  assert.match(editor, /accessibilityLabel="Registration closing date"[^\n]+\n\s*\{closingDateError\(draft\)/);
  assert.match(screen, /getDynamicEventOptions\(\)/);
  assert.match(screen, /answersForReview\(fresh\)/);
  assert.match(details, /\.cancel\(detail.event.id, detail.ownRegistration.revision\)/);
});
test('registration feed consumes sparse pages, excludes pending publicly and maps normal card fields', async () => {
  const calls = [];
  const rows = await feed.registrationEventFeed({ list: async request => {
    calls.push(request);
    if (!request.cursor) return { events: [{ id: 'pending', status: 'pending' }], nextCursor: 'page2' };
    if (request.cursor === 'page2') return { events: [], nextCursor: 'page3' };
    return { events: [{ id: 'approved', status: 'approved', date: '2026-12-01', city: 'sydney', suburb: 'Parramatta', title: 'Workshop', hasPoster: false }], nextCursor: null };
  } }, 'public', 'sydney');
  assert.equal(calls.length, 3);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'approved');
  assert.equal(rows[0].eventDate, '2026-12-01');
  assert.equal(rows[0].metroArea, 'sydney');
  assert.equal(rows[0].registrationOnly, true);
  assert.equal(rows[0].address.suburb, 'Parramatta');
  assert.equal(rows[0].address.fullAddress, undefined);
  assert.equal(rows[0].address.latitude, undefined);
  assert.equal(rows[0].imageUrl, undefined);
});
test('management feed retains pending cards and prevents non-advancing pagination', async () => {
  const rows = await feed.registrationEventFeed({ list: async () => ({ events: [{ id: 'pending', status: 'pending', canManage: true }], nextCursor: null }) }, 'mine');
  assert.equal(rows[0].status, 'pending');
  await assert.rejects(feed.registrationEventFeed({ list: async () => ({ events: [], nextCursor: 'same' }) }, 'public', 'sydney'), /did not advance/);
});
test('delete event uses new revision checked soft-deletion callable', async () => {
  const calls = [];
  const client = contract.createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data: { status: 'cancelled' } }; }, { enabled: true });
  await client.deleteEvent('event', 5);
  assert.equal(calls[0].name, 'deleteRegistrationEvent');
  assert.equal(calls[0].data.confirmation, 'DELETE EVENT');
  assert.equal(calls[0].data.expectedRevision, 5);
});
test('unified native discovery and operations replace the separate registration browser', () => {
  const source = name => fs.readFileSync(path.join(root, name), 'utf8');
  const app = source('App.js');
  const screen = source('src/components/RegistrationScreen.js');
  const modal = source('src/components/EventDetailsModal.js');
  const card = source('src/components/EventCard.js');
  const panel = source('src/components/RegistrationManagementPanel.js');
  const dashboard = source('src/components/AdminDashboardScreen.js');
  assert.match(app, /prepareHomeEvents\(\[\.\.\.events, \.\.\.registrationEvents\]/);
  assert.match(app, /registrationOnly \? visibleEvents.filter\(event => event.registrationOnly\) : visibleEvents/);
  assert.match(app, /registrationOnly \? 'All events' : 'Registration only'/);
  assert.doesNotMatch(app, /Browse registration only events/);
  assert.doesNotMatch(screen, /Browse events|My hosted events|stage === 'list'|stage === 'card'|Cancel whole event/);
  assert.match(modal, /'Edit registrations' : 'Register for event'/);
  assert.match(modal, /label="Edit Registration form"/);
  assert.match(modal, /label="Registration responses"/);
  assert.match(card, /event.status === 'pending' && event.canManage/);
  assert.match(card, />UnApproved</);
  assert.match(card, /if \(event.registrationOnly\)/);
  assert.match(panel, /profile\?\.role !== 'superAdmin'/);
  assert.match(panel, /review \? undefined : city/);
  assert.match(dashboard, /<RegistrationManagementPanel user=\{user\} profile=\{profile\} review/);
  assert.match(source('src/registration/RegistrationEditor.js'), /Remove existing private poster/);
});

function detailsFixture(detail, isGuest = false) {
  const state = [], effectDeps = [], cleanups = [], effects = [], listeners = [], calls = [], alerts = [];
  let stateIndex = 0, effectIndex = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect: (effect, deps) => {
      const index = effectIndex++;
      if (!effectDeps[index] || deps.some((dep, i) => dep !== effectDeps[index][i])) {
        effectDeps[index] = deps;
        effects.push(() => { cleanups[index]?.(); cleanups[index] = effect(); });
      }
    },
  };
  const api = {
    load: async id => { calls.push(['load', id]); return detail; },
    poster: async id => { calls.push(['poster', id]); return { mime: 'image/png', base64: 'PRIVATE_BYTES' }; },
    approve: async (...args) => { calls.push(['approve', ...args]); },
    cancel: async (...args) => { calls.push(['cancel', ...args]); },
  };
  const mocks = {
    react,
    'react-native': { ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable', Text: 'Text', View: 'View',
      AppState: { currentState: 'active', addEventListener: (_, callback) => { listeners.push(callback); return { remove() {} }; } },
      Alert: { alert: (...args) => alerts.push(args) } },
    './EventDetailsModal': { __esModule: true, default: 'NormalDetails' },
    '../registration/firebaseRegistration': { firebaseRegistration: () => api, REGISTRATION_ENABLED: true },
    '../registration/eventFeed': feed,
  };
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(path.join(root, 'src/components/RegistrationEventDetails.js'), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`Unexpected component dependency ${name}`);
    return mocks[name];
  } });
  const props = { event: { id: 'event' }, user: { uid: isGuest ? 'guest' : 'member' }, profile: { role: detail.canApprove ? 'superAdmin' : 'user' }, isGuest,
    onClose: () => calls.push(['close']), onRequireSignIn: () => calls.push(['sign-in']),
    onOperation: (event, action) => calls.push(['operation', event.id, action]),
    onEdit: event => calls.push(['edit', event.id]), onDelete: event => calls.push(['delete', event.id]) };
  return {
    calls, alerts, listeners, api,
    render: () => {
      stateIndex = 0; effectIndex = 0;
      const tree = exports.default(props);
      while (effects.length) effects.shift()();
      return tree;
    },
  };
}
test('guest registration uses the normal modal, routes to sign-in and never requests a poster', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'approved', title: 'Public title', suburb: 'Parramatta' }, canRegister: true }, true);
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.type, 'NormalDetails');
  assert.equal(tree.props.event.registrationPrivate, false);
  assert.equal(tree.props.event.address.fullAddress, undefined);
  assert.equal(tree.props.onEdit, undefined);
  tree.props.onRegister();
  assert.equal(fixture.calls.at(-1)[0], 'sign-in');
  assert.equal(fixture.calls.some(call => call[0] === 'poster'), false);
});
test('host normal modal fetches private poster, routes form/responses/edit and clears when inactive', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'pending', title: 'Private title', ownerUid: 'member', revision: 7 },
    canManage: true, canApprove: true, privateDetails: { address: '1 Private Lane', hasPoster: true } });
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.props.event.address.fullAddress, '1 Private Lane');
  assert.equal(tree.props.event.imageUrl, 'data:image/png;base64,PRIVATE_BYTES');
  tree.props.onEditRegistrationForm();
  assert.equal(fixture.calls.at(-1)[2], 'form');
  tree.props.onRegistrationResponses();
  assert.equal(fixture.calls.at(-1)[2], 'responses');
  tree.props.onEdit();
  assert.equal(fixture.calls.at(-1)[0], 'edit');
  tree.props.onApproveRegistration();
  await fixture.alerts.at(-1)[2][1].onPress();
  assert.equal(fixture.calls.some(call => call[0] === 'approve' && call[1] === 'event' && call[2] === 7), true);
  fixture.listeners[0]('background');
  const obscured = fixture.render();
  assert.equal(obscured.type, 'Modal');
  assert.equal(JSON.stringify(obscured).includes('PRIVATE_BYTES'), false);
});
test('registered attendee edits own booking and cancellation sends latest booking revision', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'approved', revision: 9 }, canEditRegistration: true,
    canCancel: true, ownRegistration: { status: 'registered', revision: 4 }, privateDetails: { address: '1 Private Lane', hasPoster: false } });
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.props.registrationDetail.canEditRegistration, true);
  tree.props.onRegister();
  assert.equal(fixture.calls.at(-1)[2], 'entry');
  tree.props.onCancelRegistration();
  await fixture.alerts.at(-1)[2][1].onPress();
  assert.equal(fixture.calls.some(call => call[0] === 'cancel' && call[1] === 'event' && call[2] === 4), true);
});
test('poster access changes recheck detail and cannot retain an old private venue', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'approved' },
    privateDetails: { address: '1 Private Lane', hasPoster: true } });
  let loads = 0;
  const original = fixture.api.load;
  fixture.api.load = async id => ++loads === 1 ? original(id) : { event: { id: 'event', status: 'approved' } };
  fixture.api.poster = async () => { throw new Error('Poster access changed.'); };
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.type, 'NormalDetails');
  assert.equal(tree.props.event.registrationPrivate, false);
  assert.equal(tree.props.event.address.fullAddress, undefined);
  assert.equal(tree.props.event.imageUrl, '');
  assert.equal(tree.props.registrationNotice, 'Poster access changed.');
});
test('My Events preserves attendee history without exposing host edit/delete controls', () => {
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const mocks = {
    react,
    'react-native': { ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    './EventCard': { __esModule: true, default: 'EventCard' },
    './MemberPageHeader': { __esModule: true, default: 'MemberPageHeader' },
    '../theme': { colors: {}, radius: {}, shadow: {}, spacing: {} },
  };
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(path.join(root, 'src/components/MyEventsScreen.js'), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`Unexpected My Events dependency ${name}`);
    return mocks[name];
  } });
  const list = exports.default({});
  const attendeeCard = list.props.renderItem({ item: { id: 'event', registrationOnly: true, isRegistered: true, status: 'cancelled', canManage: false } });
  const attendee = JSON.stringify(attendeeCard);
  assert.match(attendee, /View registration history/);
  assert.doesNotMatch(attendee, /Registration responses|"children":\["Edit"\]|"children":\["Delete"\]/);
  const hosted = JSON.stringify(list.props.renderItem({ item: { id: 'event', registrationOnly: true, status: 'pending', canManage: true } }));
  assert.match(hosted, /Edit Registration form/);
  assert.match(hosted, /Registration responses/);
});
