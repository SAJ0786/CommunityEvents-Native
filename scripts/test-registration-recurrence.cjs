const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = babel.transformSync(source, { configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  vm.runInNewContext(code, { exports, require: name => {
    assert.ok(name in mocks, `Unexpected dependency ${name}`);
    return mocks[name];
  } });
  return exports;
}
const hijri = load('src/services/hijri.js');
const normal = load('src/services/recurrence.js', { './hijri': hijri });
const native = load('src/registration/registrationRecurrence.js', { '../services/hijri': hijri });
const rule = { calendarType: 'gregorian', frequency: 'week', repeatEvery: 1, endMode: 'count', occurrenceCount: 4 };
const plain = value => JSON.parse(JSON.stringify(value));

test('Native and backend recurrence algorithms stay identical except calendar import', () => {
  const nativeSource = fs.readFileSync(path.join(root, 'src/registration/registrationRecurrence.js'), 'utf8').replace(/\r/g, '').replace("'../services/hijri'", "'./hijri.mjs'");
  assert.equal(nativeSource, fs.readFileSync(path.join(root, 'backend/functions-registration/registrationRecurrence.mjs'), 'utf8').replace(/\r/g, ''));
});

test('Gregorian daily, weekly, fortnightly, clamped monthly and leap-year rules match normal Native recurrence in multiple device zones', async () => {
  const server = await import('../backend/functions-registration/registrationRecurrence.mjs');
  const previous = process.env.TZ;
  try {
    for (const timeZone of ['Australia/Sydney', 'Australia/Adelaide', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = timeZone;
      for (const [frequency, repeatEvery, startDate] of [['day', 1, '2026-10-03'], ['week', 1, '2026-12-01'], ['week', 2, '2026-12-01'], ['month', 1, '2026-01-31'], ['year', 1, '2028-02-29']]) {
        const input = { ...rule, frequency, repeatEvery };
        const expected = normal.generateGregorianOccurrences({ ...input, startDate }).map(row => row.eventDate);
        assert.deepEqual(plain(native.registrationOccurrenceDates(startDate, input)), plain(expected));
        assert.deepEqual(server.registrationOccurrenceDates(startDate, input), plain(expected));
      }
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('Hijri conversions and true month/year recurrence match normal Native calendar with trusted overrides', async () => {
  const server = await import('../backend/functions-registration/registrationRecurrence.mjs');
  const converter = await import('../backend/functions-registration/hijri.mjs');
  const cases = [[], [{ hYear: 1448, hMonth: 7, gDate: '2026-12-11' }], [{ hYear: 1448, hMonth: 7, gDate: '2026-12-11' }, { hYear: 1448, hMonth: 8, gDate: '2027-01-09' }]];
  for (const overrides of cases) {
    for (let year = 1446; year <= 1452; year++) for (let month = 1; month <= 12; month++) {
      for (const day of [1, 15, 29, 30]) assert.equal(converter.hijriToGregorian(day, month, year, overrides), hijri.hijriToGregorian(day, month, year, overrides));
    }
    for (const [frequency, repeatEvery] of [['day', 1], ['week', 2], ['month', 1], ['year', 1]]) {
      const startHijri = { day: 1, month: 7, year: 1448 };
      const input = { ...rule, calendarType: 'hijri', frequency, repeatEvery, startHijri };
      const startDate = hijri.hijriToGregorian(startHijri.day, startHijri.month, startHijri.year, overrides);
      const expected = normal.generateHijriOccurrences({ ...input, overrides }).map(row => row.eventDate);
      assert.deepEqual(plain(native.registrationOccurrenceDates(startDate, input, overrides)), plain(expected));
      assert.deepEqual(server.registrationOccurrenceDates(startDate, input, overrides), plain(expected));
      assert.equal(server.registrationOccurrencePreview(startDate, input, overrides)[1].enteredAsHijri, true);
    }
  }
});

test('bounded date-ending recurrences include exact end and refuse truncation, missing calendar, impossible dates and oversized plans', () => {
  assert.deepEqual(plain(native.registrationOccurrenceDates('2026-12-01', { ...rule, endMode: 'date', endDate: '2026-12-15' })), ['2026-12-01', '2026-12-08', '2026-12-15']);
  assert.equal(native.registrationOccurrenceDates('2026-12-01', { ...rule, frequency: 'day', occurrenceCount: 100 }).length, 100);
  for (const input of [
    { ...rule, occurrenceCount: 101 }, { ...rule, occurrenceCount: 1 },
    { ...rule, frequency: 'year', occurrenceCount: 6 },
    { ...rule, repeatEvery: 0 }, { ...rule, repeatEvery: 1.5 },
    { ...rule, calendarType: 'invalid' },
    { ...rule, frequency: 'day', endMode: 'date', endDate: '2027-03-11' },
    { ...rule, endMode: 'date', endDate: '2027-12-02' },
    { ...rule, endMode: 'date', endDate: '2026-02-30' },
  ]) assert.throws(() => native.registrationOccurrenceDates('2026-12-01', input));
  const lunar = { ...rule, calendarType: 'hijri', startHijri: { day: 1, month: 7, year: 1448 }, endMode: 'date', endHijri: { day: 1, month: 9, year: 1448 }, frequency: 'month' };
  const start = hijri.hijriToGregorian(1, 7, 1448);
  assert.equal(native.registrationOccurrenceDates(start, lunar).length, 3);
  assert.throws(() => native.registrationOccurrenceDates('2026-12-01', lunar), /Hijri start date changed/);
});

test('series client strips private poster bytes from callable and retains exact stable creation contract', async () => {
  const { createRegistrationClient } = load('src/registration/registrationClient.js');
  const calls = [];
  const client = createRegistrationClient(async (name, data) => { calls.push({ name, data }); return { data: { seriesId: 'series', events: [] } }; }, { enabled: true });
  const input = { city: 'sydney', createKey: 'same-key', draft: { title: 'Workshop', poster: { base64: 'PRIVATE' } }, recurrence: rule, occurrences: [] };
  await client.createSeries(input); await client.createSeries(input);
  assert.equal(calls[0].name, 'createRegistrationSeries');
  assert.equal(calls[0].data.draft.poster, undefined);
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(calls[1]));
  assert.equal(calls[0].data.createKey, 'same-key');
});
