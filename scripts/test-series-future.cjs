const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const now = new Date('2026-09-24T08:00:00Z'); // 18:00 Sydney, 16:00 Perth
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now.getTime(); } }
function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = babel.transformSync(read(file), { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  vm.runInNewContext(source, { module, exports: module.exports, Date: Clock, Intl, console, require: id => {
    if (!(id in mocks)) throw new Error('Unexpected dependency: ' + id);
    return mocks[id];
  } });
  return module.exports;
}
const scope = load('src/utils/seriesScope.js');
const future = (event, time = now) => scope.isFutureSeriesEvent(event, time);
function event(id, date, extra = {}) {
  return { id, seriesId: 'series', eventDate: date, startTime: '19:00', metroArea: 'sydney',
    createdByUserId: 'owner', recurrenceIndex: 4, recurrenceTotal: 10, seriesStartDate: '2026-09-01', ...extra };
}
function testClock() {
  assert.equal(read('src/utils/seriesScope.js'), read('backend/functions-lifecycle/seriesScope.js'));
  assert.equal(future(event('a', '2026-09-23')), false);
  assert.equal(future(event('a', '2026-09-24')), true);
  assert.equal(future(event('a', '2026-09-24', { startTime: '18:00' })), false);
  assert.equal(future(event('a', '2026-09-24', { startTime: '17:00' })), false);
  assert.equal(future(event('a', '2026-09-24', { startTime: '17:00', metroArea: 'perth' })), true);
  assert.equal(future(event('a', '2026-09-24', { startTime: '17:45', metroArea: 'adelaide' })), true);
  assert.equal(future(event('a', '2026-09-24', { startTime: '7:00 PM' })), true);
  assert.equal(future(event('a', '2026-09-24', { startTime: '' })), false);
  assert.equal(future(event('a', '2026-09-25', { startTime: '' })), true);
  assert.equal(future(event('a', '2026-09-25', { isLive: true })), false);
  assert.equal(future(event('a', '2026-09-25', { status: 'archived' })), false);
  assert.equal(future(event('a', '2026-02-30')), false);
  assert.equal(future(event('a', '2026-10-04', { startTime: '03:30' }), new Date('2026-10-03T16:00:00Z')), true);
  assert.equal(future(event('a', '2026-10-04', { startTime: '03:00' }), new Date('2026-10-03T16:00:00Z')), false);
  assert.equal(future(event('a', '2026-09-25', { startTime: '00:01' }), new Date('2026-09-24T14:00:00Z')), true);
}
function clientFixture(events) {
  const writes = [], metadata = [], calls = [];
  const auth = { currentUser: { uid: 'owner', isAnonymous: false } };
  let race = null;
  const snapshot = item => ({ id: item.id, ref: { id: item.id }, data: () => item, exists: () => true });
  const firestore = {
    collection: (_, name) => ({ name }), doc: (_, name, id) => ({ name, id }),
    query: (collection, condition) => ({ collection, condition }), where: (...args) => args,
    getDocs: async query => ({ docs: events.filter(item => item[query.condition[0]] === query.condition[2]).map(snapshot) }),
    serverTimestamp: () => 'SERVER_TIME', setDoc: async (ref, data) => metadata.push({ ref, data }),
    runTransaction: async (_, action) => {
      const pending = [];
      await action({ get: async ref => snapshot(race ? race(events.find(item => item.id === ref.id)) : events.find(item => item.id === ref.id)),
        update: (ref, data) => pending.push({ ref, data }) });
      writes.push(...pending);
    },
  };
  const api = load('src/services/events.js', {
    '@react-native-firebase/firestore': firestore,
    '@react-native-firebase/functions': { httpsCallable: (_, name) => async data => { calls.push({ name, data }); return { data: { archived: 1, archivedIds: ['future0'] } }; } },
    '../firebase/firebase': { auth, db: {}, functions: {} },
    '../utils/seriesScope': scope, '../utils/cities': {},
    './prayerTimes': { calculatePrayerTimes: () => ({ maghrib: '18:30', timeZone: 'Australia/Sydney' }), applyPrayerOffset: () => '18:45', prayerLabel: () => 'Maghrib' },
    './hijri': {}, './organisations': {},
  });
  return { api, auth, writes, metadata, calls, setRace: fn => { race = fn; } };
}
async function testClient() {
  const events = [event('past', '2026-09-20'), event('live', '2026-09-25', { isLive: true }),
    ...Array.from({ length: 7 }, (_, i) => event('future' + i, '2026-10-' + String(i + 1).padStart(2, '0'), { recurrenceIndex: i + 4 }))];
  const f = clientFixture(events);
  const draft = await f.api.prepareFutureSeriesEdit(events[0]);
  assert.equal(draft.id, 'future0');
  assert.equal(draft.__futureIds.length, 7);
  assert.equal(draft.recurrenceTotal, 10);
  const schedule = { occurrences: draft.__futureOccurrences, recurrence: { calendarType: 'gregorian', frequency: 'day', endMode: 'count', occurrenceCount: 7 } };
  const payload = { hostName: 'Changed', startTime: '19:00', __futureIds: ['never save this'] };
  const result = await f.api.updateEventSeries(draft, payload, schedule);
  assert.equal(result.totalEvents, 7);
  assert.equal(f.writes.length, 7);
  assert.ok(f.writes.every(write => write.ref.id.startsWith('future')));
  assert.equal(f.writes[0].data.recurrenceIndex, 4);
  assert.equal(f.writes[0].data.recurrenceTotal, 10);
  assert.equal(f.writes[0].data.seriesStartDate, '2026-09-01');
  assert.equal(f.writes[0].data.__futureIds, undefined);
  assert.equal(f.metadata[0].data.totalEvents, 10);
  const count = f.writes.length;
  await assert.rejects(f.api.updateEventSeries(draft, payload, { ...schedule, occurrences: schedule.occurrences.slice(1) }), /7 future occurrences/);
  await assert.rejects(f.api.updateEventSeries(draft, payload, { ...schedule, occurrences: schedule.occurrences.map((item, i) => i ? item : { ...item, eventDate: '2026-09-01' }) }), /must start in the future/);
  assert.equal(f.writes.length, count);
  await assert.rejects(f.api.updateEventSeries({ ...draft, __futureIds: ['other'] }, payload, schedule), /remaining events have changed/);
  f.setRace(item => ({ ...item, isLive: true }));
  await assert.rejects(f.api.updateEventSeries(draft, payload, schedule), /remaining events have changed/);
  assert.equal(f.writes.length, count);
  f.setRace(null);
  await f.api.updateEventSeries(draft, { ...payload, timeMode: 'prayer', prayerName: 'maghrib' }, schedule);
  assert.equal(f.writes[count].data.startTime, '18:45');
  const deletion = await f.api.deleteEventSeries(draft, draft.__futureIds);
  assert.equal(f.calls[0].name, 'archiveFutureSeriesEvents');
  assert.equal(f.calls[0].data.expectedIds.length, 7);
  assert.equal(deletion.archivedIds[0], 'future0');
  f.auth.currentUser.isAnonymous = true;
  await assert.rejects(f.api.prepareFutureSeriesEdit(events[0]), /Sign in/);
  await assert.rejects(f.api.deleteEventSeries(draft, ['future0']), /Sign in/);
  const empty = clientFixture([events[0]]);
  await assert.rejects(empty.api.prepareFutureSeriesEdit(events[0]), /No future events/);
  const legacy = clientFixture([event('legacy', '2026-10-01', { seriesId: undefined, recurringSeriesId: 'series' })]);
  assert.equal((await legacy.api.prepareFutureSeriesEdit({ recurringSeriesId: 'series' })).id, 'legacy');
}
function backendFixture(events, caller = {}, race = null) {
  const writes = [];
  const snapshot = item => ({ id: item.id, exists: true, ref: { id: item.id }, data: () => item });
  const db = {
    collection: name => ({
      where: (field, _, value) => ({ get: async () => ({ docs: events.filter(item => item[field] === value).map(snapshot) }) }),
      doc: id => ({ id, get: async () => ({ data: () => caller }), set: async data => writes.push({ name, id, data }) }),
    }),
    runTransaction: async action => {
      const pending = [];
      const result = await action({
        getAll: async (...refs) => refs.map(ref => snapshot(race ? race(events.find(item => item.id === ref.id)) : events.find(item => item.id === ref.id))),
        set: (ref, data) => pending.push({ archive: ref.id, data }),
        delete: ref => pending.push({ delete: ref.id }),
      });
      writes.push(...pending);
      return result;
    },
  };
  const firestore = () => db;
  firestore.Timestamp = { now: () => 'SERVER_TIME' };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const api = load('backend/functions-lifecycle/index.js', {
    'firebase-admin': { initializeApp() {}, firestore },
    'firebase-functions/v2/https': { onCall: (_, fn) => fn, HttpsError },
    './seriesScope': scope,
  });
  return { api, writes };
}
async function testBackend() {
  const past = event('past', '2026-09-20'), next = event('next', '2026-10-01'), live = event('live', '2026-10-02', { isLive: true });
  const request = { auth: { uid: 'owner' }, data: { seriesId: 'series', expectedIds: ['next'] } };
  const f = backendFixture([past, next, live]);
  const result = await f.api.archiveFutureSeriesEvents(request);
  assert.equal(result.archived, 1);
  assert.equal(result.archivedIds[0], 'next');
  assert.deepEqual(f.writes.filter(item => item.delete).map(item => item.delete), ['next']);
  assert.ok(!f.writes.some(item => item.data?.status === 'archived'));
  assert.equal(f.writes.find(item => item.archive).data.archiveReason, 'future_series_archived_by_user_or_admin');
  await assert.rejects(f.api.archiveFutureSeriesEvents({ ...request, auth: null }), /Login required/);
  await assert.rejects(f.api.archiveFutureSeriesEvents({ ...request, auth: { uid: 'owner', token: { firebase: { sign_in_provider: 'anonymous' } } } }), /Login required/);
  await assert.rejects(backendFixture([past]).api.archiveFutureSeriesEvents(request), /No future events/);
  const legacy = backendFixture([event('next', '2026-10-01', { seriesId: undefined, recurringSeriesId: 'series' })]);
  assert.equal((await legacy.api.archiveFutureSeriesEvents(request)).archived, 1);
  const denied = backendFixture([next], { role: 'admin', adminCity: 'perth' });
  await assert.rejects(denied.api.archiveFutureSeriesEvents({ ...request, auth: { uid: 'someone' } }), /cannot archive/);
  assert.equal(denied.writes.length, 0);
  for (const caller of [{ role: 'admin', adminCity: 'sydney' }, { role: 'superAdmin' }]) {
    const allowed = backendFixture([next], caller);
    assert.equal((await allowed.api.archiveFutureSeriesEvents({ ...request, auth: { uid: 'admin' } })).archived, 1);
  }
  await assert.rejects(f.api.archiveFutureSeriesEvents({ ...request, data: { ...request.data, expectedIds: ['next', 'missing'] } }), /remaining events have changed/);
  const race = backendFixture([next], {}, item => ({ ...item, isLive: true }));
  assert.equal((await race.api.archiveFutureSeriesEvents(request)).archived, 0);
  assert.ok(!race.writes.some(item => item.delete));
  const many = Array.from({ length: 241 }, (_, i) => event('e' + i, '2026-10-01'));
  const large = backendFixture(many);
  assert.equal((await large.api.archiveFutureSeriesEvents({ ...request, data: { seriesId: 'series', expectedIds: many.map(item => item.id) } })).archived, 241);
  assert.equal(large.writes.filter(item => item.delete).length, 241);
}
function testForm() {
  const source = read('src/components/RecurringEventForm.js');
  assert.match(source, /__futureOccurrences\?\.length/);
  assert.match(source, /Edit Future Events/);
  const body = source.split('  const preview = useMemo(() => {')[1].split('  }, [calendarType')[0];
  const saved = [event('a', '2026-10-01'), event('b', '2026-10-12')]; // non-uniform dates
  const context = {
    settingsReady: true, editing: true, initialEvent: { ...saved[0], __futureOccurrences: saved },
    initialStartDate: '2026-10-01', existingRule: {}, calendarType: 'gregorian', frequency: 'week',
    repeatEvery: '1', endMode: 'count', occurrenceCount: '2', startDate: '2026-10-01', endDate: '', hijriEnd: {}, hijriStart: {},
    overrides: [], getHijriParts: () => ({ day: 1, month: 1, year: 1448 }),
    generateGregorianOccurrences: () => [{ eventDate: 'changed' }],
  };
  const preview = vm.runInNewContext('(function(){' + body + '})()', context);
  assert.equal(preview.occurrences, saved);
  context.repeatEvery = '2';
  assert.equal(vm.runInNewContext('(function(){' + body + '})()', context).occurrences[0].eventDate, 'changed');
  context.repeatEvery = '1';
  context.calendarType = 'hijri';
  context.initialEvent.enteredAsHijri = true;
  context.hijriStart = { day: 1, month: 1, year: 1448 };
  assert.equal(vm.runInNewContext('(function(){' + body + '})()', context).occurrences, saved);
  context.hijriStart.day = 2;
  context.generateHijriOccurrences = () => [{ eventDate: 'hijri-changed' }];
  assert.equal(vm.runInNewContext('(function(){' + body + '})()', context).occurrences[0].eventDate, 'hijri-changed');
  const app = read('App.js');
  assert.match(app, /archivedIds\.has\(item\.id\)/);
  assert.doesNotMatch(app, /permanently remove every event/);
}
(async () => {
  testClock(); await testClient(); await testBackend(); testForm();
  console.log('PASS future series: partial archive, same-day/time-zone/DST boundaries, permissions, live protection, race checks, retained dates, counts, prayer times, legacy IDs and 241-event deletion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
