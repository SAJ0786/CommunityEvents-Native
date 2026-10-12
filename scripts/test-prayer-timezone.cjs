const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
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
console.log('Prayer timezone: 10 date/zone cases, shortOffset incompatibility, invalid dates/zones, fail-closed and reminder refresh guard passed. Device scheduling acceptance remains pending.');
