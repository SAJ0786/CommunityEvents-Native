const test = require('node:test');
const assert = require('node:assert/strict');
const { createCityManagement } = require('../backend/functions-business-workflow/cityManagement');
const component = (type, value) => ({ types: [type], longText: value, shortText: value });
const place = () => ({ types: ['locality', 'political'], addressComponents: [
  component('locality', 'Darwin'), component('country', 'AU'), component('administrative_area_level_1', 'NT'),
], location: { latitude: -12.4634, longitude: 130.8456 }, timeZone: { id: 'Australia/Darwin' } });
function fixture() {
  const state = { user: { role: 'superAdmin' }, place: place(), writes: 0, calls: 0, enabled: true };
  const snapshot = path => ({ exists: path === 'users/admin' || !!state.catalogue,
    data: () => path === 'users/admin' ? state.user : state.catalogue });
  const db = { collection: collection => ({ doc: id => ({ path: `${collection}/${id}`,
    get: async () => snapshot(`${collection}/${id}`) }) }),
    runTransaction: async callback => callback({ get: async ref => snapshot(ref.path),
      set: (_ref, data) => { state.catalogue = data; state.writes++; } }) };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const api = createCityManagement({ db, HttpsError, enabled: () => state.enabled,
    provider: { search: async () => [{ placeId: 'darwin-place', label: 'Darwin NT, Australia' }],
      details: async () => { state.calls++; if (state.error) throw state.error; return state.place; } } });
  const req = data => ({ auth: { uid: 'admin' }, data });
  return { state, api, req };
}
test('preview displays resolved coordinates; add re-resolves and stores them, ignoring supplied coordinates', async () => {
  const { api, state, req } = fixture();
  const preview = await api.preview(req({ placeId: 'darwin-place' }));
  assert.equal(preview.city.latitude, -12.4634);
  assert.equal(preview.city.timeZone, 'Australia/Darwin');
  const result = await api.add(req({ ...preview, code: 'DRW', latitude: 0, timeZone: 'Australia/Sydney' }));
  assert.equal(state.calls, 2);
  const saved = result.catalogue.cities.find(city => city.id === result.cityId);
  assert.equal(saved.latitude, preview.city.latitude);
  assert.equal(saved.timeZone, preview.city.timeZone);
  assert.equal(state.writes, 1);
  for (const existing of result.catalogue.cities.filter(city => city.id !== 'rest-of-australia')) {
    assert.equal(typeof existing.latitude, 'number');
    assert.equal(typeof existing.longitude, 'number');
    assert.match(existing.timeZone, /^Australia\//);
  }
  await assert.rejects(api.add(req({ ...preview, code: 'DRW' })), { code: 'already-exists' });
  assert.equal(state.writes, 1);
});
test('missing, malformed or out-of-Australia coordinates/timezones prevent addition', async () => {
  for (const change of [p => { delete p.location; }, p => { p.location.latitude = null; },
    p => { p.location.latitude = '-12.4'; }, p => { p.location.longitude = 0; },
    p => { p.location.latitude = NaN; }, p => { p.timeZone = {}; },
    p => { p.timeZone.id = 'Australia/Invalid'; }, p => { p.types = ['street_address']; },
    p => { p.addressComponents[1].shortText = 'NZ'; }]) {
    const { api, state, req } = fixture(); change(state.place);
    await assert.rejects(api.preview(req({ placeId: 'darwin-place' })));
    await assert.rejects(api.add(req({ placeId: 'darwin-place', code: 'DRW' })));
    assert.equal(state.writes, 0);
  }
});
test('changed location or lookup failure after preview cannot save', async () => {
  const { api, state, req } = fixture();
  const preview = await api.preview(req({ placeId: 'darwin-place' }));
  state.place.location.latitude = -12.5;
  await assert.rejects(api.add(req({ ...preview, code: 'DRW' })), { code: 'failed-precondition' });
  state.error = new Error('offline');
  await assert.rejects(api.add(req({ ...preview, code: 'DRW' })));
  assert.equal(state.writes, 0);
});
test('gate, authentication and active super-admin role protect every operation', async () => {
  for (const method of ['search', 'preview', 'add']) {
    const { api, state, req } = fixture();
    await assert.rejects(api[method]({}), { code: 'unauthenticated' });
    state.user.role = 'admin';
    await assert.rejects(api[method](req({})), { code: 'permission-denied' });
    state.user = { role: 'superAdmin', accountStatus: 'deleted' };
    await assert.rejects(api[method](req({})), { code: 'permission-denied' });
    state.enabled = false;
    await assert.rejects(api[method](req({})), { code: 'failed-precondition' });
    assert.equal(state.calls, 0); assert.equal(state.writes, 0);
  }
});
test('invalid existing catalogue is not overwritten and duplicate city under another code is rejected', async () => {
  const { api, state, req } = fixture();
  const preview = await api.preview(req({ placeId: 'darwin-place' }));
  state.catalogue = { schemaVersion: 1, cities: [] };
  await assert.rejects(api.add(req({ ...preview, code: 'DRW' })), { code: 'failed-precondition' });
  assert.equal(state.writes, 0);
  delete state.catalogue;
  await api.add(req({ ...preview, code: 'DRW' }));
  await assert.rejects(api.add(req({ ...preview, code: 'DAR' })), { code: 'already-exists' });
  assert.equal(state.writes, 1);
});
