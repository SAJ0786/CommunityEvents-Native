const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = babel.transformSync(source, { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  }, ...globals });
  return exports;
}
const schedule = load('src/registration/eventSchedule.js');
const row = { id: 'r-event', registrationOnly: true, title: 'Workshop', eventDate: '2026-12-01', date: '2026-12-01',
  status: 'approved', startTime: '18:30', endTime: '20:00', timeZone: 'Australia/Sydney', suburb: 'Parramatta' };
test('Native and server use identical schedule conversion', () => {
  const native = fs.readFileSync(path.join(root, 'src/registration/eventSchedule.js'), 'utf8').replace(/\r/g, '');
  const backend = fs.readFileSync(path.join(root, 'backend/functions-registration/eventSchedule.mjs'), 'utf8').replace(/\r/g, '');
  assert.equal(native, backend);
});
test('explicit clocks use city offsets, including half-hours and seasonal DST', () => {
  assert.equal(schedule.registrationSchedule(row).startAt, '2026-12-01T07:30:00.000Z');
  assert.equal(schedule.registrationSchedule({ ...row, date: '2026-06-01' }).startAt, '2026-06-01T08:30:00.000Z');
  assert.equal(schedule.registrationSchedule({ ...row, timeZone: 'Australia/Adelaide' }).startAt, '2026-12-01T08:00:00.000Z');
  assert.equal(schedule.registrationSchedule({ ...row, timeZone: 'Australia/Perth' }).startAt, '2026-12-01T10:30:00.000Z');
  assert.equal(schedule.registrationSchedule({ ...row, startTime: '', endTime: '' }).startAt, null);
  assert.equal(schedule.registrationSchedule({ ...row, endTime: '' }).endAt, null);
});
test('overnight events advance one local day and reject gaps, overlaps and invalid ranges', () => {
  const overnight = schedule.registrationSchedule({ ...row, date: '2026-10-03', startTime: '23:30', endTime: '03:30' });
  assert.equal(overnight.startAt, '2026-10-03T13:30:00.000Z');
  assert.equal(overnight.endAt, '2026-10-03T16:30:00.000Z');
  for (const invalid of [
    { startTime: '24:00' }, { startTime: '12:60' }, { startTime: '8:30' },
    { startTime: '', endTime: '12:00' }, { startTime: '18:30', endTime: '18:30' },
    { date: '2026-02-30' }, { timeZone: 'Invalid/City' },
    { date: '2026-10-04', startTime: '02:30', endTime: '' },
    { date: '2026-04-05', startTime: '02:30', endTime: '' },
  ]) assert.throws(() => schedule.registrationSchedule({ ...row, ...invalid }));
});
test('device calendar is exact across device zones; date-only is all-day without private venue', () => {
  const calls = [];
  const calendar = load('src/services/calendar.js', {
    'react-native': { Linking: {}, Platform: {} }, 'expo-calendar': { createEventInCalendarAsync: value => calls.push(value) },
    'expo-clipboard': {}, './events': { getEventTitle: event => event.title || 'Normal' }, '../registration/eventSchedule': schedule, '../theme': require('./theme-fixture.cjs'), '../theme': require('./theme-fixture.cjs'),
  });
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const timed = calendar.eventCalendarDetails({ ...row, address: { fullAddress: '1 Private Lane' } });
    assert.equal(timed.startDate.toISOString(), '2026-12-01T07:30:00.000Z');
    assert.equal(timed.endDate.toISOString(), '2026-12-01T09:00:00.000Z');
    assert.equal(timed.location, 'Parramatta');
    const noEnd = calendar.eventCalendarDetails({ ...row, endTime: '' });
    assert.equal(noEnd.endDate.toISOString(), noEnd.startDate.toISOString());
    const dateOnly = calendar.eventCalendarDetails({ ...row, startTime: '', endTime: '' });
    assert.equal(dateOnly.allDay, true);
    assert.equal(dateOnly.startDate.getFullYear(), 2026);
    assert.equal(dateOnly.startDate.getMonth(), 11);
    assert.equal(dateOnly.startDate.getDate(), 1);
    assert.equal(dateOnly.startDate.getHours(), 0);
    assert.equal(dateOnly.endDate.getDate(), 2);
    assert.throws(() => calendar.eventCalendarDetails({ ...row, status: 'cancelled' }), /approved/);
    const normal = calendar.eventCalendarDetails({ eventDate: '2026-12-01', startTime: '18:30', endTime: '20:00' });
    assert.equal(normal.startDate.getHours(), 18, 'ordinary events retain existing device-local behavior');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
function reminderFixture(platform) {
  const store = new Map(), scheduled = new Map(); let serial = 0;
  const clock = Date.parse('2026-11-01T00:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const notifications = { setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ status: 'granted' }), AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    cancelScheduledNotificationAsync: async id => scheduled.delete(id),
    scheduleNotificationAsync: async request => { const id = String(++serial); scheduled.set(id, request); return id; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.keys()].map(identifier => ({ identifier })) };
  const api = load('src/services/reminders.js', {
    'react-native': { Platform: { OS: platform }, Linking: {} },
    '@react-native-async-storage/async-storage': { getItem: async key => store.get(key), setItem: async (key, value) => store.set(key, value) },
    'expo-notifications': notifications, 'expo-intent-launcher': {}, 'expo-constants': {}, './prayerTimes': {},
    './events': { getEventTitle: event => event.title, getEventSuburb: event => event.suburb },
    '../registration/eventSchedule': schedule, '../theme': require('./theme-fixture.cjs'), '../theme': require('./theme-fixture.cjs'),
    '@react-native-firebase/functions': { httpsCallable: (_f,name) => async data => ({data: name === 'scheduleRegistrationNotice' ? {triggerAt:'2026-12-01T07:00:00.000Z'} : {removed:true}}) },
    '../firebase/firebase': {auth:{currentUser:{uid:'member'}},functions:{}},
    './diagnostics': { recordNonFatalError() {} },
  }, { Date: Clock });
  return { api, scheduled, store };
}
for (const platform of ['ios', 'android']) test(`${platform}: registration reminders have exact instants and never invent missing times`, async () => {
  const { api, scheduled, store } = reminderFixture(platform);
  await assert.rejects(api.scheduleEventReminder({ ...row, startTime: '', endTime: '' }, 30), /not supplied a start time/);
  assert.equal(await api.scheduleFavouriteReminder({ ...row, startTime: '', endTime: '' }), null);
  assert.equal(scheduled.size, 0);
  const reminder = await api.scheduleEventReminder(row, 30);
  assert.equal(reminder.triggerAt, '2026-12-01T07:00:00.000Z');
  assert.equal(reminder.source, 'server');
  assert.equal(scheduled.size, 0, 'registration uses approved remote push and bell channels without duplicate local alarm');
  assert.equal((await api.getEventReminder(row.id, row)).eventStartAt, '2026-12-01T07:30:00.000Z');
  assert.equal(await api.getEventReminder(row.id, { ...row, startTime: '19:30' }), null);
  assert.equal(scheduled.size, 0, 'changed times revoke old local reminder');
  store.set('@community-events/event-reminders', JSON.stringify({ [row.id]: { notificationId: 'old', source: 'custom', eventStartAt: '2026-12-01T09:00:00Z' } }));
  scheduled.set('old', {});
  assert.equal(await api.getEventReminder(row.id, { ...row, startTime: '', endTime: '' }), null);
  assert.equal(scheduled.size, 0, 'legacy guessed reminder is removed');
  await assert.rejects(api.scheduleEventReminder({ ...row, status: 'cancelled' }, 30), /not approved/);
  const favourite = await api.scheduleFavouriteReminder(row);
  assert.equal(favourite.triggerAt, '2026-11-30T08:00:00.000Z', 'day-before 19:00 belongs to event city');
});
