const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync(path.resolve(__dirname, '../src/services/prayerTimes.js'), 'utf8');
const { code } = babel.transformSync(source, { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
function load(intl = Intl) { const exports = {}; vm.runInNewContext(code, { exports, Intl: intl }); return exports; }
const service = load();
const cases = [
  ['2026-10-03', 'Australia/Sydney', 10], ['2026-10-04', 'Australia/Sydney', 11],
  ['2026-04-04', 'Australia/Sydney', 11], ['2026-04-05', 'Australia/Sydney', 10],
  ['2026-10-04', 'Australia/Adelaide', 10.5], ['2026-10-03', 'Australia/Adelaide', 9.5],
  ['2026-10-04', 'Australia/Perth', 8], ['2026-10-04', 'Australia/Brisbane', 10],
  ['2026-10-04', 'Australia/Darwin', 9.5], ['2026-10-04', 'Australia/Hobart', 11],
  ['2026-10-14', 'Australia/Sydney', 11], ['2027-04-03', 'Australia/Sydney', 11],
  ['2027-04-04', 'Australia/Sydney', 10], ['2026-10-14', 'Australia/Melbourne', 11],
  ['2026-10-14', 'Australia/Brisbane', 10], ['2026-10-14', 'Australia/Perth', 8],
  ['2026-10-14', 'Australia/Adelaide', 10.5], ['2026-10-14', 'Australia/Darwin', 9.5],
];
for (const [date, zone, expected] of cases) assert.equal(service.timeZoneOffsetHours(date, zone), expected, `${date} ${zone}`);
const location = { fullAddress: 'Sydney NSW', state: 'NSW', latitude: -33.8688, longitude: 151.2093 };
const withoutShortOffset = load({ DateTimeFormat: function(locale, options) { if (options.timeZoneName) throw Error('Unsupported shortOffset'); return new Intl.DateTimeFormat(locale, options); } });
assert.equal(JSON.stringify(withoutShortOffset.calculatePrayerTimes('2026-10-04', location)), JSON.stringify(service.calculatePrayerTimes('2026-10-04', location)));
assert.equal(service.timeZoneOffsetHours('2026-02-31', 'Australia/Sydney'), null);
assert.equal(service.timeZoneOffsetHours('invalid', 'Australia/Sydney'), null);
assert.equal(service.timeZoneOffsetHours('2026-10-04', 'Invalid/Timezone'), null);
assert.equal(load({ DateTimeFormat: function() { throw Error('Unavailable'); } }).calculatePrayerTimes('2026-10-04', location), null);
const reminders = fs.readFileSync(path.resolve(__dirname, '../src/services/reminders.js'), 'utf8');
assert.match(reminders, /calculationVersion: value.calculationVersion/);
assert.match(reminders, /current.calculationVersion !== PRAYER_CALCULATION_VERSION/);
// Reproduce the actual historical source with the two Intl behaviours; these
// are simulated engine outputs, not a claim of physical-device verification.
const legacy = execFileSync('git', ['show', '435f6ec:src/services/prayerTimes.js'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
const legacyCode = babel.transformSync(legacy, { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
function legacyWithZoneName(name) {
  const exports = {};
  vm.runInNewContext(legacyCode, { exports, Intl: { DateTimeFormat: function() { return { formatToParts: () => [{ type: 'timeZoneName', value: name }] }; } } });
  return exports.calculatePrayerTimes('2026-10-14', location);
}
const legacyAbbreviation = legacyWithZoneName('AEDT');
const legacyNumeric = legacyWithZoneName('GMT+11');
const fixed = service.calculatePrayerTimes('2026-10-14', location);
const minutes = time => time.split(':').reduce((hours, minute) => Number(hours) * 60 + Number(minute));
for (const key of ['fajr', 'sunrise', 'zohrain', 'asr', 'sunset', 'maghreb', 'isha']) {
  assert.equal(minutes(legacyNumeric[key]) - minutes(legacyAbbreviation[key]), 60, key);
  assert.equal(fixed[key], legacyNumeric[key], key);
}
// Offset at the instant, on both sides of the early-morning clock changes.
for (const [instant, expected] of [['2026-10-03T15:59:00Z', 10], ['2026-10-03T16:00:00Z', 11], ['2027-04-03T15:59:00Z', 11], ['2027-04-03T16:00:00Z', 10]]) {
  assert.equal(service.zonedPrayerClock(instant, 'Australia/Sydney').offsetHours, expected);
}
assert.equal(service.prayerTimeInstant('2026-10-04', '02:30', 'Australia/Sydney'), null);
assert.equal(service.prayerTimeInstant('2027-04-04', '02:30', 'Australia/Sydney'), null);
assert.equal(service.prayerTimeInstant('2026-10-14', '05:00', 'Australia/Sydney').toISOString(), '2026-10-13T18:00:00.000Z');
assert.equal(service.prayerTimeInstant('2026-10-14', '25:00', 'Australia/Sydney'), null);
assert.equal(service.prayerDateAt(location, '2026-10-13T13:30:00Z'), '2026-10-14');
assert.equal(service.prayerDateAt(location, '2026-10-13T13:30:00Z', 1), '2026-10-15');
assert.equal(service.prayerDateAt(null), null);
// Reload without network/cache dependencies, using different process timezones.
const previousTZ = process.env.TZ;
try {
  for (const deviceZone of ['UTC', 'Australia/Perth', 'America/Los_Angeles', 'Asia/Kolkata']) {
    process.env.TZ = deviceZone;
    assert.equal(JSON.stringify(load().calculatePrayerTimes('2026-10-14', location)), JSON.stringify(fixed));
    assert.equal(service.prayerDateAt(location, '2026-10-13T13:30:00Z'), '2026-10-14');
    assert.equal(service.prayerTimeInstant('2026-10-14', fixed.fajr, fixed.timeZone).toISOString(), service.prayerTimeInstant('2026-10-14', legacyNumeric.fajr, fixed.timeZone).toISOString());
  }
} finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
assert.equal((reminders.match(/prayerTimeInstant\(isoDate, times\[key\], times.timeZone\)/g) || []).length, 2);
assert.doesNotMatch(reminders, /localIsoDate/);
const choice = fs.readFileSync(path.resolve(__dirname, '../src/components/AddEventChoice.js'), 'utf8');
assert.match(choice, />Single Event</); assert.match(choice, />Recurring Event</);
assert.match(choice, />Registration only events</); assert.doesNotMatch(choice, /Open Single|Open Recurring|Open means/);
console.log(`Prayer timezone: ${cases.length} date/zone cases, legacy 60-minute reproduction, transition instants, gap/fold rejection, cross-device zones, reload and reminder guards passed. Physical devices remain untested.`);
console.log(JSON.stringify({ simulatedLegacyAEDT: legacyAbbreviation, simulatedLegacyGMT11: legacyNumeric, corrected: fixed }, null, 2));
