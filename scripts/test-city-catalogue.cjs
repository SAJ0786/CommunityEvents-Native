const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, mocks = {}, globals = {}) {
  const { code } = babel.transformSync(read(file), { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'] });
  const exports = {};
  vm.runInNewContext(code, { exports, Intl, setTimeout, clearTimeout, ...globals, require: key => {
    if (!(key in mocks)) throw Error('Unexpected import ' + key);
    return mocks[key];
  } });
  return exports;
}
const clone = value => JSON.parse(JSON.stringify(value));
function extended(model) {
  const data = clone(model.BUNDLED_CITY_CATALOGUE);
  data.cities.push({ id: 'darwin', label: 'Darwin, Australia', code: 'DRW', enabled: true, order: 9,
    state: 'NT', timeZone: 'Australia/Darwin', latitude: -12.4634, longitude: 130.8456,
    aliases: ['Darwin', 'Palmerston'], postcodeRanges: [[800, 899]] });
  return data;
}
test('new city, codes, area matching, disabled selection and retained historical IDs', () => {
  const model = load('src/utils/cities.js');
  const options = model.CITY_OPTIONS; const data = extended(model);
  let updates = 0; const remove = model.subscribeCityCatalogue(() => updates++);
  assert.equal(model.installCityCatalogue(data), true);
  assert.equal(updates, 1); assert.equal(model.CITY_OPTIONS, options);
  assert.ok(options.some(city => city.value === 'darwin'));
  assert.equal(model.cityCode('darwin'), 'DRW');
  assert.equal(model.cityLabel('darwin'), 'Darwin, NT, Australia');
  assert.equal(model.classifyMetroArea({ fullAddress: 'Synthetic Street NT 0830' }), 'darwin');
  assert.equal(model.classifyMetroArea({ suburb: 'Palmerston' }), 'darwin');
  assert.equal(model.getEventMetroArea({ metroArea: 'future-city' }), 'future-city');
  assert.equal(model.normalizeCity('future-city'), 'future-city');
  assert.equal(model.normalizeCity(null), 'sydney');
  assert.equal(model.normalizeCity('__proto__'), '');
  assert.match(model.cityLabel('future-city'), /Unavailable city/);
  data.cities.find(city => city.id === 'darwin').enabled = false;
  assert.equal(model.installCityCatalogue(data), true);
  assert.equal(options.some(city => city.value === 'darwin'), false);
  assert.equal(model.normalizeCity('darwin'), 'darwin');
  assert.equal(model.cityCode('darwin'), 'DRW');
  assert.equal(model.installCityCatalogue(model.BUNDLED_CITY_CATALOGUE), false, 'disable rather than delete historical city IDs');
  const count = updates; model.installCityCatalogue(data); assert.equal(updates, count);
  remove(); data.cities[0].label = 'Updated label'; model.installCityCatalogue(data); assert.equal(updates, count);
});
test('malformed catalogues never replace last-known-good data', () => {
  const model = load('src/utils/cities.js'); const good = extended(model);
  for (const mutate of [
    data => { data.schemaVersion = 2; }, data => data.cities.pop(),
    data => data.cities.push(data.cities[0]), data => { data.cities[0].timeZone = 'Invalid/Zone'; },
    data => { data.cities[0].latitude = '34'; }, data => { data.cities[0].longitude = 0; },
    data => { data.cities[0].aliases = ['...']; }, data => { data.cities[0].postcodeRanges = [[900, 800]]; },
    data => { data.cities[0].postcodeRanges = [[810, 820]]; }, data => { data.cities[0].aliases = ['Darwin']; },
    data => { data.cities.find(city => city.id === 'rest-of-australia').latitude = -33; },
  ]) {
    model.installCityCatalogue(good);
    const invalid = clone(good); mutate(invalid);
    assert.equal(model.installCityCatalogue(invalid), false);
    assert.equal(model.cityCode('darwin'), 'DRW');
  }
});
test('prayer coordinates/timezone follow catalogue; unknown and all-Australia have no Sydney fallback', () => {
  const model = load('src/utils/cities.js'); model.installCityCatalogue(extended(model));
  const { getPrayerLocation } = load('src/utils/prayerLocations.js', { './cities': model });
  const prayer = load('src/services/prayerTimes.js');
  assert.equal(getPrayerLocation('darwin').timeZone, 'Australia/Darwin');
  assert.equal(prayer.calculatePrayerTimes('2026-10-14', getPrayerLocation('darwin')).timeZone, 'Australia/Darwin');
  assert.equal(prayer.calculatePrayerTimes('2026-10-14', getPrayerLocation('future-city')), null);
  assert.equal(prayer.calculatePrayerTimes('2026-10-14', getPrayerLocation('rest-of-australia')), null);
});
test('offline cache, request deduplication, one-hour throttling and invalid-response fallback', async () => {
  const model = load('src/utils/cities.js'); const cached = extended(model);
  let calls = 0; let time = 10000; let fail = true; let data = null; const writes = [];
  const service = load('src/services/cityCatalogue.js', {
    react: {}, 'react-native': {}, '../utils/cities': model, '../firebase/firebase': { db: {} },
    '@react-native-async-storage/async-storage': { getItem: async () => JSON.stringify(cached), setItem: async (...args) => writes.push(args) },
    '@react-native-firebase/firestore': { doc: (...args) => args, getDocFromServer: async ref => {
      assert.equal(ref.slice(1).join('/'), 'settings/cityCatalogue'); calls++;
      if (fail) throw Error('offline');
      return { exists: () => data !== null, data: () => data };
    } },
  }, { Date: { now: () => time } });
  const first = service.refreshCityCatalogue(); assert.equal(service.refreshCityCatalogue(), first); await first;
  assert.equal(model.cityCode('darwin'), 'DRW'); assert.equal(calls, 1);
  fail = false; data = { bad: true }; await service.refreshCityCatalogue();
  assert.equal(calls, 2); assert.equal(writes.length, 0); assert.equal(model.cityCode('darwin'), 'DRW');
  await service.refreshCityCatalogue(); assert.equal(calls, 2);
  time += 3600001; data = clone(cached); data.cities.at(-1).code = 'DAR';
  await service.refreshCityCatalogue(); assert.equal(calls, 3); assert.equal(model.cityCode('darwin'), 'DAR'); assert.equal(writes.length, 1);
});
test('server packages use the identical catalogue schema and classification implementation', () => {
  const source = read('src/utils/cities.js').replace(/\r\n/g, '\n').trim();
  for (const codebase of ['functions-registration', 'functions-business-workflow', 'functions-events', 'functions-lifecycle']) {
    assert.equal(read(`backend/${codebase}/cityCatalogue.mjs`).replace(/\r\n/g, '\n').trim(), source);
  }
});

test('server resolver preserves unknown IDs, uses new coordinates/aliases and rejects missing coordinates', () => {
  const model = load('src/utils/cities.js'); const data = extended(model); const resolver = model.createCityResolver(data);
  assert.equal(resolver.getUserCity({ defaultCity: 'darwin' }), 'darwin');
  assert.equal(resolver.getUserCity({ defaultCity: 'future-city' }), 'future-city');
  assert.equal(resolver.getEventMetroArea({ address: { suburb: 'Palmerston' } }), 'darwin');
  assert.equal(resolver.cityLabel('darwin'), 'Darwin, NT, Australia');
  for (const latitude of [null, undefined, NaN, '', 0, -91]) {
    const invalid = clone(data); invalid.cities.at(-1).latitude = latitude;
    assert.throws(() => model.createCityResolver(invalid), /Invalid city catalogue/);
  }
  assert.equal(model.cityCode('darwin'), '—', 'resolver must not install global native state');
});

test('concurrent Events workers keep independent catalogue snapshots and fail closed on invalid configuration', async () => {
  const model = load('src/utils/cities.js'); let data = extended(model);
  const { createCityContext } = require('../backend/functions-events/cityContext');
  const context = createCityContext({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => clone(data) }) }) }) });
  let release; const pause = new Promise(resolve => { release = resolve; }); let started;
  const entered = new Promise(resolve => { started = resolve; });
  const first = context.run(async () => { started(); await pause; return context.cityLabel('darwin'); });
  await entered; data.cities.at(-1).label = 'Updated Darwin';
  const second = await context.run(async () => context.cityLabel('darwin'));
  release(); assert.equal(await first, 'Darwin, NT, Australia'); assert.equal(second, 'Updated Darwin');
  data = { invalid: true }; let called = false;
  await assert.rejects(context.run(() => { called = true; }), /Invalid city catalogue/);
  assert.equal(called, false);
});

test('recurrence uses configured timezone and never substitutes Sydney for unknown explicit cities', () => {
  const { isFutureSeriesEvent } = require('../src/utils/seriesScope');
  assert.equal(read('src/utils/seriesScope.js').replace(/\r/g, ''), read('backend/functions-lifecycle/seriesScope.js').replace(/\r/g, ''));
  const now = new Date('2026-10-15T14:00:00Z'); // Perth 22:00; Sydney already next day.
  const event = { eventDate: '2026-10-15', startTime: '23:00', city: 'new-wa-city', status: 'active' };
  assert.equal(isFutureSeriesEvent(event, now), false);
  assert.equal(isFutureSeriesEvent(event, now, [{ id: 'new-wa-city', timeZone: 'Australia/Perth', enabled: false }]), true);
  assert.equal(isFutureSeriesEvent(event, now, [{ id: 'new-wa-city', timeZone: 'invalid' }]), false);
});
