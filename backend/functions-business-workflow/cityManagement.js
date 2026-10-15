'use strict';

const { createHash } = require('node:crypto');
const { isActiveRecipient } = require('./notification-policy');
const model = import('./cityCatalogue.mjs');
const text = value => typeof value === 'string' ? value.trim() : '';
const fingerprint = city => createHash('sha256').update(JSON.stringify(city)).digest('hex');

// No client-supplied coordinate, timezone or label is trusted when saving.
function createCityManagement({ db, HttpsError, provider, enabled = () => process.env.CITY_MANAGEMENT_ENABLED === 'true' }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  function requireAdmin(snapshot) {
    const user = snapshot.exists ? snapshot.data() : null;
    if (!isActiveRecipient(user) || user.role !== 'superAdmin') fail('permission-denied', 'Only an active Super Admin can add cities.');
  }
  async function authorize(request) {
    if (!enabled()) fail('failed-precondition', 'City management is not enabled yet.');
    if (!request.auth?.uid) fail('unauthenticated', 'Sign in to manage cities.');
    const ref = db.collection('users').doc(request.auth.uid);
    requireAdmin(await ref.get());
    return ref;
  }
  async function resolve(placeId) {
    if (!/^[A-Za-z0-9_-]{5,300}$/.test(placeId)) fail('invalid-argument', 'Select a city from search results.');
    const place = await provider.details(placeId);
    const component = (type, short = false) => {
      const item = place.addressComponents?.find(value => value.types?.includes(type));
      return text(short ? item?.shortText : item?.longText);
    };
    if (component('country', true) !== 'AU' || !place.types?.includes('locality')) {
      fail('invalid-argument', 'Select an Australian city or town, not a street or business.');
    }
    const name = component('locality');
    const state = component('administrative_area_level_1', true);
    const city = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${state.toLowerCase()}`,
      label: `${name}, ${state}, Australia`, state,
      latitude: place.location?.latitude, longitude: place.location?.longitude,
      timeZone: text(place.timeZone?.id),
    };
    const { BUNDLED_CITY_CATALOGUE, validateCityCatalogue } = await model;
    if (!name || !validateCityCatalogue({ schemaVersion: 1, cities: [...BUNDLED_CITY_CATALOGUE.cities,
      { ...city, code: 'NEW', order: 100, enabled: true, aliases: [], postcodeRanges: [] }] })) {
      fail('failed-precondition', 'Coordinates or timezone could not be resolved. This city cannot be added.');
    }
    return city;
  }
  return {
    async search(request) {
      await authorize(request);
      const input = text(request.data?.input);
      if (input.length < 3 || input.length > 100) fail('invalid-argument', 'Enter between 3 and 100 characters.');
      return { suggestions: await provider.search(input) };
    },
    async preview(request) {
      await authorize(request);
      const placeId = text(request.data?.placeId);
      const city = await resolve(placeId);
      return { city, placeId, fingerprint: fingerprint(city) };
    },
    async add(request) {
      const userRef = await authorize(request);
      const city = await resolve(text(request.data?.placeId));
      if (request.data?.fingerprint !== fingerprint(city)) fail('failed-precondition', 'Location changed. Search and review the coordinates again.');
      const code = text(request.data?.code).toUpperCase();
      if (!/^[A-Z0-9]{2,6}$/.test(code)) fail('invalid-argument', 'Use a city code of 2–6 letters or digits.');
      const { BUNDLED_CITY_CATALOGUE, validateCityCatalogue } = await model;
      const ref = db.collection('settings').doc('cityCatalogue');
      return db.runTransaction(async tx => {
        const [user, snapshot] = await Promise.all([tx.get(userRef), tx.get(ref)]);
        requireAdmin(user);
        const existing = validateCityCatalogue(snapshot.exists ? snapshot.data() : BUNDLED_CITY_CATALOGUE);
        if (!existing) fail('failed-precondition', 'Existing city catalogue needs repair before adding cities.');
        if (existing.cities.some(row => row.id === city.id || row.code === code
          || (row.state === city.state && row.label.split(',')[0].toLowerCase() === city.label.split(',')[0].toLowerCase())
          || (Math.abs(row.latitude - city.latitude) < 0.001 && Math.abs(row.longitude - city.longitude) < 0.001))) {
          fail('already-exists', 'This city or city code already exists, including disabled cities.');
        }
        const next = validateCityCatalogue({ schemaVersion: 1, cities: [...existing.cities,
          { ...city, code, enabled: true, order: Math.max(...existing.cities.map(row => row.order)) + 1,
            aliases: [city.label.split(',')[0].toLowerCase()], postcodeRanges: [] }] });
        if (!next) fail('failed-precondition', 'City conflicts with the catalogue or the 100-city limit has been reached.');
        tx.set(ref, next);
        return { catalogue: next, cityId: city.id };
      });
    },
  };
}

function register({ db, onCall, HttpsError, REGION, apiKey }) {
  async function json(url, options = {}) {
    let response;
    try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) }); }
    catch { throw new HttpsError('unavailable', 'City lookup is unavailable. Nothing was added.'); }
    if (!response.ok) throw new HttpsError('unavailable', 'City lookup is unavailable. Nothing was added.');
    return response.json();
  }
  function headers(mask) {
    const key = apiKey.value();
    if (!key) throw new HttpsError('failed-precondition', 'City search is not configured.');
    return { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, ...(mask ? { 'X-Goog-FieldMask': mask } : {}) };
  }
  const provider = {
    async search(input) {
      const result = await json('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST', headers: headers(), body: JSON.stringify({ input,
          includedRegionCodes: ['au'], includedPrimaryTypes: ['(cities)'], languageCode: 'en-AU' }),
      });
      return (result.suggestions || []).slice(0, 8).map(item => ({
        placeId: text(item.placePrediction?.placeId), label: text(item.placePrediction?.text?.text),
      })).filter(item => item.placeId && item.label);
    },
    details(placeId) {
      return json(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en-AU`, {
        headers: headers('addressComponents,types,location,timeZone'),
      });
    },
  };
  const handlers = createCityManagement({ db, HttpsError, provider });
  const options = { region: REGION, enforceAppCheck: true, secrets: [apiKey], maxInstances: 2 };
  return {
    searchCatalogueCities: onCall(options, handlers.search),
    previewCatalogueCity: onCall(options, handlers.preview),
    addCatalogueCity: onCall(options, handlers.add),
  };
}
module.exports = { createCityManagement, register };
