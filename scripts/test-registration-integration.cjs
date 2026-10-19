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
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  return node && typeof node === 'object' && node.props ? [node, ...flatten(node.props.children)] : [];
}
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
  assert.match(fs.readFileSync(path.join(root, 'src/components/CreateEventForm.js'), 'utf8'), /getDynamicEventOptions\(\)/);
  assert.match(screen, /answersForReview\(fresh\)/);
  assert.match(details, /\.cancel\(detail.event.id, detail.ownRegistration.revision\)/);
});
test('registration feed consumes sparse pages, excludes pending publicly and maps normal card fields', async () => {
  const calls = [];
  const rows = await feed.registrationEventFeed({ list: async request => {
    calls.push(request);
    if (!request.cursor) return { events: [{ id: 'pending', status: 'pending' }], nextCursor: 'page2' };
    if (request.cursor === 'page2') return { events: [], nextCursor: 'page3' };
    return { events: [{ id: 'approved', status: 'approved', date: '2026-12-01', city: 'sydney', suburb: 'Parramatta', title: 'Workshop', eventSubject: 'Community subject', organiserType: 'centre', hostName: 'Centre host', hasPoster: false }], nextCursor: null };
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
  assert.equal(rows[0].eventSubject, 'Community subject');
  assert.equal(rows[0].organiserType, 'centre');
  assert.equal(rows[0].hostName, 'Centre host');
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
  assert.match(app, /registrationOnly \? 'All events' : 'Registration\\nonly'/);
  assert.doesNotMatch(app, /Browse registration only events/);
  assert.doesNotMatch(screen, /Browse events|My hosted events|stage === 'list'|stage === 'card'|Cancel whole event/);
  assert.match(modal, /'Edit registrations' : 'Register for event'/);
  assert.match(modal, /label="Edit Registration form"/);
  assert.match(modal, /label="Registration responses"/);
  assert.match(card, /event.canManage && \(event.status === 'pending' \|\| event.hasPendingChanges/);
  assert.match(card, /Needs approval/);
  assert.match(card, /if \(event.registrationOnly\)/);
  assert.match(panel, /profile\?\.role !== 'superAdmin'/);
  assert.match(panel, /registrationEventFeed\(api, 'management', city/);
  assert.equal((dashboard.match(/<RegistrationManagementPanel /g) || []).length, 1);
  assert.match(source('src/registration/RegistrationEditor.js'), /registrationPosterControl=\{<EventPosterPicker/);
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
    poster: async (id, view = 'published') => { calls.push(['poster', id, view]); return { mime: 'image/png', base64: view === 'pending' ? 'STAGED_BYTES' : 'PRIVATE_BYTES' }; },
    approve: async (...args) => { calls.push(['approve', ...args]); },
    cancel: async (...args) => { calls.push(['cancel', ...args]); },
  };
  const mocks = {
    react,
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Modal: 'Modal', Pressable: 'Pressable', Text: 'Text', View: 'View',
      AppState: { currentState: 'active', addEventListener: (_, callback) => { listeners.push(callback); return { remove() {} }; } },
      Alert: { alert: (...args) => alerts.push(args) } },
    '../theme': require('./theme-fixture.cjs'), './EventDetailsModal': { __esModule: true, default: 'NormalDetails' },
    './ModalSafeArea': { __esModule: true, default: 'SafeAreaView' },
    '../registration/RegistrationControls': { Action: 'Action', Input: 'Input', styles: {} },
    './KeyboardAwareScrollView': { __esModule: true, default: 'ScrollView' },
    './MemberPageHeader': { __esModule: true, default: 'MemberPageHeader' },
    '../registration/firebaseRegistration': { firebaseRegistration: () => api, REGISTRATION_ENABLED: true },
    '../registration/eventFeed': feed,
    '../registration/SeriesApproval': {__esModule:true,default:'SeriesApproval'},
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
    onEdit: event => calls.push(['edit', event.id]), onDelete: event => calls.push(['delete', event.id]),
    onManageStream: event => calls.push(['stream', event.id]) };
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
  assert.equal(tree.props.canManageStream, false);
  tree.props.onRegister();
  assert.equal(fixture.calls.at(-1)[0], 'sign-in');
  assert.equal(fixture.calls.some(call => call[0] === 'poster'), false);
});
test('host normal modal fetches private poster, routes form/responses/edit and clears when inactive', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'pending', title: 'Private title', ownerUid: 'member', revision: 7 },
    canManage: true, canApprove: true, privateDetails: { address: '1 Private Lane', hasPoster: true }, form: { purpose: 'Attendance', fields: [] } });
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
  assert.equal(tree.props.canManageStream, false, 'pending events cannot stream');
  tree.props.onApproveRegistration();
  fixture.render(); await new Promise(setImmediate);
  const review = fixture.render();
  assert.match(JSON.stringify(review), /Attendance/);
  flatten(review).find(node => node.type === 'Action' && JSON.stringify(node.props.children).includes('Approve event and form')).props.onPress();
  await fixture.alerts.at(-1)[2][1].onPress();
  assert.equal(fixture.calls.some(call => call[0] === 'approve' && call[1] === 'event' && call[2] === 7), true);
  fixture.listeners[0]('background');
  const obscured = fixture.render();
  assert.equal(obscured.type, 'NormalDetails');
  assert.equal(obscured.props.event.registrationPrivate, false);
  assert.equal(JSON.stringify(obscured).includes('1 Private Lane'), false);
  assert.equal(JSON.stringify(obscured).includes('PRIVATE_BYTES'), false);
});
test('registered attendee edits own booking and cancellation sends latest booking revision', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'approved', revision: 9 }, canEditRegistration: true,
    canCancel: true, ownRegistration: { status: 'registered', revision: 4 }, privateDetails: { address: '1 Private Lane', hasPoster: false } });
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.props.canManageStream, undefined);
  assert.equal(tree.props.registrationDetail.canEditRegistration, true);
  tree.props.onRegister();
  assert.equal(fixture.calls.at(-1)[2], 'entry');
  tree.props.onCancelRegistration();
  await fixture.alerts.at(-1)[2][1].onPress();
  assert.equal(fixture.calls.some(call => call[0] === 'cancel' && call[1] === 'event' && call[2] === 4), true);
});
test('approved managers receive streaming controls from normal registration details', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'approved' }, canManage: true });
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.props.canManageStream, true);
  tree.props.onManageStream(tree.props.event);
  assert.equal(fixture.calls.at(-1)[0], 'stream');
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
  const react = { useState: value => [value, () => {}], createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const mocks = {
    react,
    'react-native': { ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    './EventCard': { __esModule: true, default: 'EventCard' },
    '../registration/registrationStatus': { registrationUnavailable:event => Boolean(event.registrationOnly && (event.deleted || event.deletedAt || event.status === 'cancelled')) },
    './MemberPageHeader': { __esModule: true, default: 'MemberPageHeader' },
    '../theme': require('./theme-fixture.cjs'),
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
  let opened;
  const list = exports.default({onPressEvent:event=>{opened=event;}});
  const attendeeCard = list.props.renderItem({ item: { id: 'event', registrationOnly: true, isRegistered: true, status: 'cancelled', canManage: false } });
  const attendee = JSON.stringify(attendeeCard);
  assert.match(attendee, /Registration history/);
  assert.doesNotMatch(attendee, /Registration responses|"children":\["Edit"\]|"children":\["Delete"\]/);
  const hostedTree = list.props.renderItem({ item: { id: 'event', registrationOnly: true, status: 'pending', canManage: true } });
  const hosted = JSON.stringify(hostedTree);
  assert.doesNotMatch(hosted, /Edit Registration form|Registration responses|"children":\["Edit"\]/);
  const findCard=node=>node?.type==='EventCard'?node:(node?.props?.children||[]).flatMap(child=>Array.isArray(child)?child:[child]).map(findCard).find(Boolean);
  findCard(hostedTree).props.onPress();
  assert.equal(opened.id,'event','Organiser shortcut opens the card; actions stay inside it');
  const events = [{id:'active',registrationOnly:true,isRegistered:true,status:'approved'}, {id:'deleted',registrationOnly:true,isRegistered:true,status:'cancelled',deleted:true}];
  const activeList = exports.default({events,userUid:'viewer'});
  assert.deepEqual(Array.from(activeList.props.data,event=>event.id),['active']);
  assert.match(JSON.stringify(activeList.props.ListFooterComponent),/Registration history/);
});

test('registered attendees get collapsed poster thumbnails and account changes discard the private image', async () => {
  const slots=[],effects=[],auth={currentUser:{uid:'member'}};let index=0,calls=0;
  const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:value=>{const i=index++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useEffect:(fn,deps)=>{const i=index++;const old=slots[i];if(!old||deps.some((value,j)=>value!==old.deps[j])){old?.cleanup?.();const item={deps};slots[i]=item;effects.push(()=>item.cleanup=fn());}}};
  const mocks={react,'react-native':{ActivityIndicator:'ActivityIndicator',AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Image:'Image',Modal:'Modal',Pressable:'Pressable',Text:'Text',View:'View',useWindowDimensions:()=>({width:393,fontScale:1}),StyleSheet:{create:v=>v}},'@expo/vector-icons/MaterialCommunityIcons':'Icon','../firebase/firebase':{auth},'../registration/registrationStatus':load(path.join(root,'src/registration/registrationStatus.js')),'../theme':require('./theme-fixture.cjs'),'../utils/formatters':{formatEventTime:()=>''},'../services/events':{getEventPoster:()=>'',getEventSuburb:()=>''},'../services/images':{getImmediatePosterSource:()=>'',resolvePosterSource:async()=>''},'../registration/firebaseRegistration':{REGISTRATION_ENABLED:true,firebaseRegistration:()=>({poster:async()=>{calls++;return{mime:'image/png',base64:'registered-poster'};}})},'../../assets/logo.png':'fallback-logo'};
  const exports={};const code=babel.transformSync(fs.readFileSync(path.join(root,'src/components/EventCard.js'),'utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-react-jsx'),require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in mocks,name);return mocks[name];}});
  let event={id:'event',eventDate:'2026-12-01',registrationOnly:true,status:'approved',hasPoster:true,isRegistered:true,revision:1};
  const render=()=>{index=0;const tree=exports.default({event});while(effects.length)effects.shift()();return tree;};
  render();await new Promise(setImmediate);let tree=render();assert.equal(calls,1);assert.equal(flatten(tree).find(node=>node.type==='Image').props.source.uri,'data:image/png;base64,registered-poster');
  auth.currentUser={uid:'another-member'};event={...event,isRegistered:false};tree=render();assert.equal(flatten(tree).find(node=>node.type==='Image').props.source,'fallback-logo');await new Promise(setImmediate);assert.equal(calls,1,'An unrelated member cannot request the collapsed private poster');
  event={...event,isRegistered:true,status:'cancelled',deleted:true};tree=render();await new Promise(setImmediate);assert.equal(calls,1,'Unavailable events do not fetch private posters');assert.equal(flatten(tree).find(node=>node.type==='Image').props.source,'fallback-logo');
});

function stagedDetail() {
  return {
    canManage: true, canApprove: true,
    event: { id: 'event', revision: 19, status: 'approved', hasPendingChanges: true, city: 'sydney', title: 'Published title', eventType: 'Majlis', date: '2026-12-01', capacity: 50, allowCancellation: true },
    form: { version: 2, purpose: 'Published purpose', fields: [{ id: 'old', type: 'text', label: 'Published question' }] },
    privateDetails: { address: '1 Published Lane', hostPhone: 'published-phone', hasPoster: true },
    pendingChanges: {
      event: { revision: 1, title: 'Staged title', eventType: 'Majlis', date: '2026-12-02', capacity: 60, allowCancellation: false,
        hostName: 'New host', organiserType: 'centre', organiserId: 'centre1', organiserName: 'Centre', organisationType: 'community', isOnBehalfOf: true,
        eventSubject: 'New subject', audienceType: 'Family Event', speakerName: 'Speaker', reciters: [{ type: 'Custom', customType: 'Poetry', name: 'Reciter' }],
        timeMode: 'prayer', prayerName: 'maghrib', prayerLabel: 'Maghrib', prayerOffsetMinutes: 30, prayerTimeZone: 'Australia/Sydney',
        hijriDate: 'Hijri display', enteredAsHijri: true, hijriDay: 2, hijriMonth: 6, hijriYear: 1448 },
      form: { version: 3, purpose: 'Staged purpose', fields: [{ id: 'new', type: 'select', label: 'Staged question', options: ['One', 'Two'], description: 'New help', required: true }, { id: 'terms', type: 'consent', label: 'Agreement', terms: 'Staged terms', required: true }] },
      privateDetails: { address: '2 Staged Lane', venue: { fullAddress: '2 Staged Lane', suburb: 'Parramatta', state: 'NSW', latitude: -33.8, longitude: 151 }, hostPhone: 'private-phone', hostContactOptional: 'private@example.test', hasPoster: true },
      submittedAt: '2026-10-16', submittedBy: 'organiser',
    },
  };
}
test('manager draft selects staging and roundtrips every normal-event metadata field without public poster paths', () => {
  const detail = stagedDetail();
  const draft = view.eventDraftFromDetail(detail, ['Majlis']);
  assert.equal(draft.title, 'Staged title');
  assert.equal(draft.address, '2 Staged Lane');
  assert.equal(draft.hostPhone, 'private-phone');
  assert.equal(draft.hostContactOptional, 'private@example.test');
  assert.equal(draft.fields[0].label, 'Staged question');
  assert.equal(draft.allowCancellation, false);
  const normal = view.normalEventFromRegistrationDraft(draft);
  assert.equal(normal.eventDate, '2026-12-02');
  assert.equal(normal.address.latitude, -33.8);
  assert.equal(normal.imageUrl, undefined);
  const mapped = view.registrationDraftFromNormalEvent(draft, { ...normal, metroArea: 'perth', imageUrl: 'https://public.test/poster', imagePath: 'public/path', _localImageUri: 'file://public', address: { ...normal.address, fullAddress: '3 Changed Lane' } });
  for (const key of Object.keys(detail.pendingChanges.event).filter(key => !['title', 'eventType', 'date', 'capacity', 'allowCancellation', 'revision'].includes(key))) {
    assert.equal(JSON.stringify(mapped[key]), JSON.stringify(detail.pendingChanges.event[key]), key);
  }
  assert.equal(mapped.address, '3 Changed Lane');
  assert.equal(mapped.venue.fullAddress, '3 Changed Lane');
  assert.equal(mapped.city, undefined, 'normal form cannot change the selected event city');
  assert.equal(mapped.imageUrl, undefined);
  assert.equal(mapped.imagePath, undefined);
  assert.equal(mapped._localImageUri, undefined);
  assert.equal(detail.event.title, 'Published title');
  assert.equal(detail.form.fields[0].label, 'Published question');
  draft.fields[0].label = 'Local edit';
  assert.equal(detail.pendingChanges.form.fields[0].label, 'Staged question');
});
test('attendee answer review uses published questions even when the host has staged changes', () => {
  const detail = stagedDetail();
  detail.ownRegistration = { fields: detail.form.fields, answers: { old: 'Published answer', new: 'Never copy staged answer' } };
  assert.equal(view.answersForReview(detail).old, 'Published answer');
  assert.equal(view.answersForReview(detail).new, undefined);
});
test('poster client distinguishes manager pending review without changing load arguments or published default', async () => {
  const calls = [];
  const api = contract.createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data: {} }; }, { enabled: true });
  await api.load('event'); await api.poster('event'); await api.poster('event', 'pending');
  assert.equal(JSON.stringify(calls[0]), JSON.stringify({ name: 'getRegistrationEvent', data: { eventId: 'event' } }));
  assert.equal(JSON.stringify(calls[1].data), JSON.stringify({ eventId: 'event' }));
  assert.equal(JSON.stringify(calls[2].data), JSON.stringify({ eventId: 'event', view: 'pending' }));
});
test('approved staged review displays submitted event, private venue, poster and full form before approval with published revision', async () => {
  const detail = stagedDetail();
  const fixture = detailsFixture(detail);
  fixture.render(); await new Promise(setImmediate);
  const published = fixture.render();
  assert.equal(published.props.event.title, 'Published title');
  assert.equal(published.props.event.address.fullAddress, '1 Published Lane');
  assert.equal(published.props.event.imageUrl, 'data:image/png;base64,PRIVATE_BYTES');
  assert.equal(published.props.event.hostPhone, undefined);
  assert.equal(published.props.event.hostContactOptional, undefined);
  assert.match(JSON.stringify(published.props.registrationNotice), /Review submitted changes/);
  assert.equal(fixture.calls.some(call => call[0] === 'poster' && call[2] === 'pending'), false);
  published.props.onApproveRegistration();
  assert.equal(fixture.calls.some(call => call[0] === 'approve'), false);
  fixture.render(); await new Promise(setImmediate);
  const review = fixture.render();
  for (const value of ['Staged title', '2 Staged Lane', 'private-phone', 'private@example.test', 'Staged purpose', 'Staged question', 'New help', 'One', 'Two', 'Staged terms', 'STAGED_BYTES', 'New host', 'Poetry: Reciter']) assert.ok(JSON.stringify(review).includes(value), value);
  assert.equal(fixture.calls.some(call => call[0] === 'poster' && call[2] === 'pending'), true);
  const approval = flatten(review).find(node => node.type === 'Action' && JSON.stringify(node.props.children).includes('Approve event and form'));
  assert.equal(approval.props.disabled, false);
  fixture.api.approve = async (...args) => {
    fixture.calls.push(['approve', ...args]);
    detail.event = { ...detail.pendingChanges.event, id: 'event', city: 'sydney', status: 'approved', revision: 28, hasPendingChanges: false };
    detail.form = detail.pendingChanges.form; detail.privateDetails = detail.pendingChanges.privateDetails;
    delete detail.pendingChanges;
  };
  const previousLoads = fixture.calls.filter(call => call[0] === 'load').length;
  approval.props.onPress(); await fixture.alerts.at(-1)[2][1].onPress();
  assert.equal(fixture.calls.some(call => JSON.stringify(call) === JSON.stringify(['approve', 'event', 19])), true, 'use published control revision, not staged revision');
  fixture.render(); await new Promise(setImmediate);
  assert.ok(fixture.calls.filter(call => call[0] === 'load').length > previousLoads, 'reload published state after approval; never predict its new revision');
  const reloaded = fixture.render();
  assert.equal(reloaded.type, 'NormalDetails');
  assert.equal(reloaded.props.event.title, 'Staged title');
  assert.equal(reloaded.props.event.revision, 28);
});
test('unreadable staged poster blocks approval and background clears the review', async () => {
  const fixture = detailsFixture(stagedDetail());
  fixture.render(); await new Promise(setImmediate);
  fixture.render().props.onApproveRegistration();
  fixture.api.poster = async () => { throw new Error('Cannot read submitted poster'); };
  fixture.render(); await new Promise(setImmediate);
  const review = fixture.render();
  const approval = flatten(review).find(node => node.type === 'Action' && JSON.stringify(node.props.children).includes('Approve event and form'));
  assert.equal(approval.props.disabled, true);
  fixture.listeners[0]('background');
  assert.equal(JSON.stringify(fixture.render()).includes('Staged title'), false);
});
test('staged poster removal never falls back to the still-published private poster', async () => {
  const detail = stagedDetail();
  detail.pendingChanges.privateDetails.hasPoster = false;
  const fixture = detailsFixture(detail);
  fixture.render(); await new Promise(setImmediate);
  fixture.render().props.onApproveRegistration();
  const previousPosters = fixture.calls.filter(call => call[0] === 'poster').length;
  fixture.render(); await new Promise(setImmediate);
  const review = fixture.render();
  assert.match(JSON.stringify(review), /No poster in this submitted version/);
  assert.doesNotMatch(JSON.stringify(review), /PRIVATE_BYTES|STAGED_BYTES/);
  assert.equal(fixture.calls.filter(call => call[0] === 'poster').length, previousPosters);
  const approval = flatten(review).find(node => node.type === 'Action' && JSON.stringify(node.props.children).includes('Approve event and form'));
  assert.equal(approval.props.disabled, false);
});
test('denied pending poster rechecks authorization and drops stale manager venue and staged content', async () => {
  const fixture = detailsFixture(stagedDetail());
  fixture.render(); await new Promise(setImmediate);
  fixture.render().props.onApproveRegistration();
  fixture.api.poster = async () => { throw Error('No longer authorized'); };
  let loads = 0;
  fixture.api.load = async () => ++loads === 1 ? stagedDetail() : { event: { id: 'event', status: 'approved', title: 'Public title' }, canManage: false };
  fixture.render(); await new Promise(setImmediate);
  const reloaded = fixture.render();
  assert.equal(reloaded.type, 'NormalDetails');
  assert.equal(reloaded.props.event.registrationPrivate, false);
  assert.equal(reloaded.props.onApproveRegistration, undefined);
  assert.doesNotMatch(JSON.stringify(reloaded), /Staged Lane|Staged title|private-phone/);
});

function componentFixture(file, mocks, props) {
  const hooks = [], effects = [];
  let index = 0;
  const changed = (previous, next) => !previous || next.some((value, i) => value !== previous[i]);
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const i = index++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
    },
    useRef: initial => { const i = index++; return hooks[i] || (hooks[i] = { current: initial }); },
    useMemo: (fn, deps) => {
      const i = index++;
      if (!hooks[i] || changed(hooks[i].deps, deps)) hooks[i] = { deps, value: fn() };
      return hooks[i].value;
    },
    useEffect: (fn, deps) => {
      const i = index++;
      if (!hooks[i] || changed(hooks[i].deps, deps)) {
        hooks[i] = { deps };
        effects.push(fn);
      }
    },
  };
  const exports = {};
  const code = babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  vm.runInNewContext(code, { exports, require: name => {
    if (name === 'react') return react;
    if (name === './EventDetailsModal') return {__esModule:true,default:'Details'};
    if (name === '../registration/eventFeed') return feed;
    if (name === '../registration/registrationStatus') return load(path.join(root,'src/registration/registrationStatus.js'));
    if (!(name in mocks)) throw Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  } });
  return { render: () => {
    index = 0;
    const tree = exports.default(props);
    while (effects.length) effects.shift()();
    return tree;
  } };
}
function normalFormFixture(initialEvent, registrationMode) {
  const submissions = [];
  const native = Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'Switch', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  const fixture = componentFixture('src/components/CreateEventForm.js', {
    'react-native': { ...native, StyleSheet: { create: value => value }, Alert: { alert() {} } },
    'expo-image-picker': {},
    './HorizontalStrip': 'HorizontalStrip',
    './EventPosterPicker': 'EventPosterPicker',
    './EventDateTimePicker': 'EventDateTimePicker',
    './KeyboardAwareScrollView': 'ScrollView',
    './NativeBackButton': 'NativeBackButton', './MemberPageHeader': 'MemberPageHeader',
    './AddressAutocomplete': 'AddressAutocomplete',
    './CompactSelect': 'CompactSelect',
    '../theme': require('./theme-fixture.cjs'),
    '../services/cityCatalogue': { useCityCatalogueVersion: () => 0 },
    '../services/hijri': { getHijriDisplay: () => '', getHijriParts: () => ({ day: 1, month: 1, year: 1448 }), HIJRI_MONTHS: [] },
    '../services/prayerTimes': { calculatePrayerTimes: () => null },
    '../services/settings': { getHijriSettings: async () => ({ overrides: [] }) },
    '../services/organisations': { getOrganisations: async () => [], normalizeOrganisationType: value => value },
    '../services/eventOptionsAdmin': { getDynamicEventOptions: async () => ({ eventTypes: [], reciterTypes: [] }) },
    '../utils/cities': { cityLabel: value => value, classifyMetroArea: () => 'perth', normalizeCity: value => value },
    '../utils/eventOptions': load(path.join(root, 'src/utils/eventOptions.js')),
  }, { initialEvent, registrationMode, defaultCity: 'sydney', allowUnchangedSubmit: true, onSubmit: value => submissions.push(value) });
  return { ...fixture, submissions };
}
test('actual shared form isolates registration date-only/overnight and private poster behavior from normal mode', async () => {
  const base = { id: 'event', hostName: 'Host', eventType: 'Majlis', eventDate: '2027-12-01', notes: '', address: { fullAddress: 'Private address', suburb: 'Parramatta', state: 'NSW', latitude: -33.8, longitude: 151 } };
  const send = fixture => {
    const tree = fixture.render();
    flatten(tree).find(node => node.type === 'Pressable' && node.props.onPress?.name === 'handleSubmit').props.onPress();
    return tree;
  };
  const dateOnly = normalFormFixture(base, true);
  const dateTree = send(dateOnly);
  assert.equal(dateOnly.submissions.length, 1);
  assert.equal(dateOnly.submissions[0].startTime, '');
  assert.equal(flatten(dateTree).some(node => node.props.placeholder === 'https://example.com/poster.jpg'), false);
  for (const key of ['imageUrl', 'imagePath', '_localImageUri', '_localImageMimeType']) assert.equal(key in dateOnly.submissions[0], false, key);
  const overnight = normalFormFixture({ ...base, startTime: '23:30', endTime: '01:00' }, true);
  send(overnight);
  assert.equal(overnight.submissions[0].endTime, '01:00');
  const same = normalFormFixture({ ...base, startTime: '23:30', endTime: '23:30' }, true);
  send(same); assert.equal(same.submissions.length, 0);
  const noStart = normalFormFixture({ ...base, endTime: '01:00' }, true);
  send(noStart); assert.equal(noStart.submissions.length, 0);
  const malformed = normalFormFixture({ ...base, startTime: '25:00' }, true);
  send(malformed); assert.equal(malformed.submissions.length, 0);
  const normalDateOnly = normalFormFixture(base);
  const normalTree = send(normalDateOnly);
  assert.equal(normalDateOnly.submissions.length, 0);
  assert.equal(flatten(normalTree).some(node => node.props.placeholder === 'https://example.com/poster.jpg'), true);
  const normalOvernight = normalFormFixture({ ...base, startTime: '23:30', endTime: '01:00' });
  send(normalOvernight); assert.equal(normalOvernight.submissions.length, 0);
  const normal = normalFormFixture({ ...base, startTime: '18:00', endTime: '19:00', imageUrl: 'https://public.test/poster' });
  send(normal); assert.equal(normal.submissions[0].imageUrl, 'https://public.test/poster');
  await new Promise(setImmediate);
});
test('editor renders the actual shared form in registration mode and keeps dedicated registration/poster controls', async () => {
  const detail = stagedDetail();
  detail.pendingChanges.form.fields[0].perParticipant = true;
  const fixture = componentFixture('src/registration/RegistrationEditor.js', {
    'react-native': { Image: 'Image', Switch: 'Switch', Text: 'Text', View: 'View' },
    'expo-image-picker': {},
    '../components/EventPosterPicker': 'EventPosterPicker',
    './posterAsset': load(path.join(root, 'src/registration/posterAsset.js')),
    '../components/CreateEventForm': { __esModule: true, default: 'ActualCreateEventForm' },
    '../components/NativeDateTimeField': 'DateTimeField',
    './RegistrationControls': { Action: 'Action', Input: 'Input', styles: {} },
    './prototypeModel': load(path.join(root, 'src/registration/prototypeModel.js')),
    './privateVenue': load(path.join(root, 'src/registration/privateVenue.js')),
    './registrationViewModel': view,
    ...recurrenceEditorDependencies(),
  }, { initialDraft: view.eventDraftFromDetail(detail, ['Majlis']), eventId: 'event', city: 'sydney', savedTemplates: [], navigationInHeader: true, onCancel() {}, hasPoster: true });
  const form = flatten(fixture.render()).find(node => node.type === 'ActualCreateEventForm');
  assert.equal(form.props.registrationMode, true);
  assert.equal(form.props.onCancel, undefined, 'header owns the sole page exit');
  assert.equal(form.props.defaultCity, 'sydney');
  assert.equal(form.props.initialEvent.hostPhone, 'private-phone');
  form.props.onSubmit({ ...form.props.initialEvent, eventDate: '2027-12-02', startTime: '', endTime: '' });
  const settings = fixture.render();
  assert.match(JSON.stringify(settings), /Registration settings/);
  assert.equal(form.props.registrationPosterControl.type, 'EventPosterPicker');
  assert.equal(form.props.registrationPosterControl.props.privatePoster, true);
  assert.equal(form.props.registrationPosterControl.props.showChooseButton, false, 'tappable poster panel is the only upload action');
  assert.equal(form.props.registrationPosterControl.props.hasPoster, true);
  assert.match(JSON.stringify(settings), /Capacity \(places\)/);
  flatten(settings).find(node => node.type === 'Action' && node.props.children.flat(Infinity).join('') === 'Choose registration form').props.onPress();
  flatten(fixture.render()).find(node => node.type === 'Action' && node.props.children.flat(Infinity).join('') === 'Continue current form').props.onPress();
  const participantPreview = JSON.stringify(fixture.render());
  assert.match(participantPreview, /Participant 1/);
  assert.match(participantPreview, /Participant 2/);
  assert.doesNotMatch(participantPreview, /Participant 3/);
});

function recurrenceEditorDependencies() {
  return {
    './registrationRecurrence': load(path.join(root, 'src/registration/registrationRecurrence.js')),
    '../services/hijri': load(path.join(root, 'src/services/hijri.js')),
    '../services/settings': { getHijriSettings: async () => ({ overrides: [] }) },
    '../services/prayerTimes': load(path.join(root, 'src/services/prayerTimes.js')),
    '../utils/cities': { getCityDefinition: () => ({ timeZone: 'Australia/Sydney' }) },
  };
}
function recurrenceEditorFixture(extra = {}, overrides = {}) {
  const draft = { ...load(path.join(root, 'src/registration/prototypeModel.js')).createDraft(), title: 'Independent sessions', date: '2027-01-01',
    venue: { fullAddress: '1 Private Lane', suburb: 'Parramatta', state: 'NSW', postcode: '2150', latitude: -33.8, longitude: 151 },
    address: '1 Private Lane', suburb: 'Parramatta', closes: '2026-12-30T18:00', capacity: 10, ...extra };
  const saves = [];
  const fixture = componentFixture('src/registration/RegistrationEditor.js', {
    'react-native': { Image: 'Image', Switch: 'Switch', Text: 'Text', View: 'View' },
    'expo-image-picker': {},
    '../components/EventPosterPicker': 'EventPosterPicker',
    './posterAsset': load(path.join(root, 'src/registration/posterAsset.js')),
    '../components/CreateEventForm': { __esModule: true, default: 'ActualCreateEventForm' },
    '../components/NativeDateTimeField': 'DateTimeField',
    './RegistrationControls': { Action: 'Action', Input: 'Input', styles: {} },
    './prototypeModel': load(path.join(root, 'src/registration/prototypeModel.js')),
    './privateVenue': load(path.join(root, 'src/registration/privateVenue.js')),
    './registrationViewModel': view, ...recurrenceEditorDependencies(), ...overrides,
  }, { initialDraft: draft, city: 'sydney', savedTemplates: [], initialStep: 'settings', onSave: (...args) => saves.push(args) });
  return { ...fixture, saves };
}
function press(fixture, label) {
  const action = flatten(fixture.render()).find(node => node.type === 'Action' && node.props.children.flat(Infinity).join('') === label);
  assert.ok(action, `Action ${label} exists`); action.props.onPress();
}
function input(fixture, label, value) {
  const field = flatten(fixture.render()).find(node => node.type === 'Input' && node.props.label === label);
  assert.ok(field, `Input ${label} exists`); field.props.onChangeText(value);
}
async function previewRecurrence(fixture, cadence = 'Fortnightly') {
  fixture.render(); await new Promise(setImmediate);
  press(fixture, 'Recurring'); press(fixture, cadence); press(fixture, 'Preview occurrences');
}
function confirmAndSaveRecurrence(fixture) {
  flatten(fixture.render()).find(node => node.type === 'Switch' && node.props.accessibilityLabel === 'Confirm all independent occurrences').props.onValueChange(true);
  press(fixture, 'Choose registration form'); press(fixture, 'Continue current form'); press(fixture, 'Save event and registration form');
}
test('mounted recurrence editor previews fortnightly independent closing/capacity and date-only clocks', async () => {
  const fixture = recurrenceEditorFixture();
  await previewRecurrence(fixture);
  input(fixture, 'Occurrence 2 capacity', '17');
  const closing = flatten(fixture.render()).find(node => node.props.accessibilityLabel === 'Occurrence 2 closing date');
  closing.props.onChange('2027-01-10');
  confirmAndSaveRecurrence(fixture);
  assert.equal(fixture.saves.length, 1);
  const [draft, series] = fixture.saves[0];
  assert.equal(series.recurrence.frequency, 'week'); assert.equal(series.recurrence.repeatEvery, 2);
  assert.deepEqual(Array.from(series.occurrences, row => row.date), ['2027-01-01', '2027-01-15', '2027-01-29', '2027-02-12']);
  assert.equal(series.occurrences[1].capacity, 17); assert.equal(series.occurrences[1].closes, '2027-01-10T18:00');
  assert.equal(series.occurrences[2].closes, '2027-01-27T18:00');
  assert.equal(series.occurrences[2].startTime, ''); assert.equal(series.occurrences[2].endTime, '');
  for (const key of ['date', 'capacity', 'closes', 'startTime', 'endTime']) assert.equal(draft[key], series.occurrences[0][key]);
});
test('mounted recurrence editor blocks same-day closing, missing review and stale previews', async () => {
  const fixture = recurrenceEditorFixture();
  await previewRecurrence(fixture);
  flatten(fixture.render()).find(node => node.props.accessibilityLabel === 'Occurrence 2 closing date').props.onChange('2027-01-15');
  confirmAndSaveRecurrence(fixture);
  assert.equal(fixture.saves.length, 0); assert.match(JSON.stringify(fixture.render()), /before the event date, not the same day/);
  press(fixture, 'Review registration settings and occurrences');
  input(fixture, 'Capacity (places)', '20');
  assert.doesNotMatch(JSON.stringify(fixture.render()), /Confirm all independent occurrences/);
  press(fixture, 'Choose registration form'); press(fixture, 'Continue current form'); press(fixture, 'Save event and registration form');
  assert.equal(fixture.saves.length, 0); assert.match(JSON.stringify(fixture.render()), /Preview and confirm/);
});
test('mounted recurrence editor calculates seasonal prayer starts and preserves explicit overnight ends', async () => {
  const fixture = recurrenceEditorFixture({ timeMode: 'prayer', prayerName: 'maghreb', prayerOffsetMinutes: 10, prayerTimeZone: 'Australia/Sydney', startTime: '20:00', endTime: '01:00' });
  await previewRecurrence(fixture, 'Monthly');
  confirmAndSaveRecurrence(fixture);
  assert.equal(fixture.saves.length, 1);
  const rows = fixture.saves[0][1].occurrences;
  const prayer = load(path.join(root, 'src/services/prayerTimes.js'));
  for (const row of rows) {
    assert.equal(row.startTime, prayer.applyPrayerOffset(prayer.calculatePrayerTimes(row.date, { fullAddress: '1 Private Lane', state: 'NSW', latitude: -33.8, longitude: 151 }).maghreb, 10));
    assert.equal(row.endTime, '01:00');
  }
  assert.ok(new Set(rows.map(row => row.startTime)).size > 1, 'seasonal times are not copied');
  const broken = recurrenceEditorFixture({ timeMode: 'prayer', prayerName: 'maghreb' }, { '../services/prayerTimes': { calculatePrayerTimes: () => null } });
  await previewRecurrence(broken);
  assert.match(JSON.stringify(broken.render()), /Cannot reliably resolve prayer time/);
  assert.doesNotMatch(JSON.stringify(broken.render()), /Confirm all independent occurrences/);
});
function recurrenceScreenFixture(transport, extra = {}) {
  return componentFixture('src/components/RegistrationScreen.js', {
    'react-native': { ActivityIndicator: 'ActivityIndicator', Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) }, Pressable: 'Pressable', Share: {}, Text: 'Text', View: 'View' },
    './KeyboardAwareScrollView': 'ScrollView', './NativeBackButton': 'NativeBackButton', './MemberPageHeader': 'MemberPageHeader',
    '../registration/RegistrationEditor': { __esModule: true, default: 'Editor' },
    '../registration/RegistrationControls': { Action: 'Action', Answer: 'Answer', Input: 'Input', styles: {} },
    '../registration/firebaseRegistration': {}, '../registration/registrationClient': contract,
    '../registration/OccurrencePicker': { __esModule:true,default:'OccurrencePicker' },
    '../registration/occurrenceSelection': load(path.join(root,'src/registration/occurrenceSelection.js')),
    '../registration/responsePresentation': load(path.join(root, 'src/registration/responsePresentation.js')),
    '../services/registrationExport': { exportRegistrationWorkbook: async () => {} },
    '../registration/registrationViewModel': view, '../registration/prototypeModel': load(path.join(root, 'src/registration/prototypeModel.js')),
    '../utils/eventOptions': { EVENT_TYPES: ['Majlis'] }, '../services/eventOptionsAdmin': { getDynamicEventOptions: async () => ({ eventTypes: [] }) },
    '../utils/cities': { cityLabel: value => value }, '../theme': require('./theme-fixture.cjs'),
  }, { enabled: true, user: { uid: 'host' }, city: 'sydney', initialCreate: true, transport, ...extra });
}

test('cancelled notification and stale entry links open the read-only event card without a form',async()=>{
 const detail={event:{id:'cancelled',title:'Cancelled event',date:'2026-12-01',status:'cancelled',deleted:true},form:{version:1,fields:[]},ownRegistration:{status:'registered',revision:1,places:1,fields:[],answers:{}},canCancel:true,canRegister:false,canEditRegistration:false};
 for(const initialAction of ['history','entry','confirmation']){const fixture=recurrenceScreenFixture({load:async()=>detail},{initialCreate:false,initialEventId:'cancelled',initialAction,user:{uid:'attendee'}});fixture.render();await new Promise(setImmediate);const tree=fixture.render();assert.equal(tree.type,'Details');assert.equal(tree.props.event.status,'cancelled');assert.equal(tree.props.event.deleted,true);assert.equal(tree.props.onRegister,undefined);assert.equal(tree.props.onEdit,undefined);assert.equal(typeof tree.props.onCancelRegistration,'function');assert.doesNotMatch(JSON.stringify(tree),/Retry same submission/);}
});

test('cancellation while a registration form is open clears retries and returns to the event card',async()=>{
 const active={event:{id:'event',title:'Event',date:'2026-12-01',status:'approved',capacity:20},form:{version:1,fields:[]},canRegister:true};const ended={...active,event:{...active.event,status:'cancelled'},canRegister:false,canEditRegistration:false,canCancel:true,ownRegistration:{status:'registered',revision:1}};let loads=0,submits=0;
 const fixture=recurrenceScreenFixture({load:async()=>++loads===1?active:ended,submit:async()=>{submits++;throw Error('Event cancelled');}},{initialCreate:false,initialEventId:'event',initialAction:'entry',user:{uid:'attendee'}});
 fixture.render();await new Promise(setImmediate);const button=flatten(fixture.render()).find(node=>node.type==='Action'&&node.props.children.join('')==='Submit registration');assert.ok(button);button.props.onPress();await new Promise(setImmediate);const tree=fixture.render();assert.equal(submits,1);assert.equal(tree.type,'Details');assert.equal(tree.props.onRegister,undefined);assert.match(tree.props.registrationNotice,/read-only/);assert.doesNotMatch(JSON.stringify(tree),/Retry same submission/);
});

test('native series review selects all pending dates and requires review before batch approval',async()=>{
 const rows=[{eventId:'one',date:'2026-12-01',revision:1},{eventId:'two',date:'2026-12-08',revision:2}],sent=[];
 const api={load:async(id,_,review)=>review?{reviewOccurrences:rows}:{event:{id,date:rows.find(row=>row.eventId===id).date,revision:rows.find(row=>row.eventId===id).revision,title:'Submitted'},form:{purpose:'Purpose',fields:[]},privateDetails:{address:'Private venue',hasPoster:false},canApprove:true},approveSeries:async data=>sent.push(data)};
 const fixture=componentFixture('src/registration/SeriesApproval.js',{'react-native':{Image:'Image',Pressable:'Pressable',Text:'Text',View:'View'},'./RegistrationControls':{Action:'Action',RegistrationIdentity:'Identity',styles:{}}},{api,event:{id:'one'}});
 const action=label=>flatten(fixture.render()).find(node=>node.type==='Action'&&node.props.children.join('')===label);
 action('Review series occurrences for approval').props.onPress();await new Promise(setImmediate);
 flatten(fixture.render()).find(node=>node.props.accessibilityLabel==='Select all awaiting approval').props.onPress();
 action('Review selected occurrences (2)').props.onPress();await new Promise(setImmediate);
 assert.equal(action('Approve selected occurrences (2)').props.disabled,true);
 flatten(fixture.render()).find(node=>node.props.accessibilityLabel?.startsWith('I have reviewed')).props.onPress();
 action('Approve selected occurrences (2)').props.onPress();await new Promise(setImmediate);
 assert.equal(sent.length,1);assert.equal(JSON.stringify(sent[0].occurrences),JSON.stringify(rows.map(row=>({eventId:row.eventId,expectedRevision:row.revision}))));
});

test('native occurrence selection submits chosen dates together and keeps exact request on retry',async()=>{
 const detail={event:{id:'one',title:'Series',date:'2026-12-01',capacity:8,status:'approved'},form:{version:1,fields:[],purpose:'Shared form'},canRegister:true,
 occurrences:[{eventId:'one',date:'2026-12-01',formVersion:1,availablePlaces:8,selectable:true},{eventId:'two',date:'2026-12-08',formVersion:1,availablePlaces:8,selectable:true}]};
 const sent=[];const transport={load:async()=>detail,submitOccurrences:async data=>{sent.push(JSON.stringify(data));if(sent.length===1)throw Error('Unconfirmed response');return {registrations:data.occurrences};}};
 const fixture=recurrenceScreenFixture(transport,{initialCreate:false,initialEventId:'one',initialAction:'entry'});
 fixture.render();await new Promise(setImmediate);
 flatten(fixture.render()).find(node=>node.type==='OccurrencePicker').props.onChange(['two']);
 flatten(fixture.render()).find(node=>node.type==='Action'&&node.props.children.includes('Submit registration')).props.onPress();await new Promise(setImmediate);
 flatten(fixture.render()).find(node=>node.type==='Action'&&node.props.children.includes('Retry same submission')).props.onPress();await new Promise(setImmediate);
 assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);assert.deepEqual(JSON.parse(sent[0]).occurrences.map(row=>row.eventId),['two']);
 assert.match(JSON.stringify(fixture.render()),/Registration confirmed/);
});
test('native occurrence picker Select all skips blocked dates and honours the requested places',()=>{
 const props={detail:{occurrences:[{eventId:'one',date:'2026-12-01',selectable:true,availablePlaces:5},{eventId:'two',date:'2026-12-08',selectable:true,availablePlaces:1},{eventId:'closed',date:'2026-12-15',selectable:false,availablePlaces:5,reason:'Registration closed'}]},places:'2',selected:[],onChange:value=>{props.selected=value;}};
 const fixture=componentFixture('src/registration/OccurrencePicker.js',{'react-native':{Pressable:'Pressable',View:'View',Text:'Text'},'./RegistrationControls':{styles:{}},'./occurrenceSelection':load(path.join(root,'src/registration/occurrenceSelection.js'))},props);
 const all=()=>flatten(fixture.render()).find(node=>node.props.accessibilityLabel==='Select all available occurrences');
 all().props.onPress();assert.equal(JSON.stringify(props.selected),'["one"]');assert.equal(all().props.accessibilityState.checked,true);
 assert.equal(flatten(fixture.render()).find(node=>node.props.accessibilityLabel?.includes('2026-12-08')).props.disabled,true);
 all().props.onPress();assert.equal(props.selected.length,0);
});
async function screenEditor(fixture) {
  fixture.render(); await new Promise(setImmediate);
  return flatten(fixture.render()).find(node => node.type === 'Editor');
}
const seriesRequest = () => ({
  recurrence: { calendarType: 'gregorian', frequency: 'week', repeatEvery: 2, endMode: 'count', occurrenceCount: 2 },
  occurrences: [
    { date: '2027-01-01', closes: '2026-12-30T18:00', capacity: 10, startTime: '', endTime: '' },
    { date: '2027-01-15', closes: '2027-01-10T18:00', capacity: 17, startTime: '23:00', endTime: '01:00' },
  ],
});
test('mounted create screen uses atomic series transport and individual private poster revisions; reports partial failures', async () => {
  const calls = [], poster = { uri: 'file://private', mime: 'image/jpeg', base64: 'PRIVATE_BYTES' };
  const transport = {
    templates: async () => ({ templates: [] }),
    createSeries: async request => { calls.push(['series', request]); return { seriesId: 'series', events: [{ eventId: 'one', revision: 1 }, { eventId: 'two', revision: 7 }] }; },
    save: async () => assert.fail('series must not use single save'),
    uploadPoster: async (...args) => { calls.push(['poster', ...args]); if (args[0] === 'two') throw Error('Upload denied'); },
    load: async id => { calls.push(['load', id]); return { ...stagedDetail(), event: { ...stagedDetail().event, id, status: 'pending' } }; },
  };
  let returned = false;
  const fixture = recurrenceScreenFixture(transport, { onMyEvents: () => { returned = true; } });
  const editor = await screenEditor(fixture);
  await editor.props.onSave({ ...editor.props.initialDraft, ...seriesRequest().occurrences[0], poster }, seriesRequest());
  assert.equal(calls.filter(call => call[0] === 'series').length, 1);
  assert.equal(calls[0][1].draft.poster, undefined);
  assert.deepEqual(calls.filter(call => call[0] === 'poster').map(call => call.slice(1)), [
    ['one', 1, 'image/jpeg', 'PRIVATE_BYTES'], ['two', 7, 'image/jpeg', 'PRIVATE_BYTES'],
  ]);
  assert.equal(calls.at(-1)[1], 'one', 'authoritative first event is reloaded');
  const output = JSON.stringify(fixture.render());
  assert.ok(flatten(fixture.render()).some(node => node.type === 'Text' && node.props.children.flat(Infinity).join('').startsWith('2 independent occurrences')));
  assert.match(output, /failed for 1 occurrence/);
  assert.match(output, /Return to My Events/); assert.doesNotMatch(output, /PRIVATE_BYTES|file:\/\/private/);
  press(fixture, 'Return to My Events'); assert.equal(returned, true);
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.equal((app.match(/<RegistrationScreen[^\n]+onMyEvents=\{\(\) => \{[^\n]+setActiveTab\('my_events'\)/g) || []).length, 2);
});
test('mounted series retry retains exact create key, draft and occurrence snapshot despite local mutation', async () => {
  const requests = [];
  const transport = {
    templates: async () => ({ templates: [] }),
    createSeries: async request => {
      requests.push(JSON.stringify(request));
      if (requests.length === 1) throw Error('Connection lost after commit');
      return { seriesId: 'series', events: [{ eventId: 'one', revision: 1 }, { eventId: 'two', revision: 1 }] };
    },
    load: async () => stagedDetail(),
  };
  const fixture = recurrenceScreenFixture(transport), editor = await screenEditor(fixture);
  const series = seriesRequest(), draft = { ...editor.props.initialDraft, title: 'Original' };
  await editor.props.onSave(draft, series);
  assert.match(JSON.stringify(fixture.render()), /Connection lost after commit/);
  draft.title = 'Changed'; series.occurrences[1].capacity = 999;
  press(fixture, 'Retry original save request'); await new Promise(setImmediate);
  assert.equal(requests.length, 2); assert.equal(requests[0], requests[1]);
  assert.match(requests[1], /"title":"Original"/); assert.doesNotMatch(requests[1], /999/);
});
test('definitive series validation rejection unlocks correction rather than retaining an invalid retry snapshot', async () => {
  const transport = {
    templates: async () => ({ templates: [] }),
    createSeries: async () => { throw Object.assign(Error('Review occurrence closing'), { code: 'functions/invalid-argument' }); },
  };
  const fixture = recurrenceScreenFixture(transport), editor = await screenEditor(fixture);
  await editor.props.onSave(editor.props.initialDraft, seriesRequest());
  const tree = fixture.render();
  assert.match(JSON.stringify(tree), /Review occurrence closing/);
  assert.doesNotMatch(JSON.stringify(tree), /Retry original save request/);
  assert.equal(flatten(tree).find(node => node.type === 'Editor').props.busy, false);
});
test('reload failure after series creation and poster failure never recreates events or repeats successful uploads', async () => {
  let creates = 0, uploads = 0, loads = 0;
  const transport = {
    templates: async () => ({ templates: [] }),
    createSeries: async () => { creates++; return { seriesId: 'series', events: [{ eventId: 'one', revision: 1 }, { eventId: 'two', revision: 1 }] }; },
    uploadPoster: async id => { uploads++; if (id === 'two') throw Error('Poster denied'); },
    load: async () => { if (++loads === 1) throw Error('Reload failed'); return stagedDetail(); },
  };
  const fixture = recurrenceScreenFixture(transport), editor = await screenEditor(fixture);
  await editor.props.onSave({ ...editor.props.initialDraft, poster: { mime: 'image/png', base64: 'PRIVATE' } }, seriesRequest());
  press(fixture, 'Retry original save request'); await new Promise(setImmediate);
  assert.equal(creates, 1); assert.equal(uploads, 2); assert.equal(loads, 2);
  assert.match(JSON.stringify(fixture.render()), /failed for 1 occurrence/);
});
test('series poster quota stops uploads and identifies failed and unattempted occurrence dates for retry', async () => {
  const uploads = [];
  const transport = {
    templates: async () => ({ templates: [] }),
    createSeries: async () => ({ seriesId: 'series', events: ['one', 'two', 'three'].map(eventId => ({ eventId, revision: 1 })) }),
    uploadPoster: async id => {
      uploads.push(id);
      if (id === 'two') throw Object.assign(Error('Quota'), { code: 'functions/resource-exhausted' });
    },
    load: async () => stagedDetail(),
  };
  const fixture = recurrenceScreenFixture(transport), editor = await screenEditor(fixture), series = seriesRequest();
  series.occurrences.push({ ...series.occurrences[1], date: '2027-01-29' });
  await editor.props.onSave({ ...editor.props.initialDraft, poster: { mime: 'image/png', base64: 'PRIVATE' } }, series);
  assert.deepEqual(uploads, ['one', 'two']);
  const output = JSON.stringify(fixture.render());
  assert.match(output, /2027-01-15 \(two\): Quota/);
  assert.match(output, /2027-01-29 \(three\): pending, not attempted/);
  assert.match(output, /after the upload quota resets/);
  assert.doesNotMatch(output, /PRIVATE/);
});
test('mounted recurrence editor supports Hijri count and date endings using trusted calendar dates', async () => {
  const fixture = recurrenceEditorFixture();
  fixture.render(); await new Promise(setImmediate);
  press(fixture, 'Recurring'); press(fixture, 'Hijri'); press(fixture, 'Monthly');
  input(fixture, 'Occurrences (2–100)', '3');
  press(fixture, 'Preview occurrences');
  confirmAndSaveRecurrence(fixture);
  assert.equal(fixture.saves.length, 1);
  const series = fixture.saves[0][1];
  assert.equal(series.recurrence.calendarType, 'hijri'); assert.ok(series.recurrence.startHijri);
  assert.ok(series.occurrences.every(row => row.enteredAsHijri && row.hijriYear));
  const dated = recurrenceEditorFixture();
  await previewRecurrence(dated, 'Daily');
  press(dated, 'End by date');
  flatten(dated.render()).find(node => node.props.accessibilityLabel === 'Recurrence end date').props.onChange('2027-01-03');
  press(dated, 'Preview occurrences'); confirmAndSaveRecurrence(dated);
  assert.equal(dated.saves[0][1].occurrences.length, 3);
  const yearly = recurrenceEditorFixture();
  await previewRecurrence(yearly, 'Yearly');
  input(yearly, 'Occurrences (2–5)', '6'); press(yearly, 'Preview occurrences');
  assert.match(JSON.stringify(yearly.render()), /between 2 and 5/);
});
test('edit and copy never recreate a series from immutable provenance', async () => {
  const detail = stagedDetail();
  Object.assign(detail.event, { seriesId: 'old-series', occurrenceIndex: 2, occurrenceCount: 4, recurrenceRule: seriesRequest().recurrence });
  const saved = [];
  const transport = {
    templates: async () => ({ templates: [] }), load: async () => detail,
    createSeries: async () => assert.fail('edit/copy must not infer series creation'),
    save: async request => { saved.push(request); return { eventId: 'one', revision: 20 }; },
  };
  const editFixture = recurrenceScreenFixture(transport, { initialCreate: false, initialEventId: 'one', initialAction: 'editor' });
  const editor = await screenEditor(editFixture);
  assert.equal(editor.props.initialDraft.recurrenceRule, undefined);
  await editor.props.onSave(editor.props.initialDraft, seriesRequest());
  assert.equal(saved[0].eventId, detail.event.id); assert.equal(saved[0].recurrence, undefined);
  const copyFixture = recurrenceScreenFixture(transport, { initialCreate: false, initialEventId: 'one', initialAction: 'copy' });
  const copyEditor = await screenEditor(copyFixture);
  assert.equal(copyEditor.props.eventId, undefined); assert.equal(copyEditor.props.initialDraft.seriesId, undefined);
  await copyEditor.props.onSave(copyEditor.props.initialDraft);
  assert.equal(saved[1].eventId, undefined); assert.equal(saved[1].recurrence, undefined); assert.ok(saved[1].createKey);
});
test('host screen edits pending draft but self-registration stays on published form and revision', async () => {
  const detail = stagedDetail();
  detail.canRegister = true;
  const saved = [], submitted = [];
  const transport = {
    load: async () => detail,
    templates: async () => ({ templates: [], nextCursor: null }),
    save: async value => { saved.push(value); return { eventId: 'event', revision: 20 }; },
    submit: async value => { submitted.push(value); },
  };
  const mocks = {
    'react-native': { ActivityIndicator: 'ActivityIndicator', Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) }, Pressable: 'Pressable', Share: {}, Text: 'Text', View: 'View' },
    './KeyboardAwareScrollView': 'ScrollView', './NativeBackButton': 'NativeBackButton', './MemberPageHeader': 'MemberPageHeader',
    '../registration/RegistrationEditor': { __esModule: true, default: 'Editor' },
    '../registration/RegistrationControls': { Action: 'Action', Answer: 'Answer', Input: 'Input', styles: {} },
    '../registration/firebaseRegistration': {}, '../registration/registrationClient': contract,
    '../registration/OccurrencePicker': { __esModule:true,default:'OccurrencePicker' },
    '../registration/occurrenceSelection': load(path.join(root,'src/registration/occurrenceSelection.js')),
    '../registration/responsePresentation': load(path.join(root, 'src/registration/responsePresentation.js')),
    '../services/registrationExport': { exportRegistrationWorkbook: async () => {} },
    '../registration/registrationViewModel': view, '../registration/prototypeModel': load(path.join(root, 'src/registration/prototypeModel.js')),
    '../utils/eventOptions': { EVENT_TYPES: ['Majlis'] }, '../services/eventOptionsAdmin': { getDynamicEventOptions: async () => ({ eventTypes: [] }) },
    '../utils/cities': { cityLabel: value => value }, '../theme': require('./theme-fixture.cjs'),
  };
  const props = { enabled: true, user: { uid: 'host' }, city: 'perth', initialEventId: 'event', transport };
  const editorFixture = componentFixture('src/components/RegistrationScreen.js', mocks, { ...props, initialAction: 'editor' });
  editorFixture.render(); await new Promise(setImmediate);
  const editor = flatten(editorFixture.render()).find(node => node.type === 'Editor');
  assert.equal(editor.props.initialDraft.title, 'Staged title');
  assert.equal(editor.props.city, 'sydney');
  editor.props.onSave(editor.props.initialDraft); await new Promise(setImmediate);
  assert.equal(saved[0].expectedRevision, 19);
  assert.equal(saved[0].city, 'sydney');
  assert.match(JSON.stringify(editorFixture.render()), /published event and form remain live and unchanged/);
  const entryFixture = componentFixture('src/components/RegistrationScreen.js', mocks, { ...props, initialAction: 'entry' });
  entryFixture.render(); await new Promise(setImmediate);
  const entry = entryFixture.render();
  assert.match(JSON.stringify(entry), /Published purpose/);
  assert.doesNotMatch(JSON.stringify(entry), /Staged purpose|Staged question|Staged title/);
  const answer = flatten(entry).find(node => node.type === 'Answer');
  assert.equal(answer.props.field.id, 'old');
  const submit = flatten(entry).find(node => node.type === 'Action' && JSON.stringify(node.props.children).includes('Submit registration'));
  assert.ok(submit, 'published entry provides confirmation action');
  submit.props.onPress(); await new Promise(setImmediate);
  assert.equal(submitted[0].formVersion, 2);
});

test('event details render before a slow private poster and retain authorization gates', async () => {
  const fixture = detailsFixture({ event: { id: 'event', status: 'pending', title: 'Available immediately', revision: 2 }, canManage: true, privateDetails: { address: '1 Private Lane', hasPoster: true }, form: { fields: [] } });
  let release;
  fixture.api.poster = () => new Promise(resolve => { release = resolve; });
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  assert.equal(tree.type, 'NormalDetails'); assert.equal(tree.props.event.title, 'Available immediately');
  assert.equal(tree.props.event.imageUrl, '');
  release({ mime: 'image/png', base64: 'POSTER' }); await new Promise(setImmediate);
  assert.equal(fixture.render().props.event.imageUrl, 'data:image/png;base64,POSTER');
});

test('response list initially shows names and reveals answers only when expanded', async () => {
  const row = { registrationId: 'internal-reference', status: 'registered', places: 1, fields: [{ id: 'name', label: 'Name of Participant', type: 'text' }, { id: 'age', label: 'Age', type: 'number' }], answers: { name: 'Test Participant', age: '9' } };
  const fixture = recurrenceScreenFixture({ load: async () => ({ event: { id: 'event', title: 'Test' } }), responses: async () => ({ registrations: [row], nextCursor: null }) }, { initialCreate: false, initialEventId: 'event', initialAction: 'responses' });
  fixture.render(); await new Promise(setImmediate);
  const tree = fixture.render();
  const names = flatten(tree).find(node => node.type === 'Pressable' && JSON.stringify(node.props.children).includes('Test Participant'));
  assert.ok(names); assert.equal(names.props.accessibilityState.expanded, false);
  assert.doesNotMatch(JSON.stringify(tree), /internal-reference ·|Share loaded responses as CSV|Only authorised organiser/);
  assert.equal(flatten(tree).some(node => node.type === 'Text' && node.props.children.includes('Age')), false);
  names.props.onPress();
  assert.equal(flatten(fixture.render()).some(node => node.type === 'Text' && node.props.children.includes('Age')), true);
});

test('poster selection preserves actual PNG, JPEG and WebP encoding instead of guessing JPEG', () => {
  const { registrationPosterAsset } = load(path.join(root, 'src/registration/posterAsset.js'));
  const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64');
  const jpeg = Buffer.from([255,216,255,224,1,2,3]).toString('base64');
  const webp = Buffer.from('RIFF0000WEBPfake').toString('base64');
  assert.equal(registrationPosterAsset({ uri:'file://png', base64:png, mimeType:'image/jpeg' }).mime, 'image/png');
  assert.equal(registrationPosterAsset({ uri:'file://jpg', base64:jpeg }).mime, 'image/jpeg');
  assert.equal(registrationPosterAsset({ uri:'file://webp', base64:webp }).mime, 'image/webp');
  assert.throws(() => registrationPosterAsset({ base64:Buffer.from('not an image').toString('base64') }), /JPEG, PNG or WebP/);
  assert.throws(() => registrationPosterAsset({ base64:png.slice(0,-4) + 'A'.repeat(8*1024*1024) }), /up to 5 MB/);
});
test('registration feed publishes first-page cards before the next page finishes', async () => {
  let release; const published = [];
  const pending = feed.registrationEventFeed({ list: async ({cursor}) => cursor
    ? new Promise(resolve => { release = resolve; })
    : { events:[{ id:'first', status:'approved' }], nextCursor:'next' }
  }, 'public', 'sydney', rows => published.push(rows));
  await new Promise(setImmediate);
  assert.equal(published[0][0].id, 'first');
  release({ events:[{id:'second',status:'approved'}], nextCursor:null });
  assert.equal((await pending).length, 2);
});
