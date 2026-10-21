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
const registration = {}; vm.runInNewContext(compiled('src/registration/eventSchedule.js'), { exports: registration, Intl, Date: Clock });
async function check(platform) {
  const store = new Map(); const scheduled = new Map(); let sequence = 0, failAt = Infinity, permission = 'granted', failStore = false;
  const location = { fullAddress: 'Sydney NSW', suburb: 'Sydney', state: 'NSW', timeZone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093 };
  store.set('@community-events/prayer-reminders', JSON.stringify({ initialized: true, enabledKeys: ['fajr'], notificationIds: ['stale'], location, refreshedAt: new Date(now).toISOString(), calculationVersion: 'old' }));
  scheduled.set('stale', {});
  const notifications = { setNotificationHandler() {}, setNotificationChannelAsync: async () => {}, getPermissionsAsync: async () => ({ status: permission }), requestPermissionsAsync: async () => ({status:permission}),
    AndroidImportance: { HIGH: 4 }, AndroidAudioUsage: { NOTIFICATION: 5 }, AndroidAudioContentType: { SONIFICATION: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' },
    cancelScheduledNotificationAsync: async id => scheduled.delete(id),
    cancelAllScheduledNotificationsAsync: async () => scheduled.clear(),
    scheduleNotificationAsync: async request => { const id = String(++sequence); if(sequence === failAt) throw new Error('Native schedule rejected'); scheduled.set(id, request); return id; },
    getAllScheduledNotificationsAsync: async () => [...scheduled.keys()].map(identifier => ({ identifier })) };
  const mocks = { 'react-native': { Platform: { OS: platform }, Linking: {} },
    '@react-native-async-storage/async-storage': { getItem: async key => store.get(key), setItem: async (key, value) => {if(failStore && key.includes('azaan'))throw new Error('Storage unavailable');store.set(key,value);}, multiRemove: async keys => keys.forEach(key=>store.delete(key)) },
    'expo-notifications': notifications, 'expo-intent-launcher': {}, 'expo-constants': {},
    '@react-native-firebase/functions': { httpsCallable: () => async () => ({ data: {} }) },
    '../firebase/firebase': { auth: {}, functions: {} }, '../theme': { colors: { purple: '#6f42c1' } },
    './events': {}, './prayerTimes': prayer, '../registration/eventSchedule': registration, './diagnostics': { recordNonFatalError() {} } };
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
  const saved = store.get('@community-events/azaan-alarms-v1'), savedIds = [...scheduled.keys()].sort();
  failAt = sequence + 3;
  await assert.rejects(api.setAzaanAlarm('zohrain',true,location), /could not save/);
  assert.equal(store.get('@community-events/azaan-alarms-v1'),saved);
  assert.deepEqual([...scheduled.keys()].sort(),savedIds,'Partial native schedule is rolled back, previous alarms survive');
  failAt = Infinity;permission = 'denied';
  await assert.rejects(api.setAzaanAlarm('zohrain',true,location), e=>e.code==='NOTIFICATIONS_BLOCKED');
  assert.deepEqual([...scheduled.keys()].sort(),savedIds,'Permission failure cannot cancel the previous schedule');
  permission = 'granted';failStore = true;
  await assert.rejects(api.setAzaanAlarm('zohrain',true,location), /Storage unavailable/);
  assert.deepEqual([...scheduled.keys()].sort(),savedIds,'Persistence failure removes replacements and preserves previous alarms');
  failStore = false;
  await Promise.all([api.setAzaanAlarm('zohrain',true,location),api.setAzaanAlarm('maghreb',true,location)]);
  const settings=await api.getAzaanAlarmSettings();assert.deepEqual(Array.from(settings.enabledKeys).sort(),['fajr','maghreb','zohrain']);
  assert.equal([...scheduled.values()].filter(n=>n.content.data?.kind==='azaan-alarm').length,settings.notificationIds.length,'Concurrent toggles do not leave orphan or duplicate schedules');
  assert.deepEqual(Array.from((await load().getAzaanAlarmSettings()).enabledKeys).sort(),['fajr','maghreb','zohrain'],'Device choices survive service restart');
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
  await api.clearAccountDeviceAlerts();assert.equal(scheduled.size,0);
  assert.deepEqual(Array.from((await api.getAzaanAlarmSettings()).enabledKeys),[],'Explicit sign-out removes local alarm choices');
}
(async () => {
  const previous = process.env.TZ;
  try { process.env.TZ = 'America/Los_Angeles'; await check('ios'); await check('android'); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  console.log('Mocked iOS/Android prayer/Azaan checks passed: timezone, rollback after native/storage/permission failure, concurrent toggles, restart persistence, location changes and sign-out cleanup. Native delivery is not simulated.');
})().catch(error => { console.error(error); process.exitCode = 1; });
