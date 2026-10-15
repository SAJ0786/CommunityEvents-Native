const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function compiled(file) { return babel.transformSync(fs.readFileSync(path.join(root, file), 'utf8'), { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code; }
const source = compiled('src/services/reminders.js');
const now = Date.parse('2026-10-13T13:30:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const prayer = {}; vm.runInNewContext(compiled('src/services/prayerTimes.js'), { exports: prayer, Intl, Date: Clock });
async function check(platform) {
  const store = new Map(); const scheduled = new Map(); let sequence = 0;
  const location = { fullAddress: 'Sydney NSW', suburb: 'Sydney', state: 'NSW', timeZone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093 };
  store.set('@community-events/prayer-reminders', JSON.stringify({ initialized: true, enabledKeys: ['fajr'], notificationIds: ['stale'], location, refreshedAt: new Date(now).toISOString(), calculationVersion: 'old' }));
  scheduled.set('stale', {});
  const notifications = { setNotificationHandler() {}, setNotificationChannelAsync: async () => {}, getPermissionsAsync: async () => ({ status: 'granted' }),
    AndroidImportance: { HIGH: 4 }, AndroidAudioUsage: { NOTIFICATION: 5 }, AndroidAudioContentType: { SONIFICATION: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    cancelScheduledNotificationAsync: async id => scheduled.delete(id),
    scheduleNotificationAsync: async request => { const id = String(++sequence); scheduled.set(id, request); return id; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.keys()].map(identifier => ({ identifier })) };
  const mocks = { 'react-native': { Platform: { OS: platform }, Linking: {} },
    '@react-native-async-storage/async-storage': { getItem: async key => store.get(key), setItem: async (key, value) => store.set(key, value) },
    'expo-notifications': notifications, 'expo-intent-launcher': {}, 'expo-constants': {}, './events': {}, './prayerTimes': prayer };
  function load() { const exports = {}; vm.runInNewContext(source, { exports, Date: Clock, require: name => { assert.ok(name in mocks, name); return mocks[name]; } }); return exports; }
  let api = load();
  await api.initializeDefaultPrayerReminders(location);
  assert.equal(scheduled.has('stale'), false);
  const first = [...scheduled.values()][0];
  assert.equal(first.trigger.date.toISOString(), '2026-10-13T18:00:00.000Z');
  const count = sequence;
  api = load(); // Simulated restart with the same persisted settings.
  await api.initializeDefaultPrayerReminders(location);
  assert.equal(sequence, count, 'valid schedule retained on restart');
  await api.setAzaanAlarm('fajr', true, location);
  const azaan = [...scheduled.values()].find(item => item.content.data.kind === 'azaan-alarm');
  assert.equal(azaan.trigger.date.toISOString(), first.trigger.date.toISOString());
  const perth = { fullAddress: 'Perth WA', suburb: 'Perth', state: 'WA', timeZone: 'Australia/Perth', latitude: -31.9523, longitude: 115.8613 };
  await api.initializeDefaultPrayerReminders(perth);
  const alarms = [...scheduled.values()].filter(item => item.content.data.kind === 'prayer-reminder');
  assert.ok(alarms.length);
  for (const alarm of alarms) {
    assert.match(alarm.content.body, /^Perth/);
    const clock = prayer.zonedPrayerClock(alarm.trigger.date, perth.timeZone);
    assert.equal(clock.time, prayer.calculatePrayerTimes(clock.date, perth).fajr);
  }
  await assert.rejects(api.initializeDefaultPrayerReminders({}), /supported Australian city/);
  assert.equal([...scheduled.values()].some(item => item.content.data.kind === 'prayer-reminder'), false);
}
(async () => {
  const previous = process.env.TZ;
  try { process.env.TZ = 'America/Los_Angeles'; await check('ios'); await check('android'); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  console.log('Mocked iOS/Android prayer and Azaan scheduling: city timezone, cache upgrade/restart, location change and invalid-location cancellation passed. Native delivery is not simulated.');
})().catch(error => { console.error(error); process.exitCode = 1; });
