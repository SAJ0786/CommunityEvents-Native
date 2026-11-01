const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
function load(file, mocks = {}) {
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, Date, require: id => {
    assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id];
  } });
  return exports;
}
const hijri = load('src/services/hijri.js');
const { currentHijriEventDate, resolveHijriEventDate } = load('src/utils/hijriEventDate.js', { '../services/hijri': hijri });
const prayer = load('src/services/prayerTimes.js');
const now = new Date(2026, 10, 1, 0, 15);
const today = currentHijriEventDate([], now);
assert.equal(today.eventDate, '2026-11-01');
assert.ok(today.hijriDay && today.hijriMonth && today.hijriYear && today.hijriDate);
assert.equal(hijri.hijriToGregorian(today.hijriDay, today.hijriMonth, today.hijriYear), today.eventDate);
const past = hijri.getHijriParts('2026-10-31');
const reset = resolveHijriEventDate({ hijriDay: past.day, hijriMonth: past.month, hijriYear: past.year }, [], now);
assert.equal(reset.eventDate, today.eventDate);
assert.equal(reset.hijriDate, today.hijriDate);
const future = hijri.getHijriParts('2026-12-01');
assert.equal(resolveHijriEventDate({ hijriDay: future.day, hijriMonth: future.month, hijriYear: future.year }, [], now).eventDate, '2026-12-01');
assert.equal(resolveHijriEventDate({ ...today, hijriYear: '144' }, [], now).eventDate, '');
const override = [{ hYear: today.hijriYear, hMonth: today.hijriMonth, gDate: hijri.hijriToGregorian(1, today.hijriMonth, today.hijriYear) }];
const adjusted = currentHijriEventDate(override, now);
assert.equal(hijri.hijriToGregorian(adjusted.hijriDay, adjusted.hijriMonth, adjusted.hijriYear, override), adjusted.eventDate);
const times = prayer.calculatePrayerTimes(today.eventDate, { fullAddress: '81 Clifton Ave, Kemps Creek NSW', state: 'NSW', latitude: -33.88, longitude: 150.79 });
assert.ok(times?.fajr && times?.zohrain && times?.maghreb);
console.log('PASS Hijri today prefill, local midnight, conversion, past reset, future preservation, incomplete year, overrides and prayer calculation');
