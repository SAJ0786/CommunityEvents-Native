const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function load(file, mocks) {
  const { code } = babel.transformSync(read(file), {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: id => {
      if (!(id in mocks)) throw new Error(`Unexpected dependency: ${id}`);
      return mocks[id];
    },
    console,
  });
  return exports;
}

function testVisibleActionContract() {
  const details = read('src/components/EventDetailsModal.js');
  const app = read('App.js');
  const myEvents = read('src/components/MyEventsScreen.js');
  const recurringForm = read('src/components/RecurringEventForm.js');
  const createForm = read('src/components/CreateEventForm.js');

  assert.doesNotMatch(details, /<Modal transparent visible=\{(?:shareOpen|hostMessageOpen|reminderOpen)/);
  assert.match(details, /shareOpen \? <View style=\{styles\.inlineOverlayLayer\}/);
  assert.match(details, /hostMessageOpen \? <View style=\{styles\.inlineOverlayLayer\}/);
  assert.match(details, /reminderOpen \? <View style=\{styles\.inlineOverlayLayer\}/);
  assert.match(details, /label="Contact Host" disabled=\{!canConnectHost\}/);
  assert.match(details, /const canConnectHost = Boolean\(!isGuest && user\?\.uid && \(!hostUid \|\| hostUid !== user\.uid\)\)/);
  assert.match(details, /isSeriesEvent \? <ActionButton[^>]+label="Edit Series" disabled=\{!onEditSeries\}/);
  assert.match(details, /label="Edit" disabled=\{!onEdit\}/);
  assert.match(details, /label="Copy" disabled=\{!onCopy\}/);
  assert.match(details, /label="Delete" variant="danger" disabled=\{!onDelete\}/);
  assert.match(app, /onEditSeries=\{canManageSelectedEvent && \(selectedEvent\?\.seriesId/);
  assert.match(app, /ListHeaderComponent=\{renderHeader\(\)\}/);
  assert.doesNotMatch(app, /ListHeaderComponent=\{renderHeader\}/);
  const eventDetails = read('src/components/EventDetailsModal.js');
  const businessDetails = read('src/business/BusinessDetailsScreen.js');
  const businessInbox = read('src/business/BusinessInboxScreen.js');
  const feedback = read('src/components/FeedbackScreen.js');
  assert.match(eventDetails, /KeyboardAvoidingView[\s\S]*behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(businessDetails, /KeyboardAvoidingView[\s\S]*contactInput/);
  assert.match(businessInbox, /KeyboardAvoidingView[\s\S]*keyboardShouldPersistTaps="handled"/);
  assert.match(feedback, /KeyboardAvoidingView[\s\S]*keyboardShouldPersistTaps="handled"/);
  assert.match(app, /<MyEventsScreen[\s\S]*onEditSeries=\{handleEditSeries\}/);
  assert.match(app, /selectedEvent\.createdByUserId === currentUser\.uid/);
  assert.match(myEvents, /disabled=\{!onEditSeries\} onPress=\{\(\) => onEditSeries\?\.\(event\)\}/);
  assert.match(recurringForm, /allowUnchangedSubmit=\{editing\}/);
  assert.match(createForm, /!initialEvent\?\.id \|\| isDirty \|\| allowUnchangedSubmit/);
}

async function testRecurrenceReschedule() {
  const writes = [];
  const seriesDocs = [
    { id: 'second', recurrenceIndex: 2, eventDate: '2026-09-08' },
    { id: 'first', recurrenceIndex: 1, eventDate: '2026-09-01' },
  ];
  const firestore = {
    addDoc: async () => ({ id: 'new' }),
    collection: (_, name) => ({ name }),
    doc: (_, name, id) => ({ name, id }),
    getDocs: async () => ({
      empty: false,
      docs: seriesDocs.map(event => ({ id: event.id, ref: { id: event.id }, data: () => event })),
    }),
    limit: value => value,
    onSnapshot: () => () => {},
    orderBy: (...value) => value,
    query: (...value) => value,
    serverTimestamp: () => 'SERVER_TIME',
    setDoc: async () => {},
    updateDoc: async () => {},
    where: (...value) => value,
    writeBatch: () => ({
      update: (ref, data) => writes.push({ ref, data }),
      set: () => { throw new Error('Series recurrence edits must not create events'); },
      commit: async () => {},
    }),
  };
  const api = load('src/services/events.js', {
    '@react-native-firebase/firestore': firestore,
    '@react-native-firebase/functions': { httpsCallable: () => async () => ({ data: {} }) },
    '../firebase/firebase': { auth: { currentUser: { uid: 'owner', isAnonymous: false } }, db: {}, ensureFirebaseSession: async () => ({ uid: 'owner' }), functions: {} },
    '../utils/cities': { getEventMetroArea: () => 'sydney' },
    './prayerTimes': { applyPrayerOffset: value => value, calculatePrayerTimes: () => null, prayerLabel: value => value },
    './hijri': { getHijriDisplay: () => '', getHijriParts: () => ({}), hijriDisplayFromParts: () => '', hijriToGregorian: () => '' },
    './organisations': { getOrganisations: async () => [], resolveOrganisationLogo: () => '' },
  });
  const schedule = {
    recurrence: { calendarType: 'gregorian', frequency: 'week', repeatEvery: 2, endMode: 'count', occurrenceCount: 2 },
    occurrences: [
      { eventDate: '2026-10-01', hijriDate: '19 Rabi al-Thani 1448' },
      { eventDate: '2026-10-15', hijriDate: '3 Jumada al-Awwal 1448' },
    ],
  };
  const result = await api.updateEventSeries(
    { id: 'first', seriesId: 'series-1', eventDate: '2026-09-01', recurrenceRuleSnapshot: {} },
    { eventType: 'Majlis', hostName: 'Host', startTime: '19:00', timeMode: 'manual' },
    schedule,
  );
  assert.equal(result.totalEvents, 2);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].ref.id, 'first');
  assert.equal(writes[0].data.eventDate, '2026-10-01');
  assert.equal(writes[1].data.eventDate, '2026-10-15');
  assert.equal(writes[0].data.recurrenceRuleSnapshot.repeatEvery, 2);

  await assert.rejects(() => api.updateEventSeries(
    { id: 'first', seriesId: 'series-1', eventDate: '2026-09-01' },
    { eventType: 'Majlis' },
    { ...schedule, occurrences: schedule.occurrences.slice(0, 1) },
  ), /Keep this series at 2 occurrences/);
}

(async () => {
  testVisibleActionContract();
  await testRecurrenceReschedule();
  console.log('PASS event card actions: iOS overlays, visible eligibility states, transferred-owner contact rules and bounded recurrence rescheduling');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
