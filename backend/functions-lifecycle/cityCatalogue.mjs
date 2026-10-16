export const DEFAULT_CITY = 'sydney';

export const CITY_OPTIONS = [
  { value: 'adelaide', label: 'Adelaide, Australia' },
  { value: 'brisbane', label: 'Brisbane, Australia' },
  { value: 'canberra', label: 'Canberra, Australia' },
  { value: 'hobart', label: 'Hobart, Australia' },
  { value: 'melbourne', label: 'Melbourne, Australia' },
  { value: 'perth', label: 'Perth, Australia' },
  { value: 'rest-of-australia', label: 'Rest of Australia' },
  { value: 'sydney', label: 'Sydney, Australia' },
];

export const CITY_CODES = {
  sydney: 'SYD',
  melbourne: 'MEL',
  canberra: 'CBR',
  brisbane: 'BNE',
  adelaide: 'ADL',
  hobart: 'HBA',
  perth: 'PER',
  'rest-of-australia': 'ROA',
};

const BUNDLED_DETAILS = {
  sydney: ['NSW', 'Australia/Sydney', -33.8688, 151.2093],
  melbourne: ['VIC', 'Australia/Melbourne', -37.8136, 144.9631],
  canberra: ['ACT', 'Australia/Sydney', -35.2809, 149.13],
  brisbane: ['QLD', 'Australia/Brisbane', -27.4698, 153.0251],
  adelaide: ['SA', 'Australia/Adelaide', -34.9285, 138.6007],
  hobart: ['TAS', 'Australia/Hobart', -42.8821, 147.3272],
  perth: ['WA', 'Australia/Perth', -31.9523, 115.8613],
  'rest-of-australia': ['', '', null, null],
};
export const BUNDLED_CITY_CATALOGUE = { schemaVersion: 1, cities: CITY_OPTIONS.map((city, order) => ({
  id: city.value, label: city.label, code: CITY_CODES[city.value], enabled: true, order,
  state: BUNDLED_DETAILS[city.value][0], timeZone: BUNDLED_DETAILS[city.value][1],
  latitude: BUNDLED_DETAILS[city.value][2], longitude: BUNDLED_DETAILS[city.value][3], aliases: [], postcodeRanges: [],
})) };
let definitions = BUNDLED_CITY_CATALOGUE.cities;
let revision = 0;
const subscribers = new Set();
export const cityCatalogueRevision = () => revision;
export const subscribeCityCatalogue = listener => { subscribers.add(listener); return () => subscribers.delete(listener); };
export const getCityDefinitions = () => definitions.map(city => ({ ...city }));
export const getCityDefinition = id => definitions.find(city => city.id === id) || null;
export function validateCityCatalogue(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.cities) || !data.cities.length || data.cities.length > 100) return null;
  const ids = new Set(); const result = [];
  for (const row of data.cities) {
    if (!row || typeof row.id !== 'string' || !/^[a-z][a-z0-9-]{1,49}$/.test(row.id) || ids.has(row.id)) return null;
    if (typeof row.label !== 'string' || !row.label.trim() || row.label.length > 100 || /[\r\n]/.test(row.label)) return null;
    if (!/^[A-Z0-9]{2,6}$/.test(row.code || '') || typeof row.enabled !== 'boolean' || !Number.isSafeInteger(row.order) || row.order < 0) return null;
    if (row.id !== 'rest-of-australia') {
      if (!['NSW','VIC','ACT','QLD','SA','TAS','WA','NT'].includes(row.state) || typeof row.timeZone !== 'string' || !row.timeZone.startsWith('Australia/')) return null;
      try { new Intl.DateTimeFormat('en-AU', { timeZone: row.timeZone }).format(new Date()); } catch { return null; }
      if (typeof row.latitude !== 'number' || !Number.isFinite(row.latitude) || row.latitude < -45 || row.latitude > -9 || typeof row.longitude !== 'number' || !Number.isFinite(row.longitude) || row.longitude < 110 || row.longitude > 155) return null;
    } else if (row.state !== '' || row.timeZone !== '' || row.latitude !== null || row.longitude !== null) {
      return null;
    }
    if (!Array.isArray(row.aliases) || row.aliases.length > 200 || row.aliases.some(alias => typeof alias !== 'string' || !/[\p{L}\p{N}]/u.test(alias) || alias.length > 100)) return null;
    if (!Array.isArray(row.postcodeRanges) || row.postcodeRanges.length > 100 || row.postcodeRanges.some(range => !Array.isArray(range) || range.length !== 2 || range.some(number => !Number.isSafeInteger(number) || number < 800 || number > 9999) || range[0] > range[1])) return null;
    ids.add(row.id);
    result.push({ id: row.id, label: row.label.trim(), code: row.code, enabled: row.enabled, order: row.order,
      state: row.state || '', timeZone: row.timeZone || '', latitude: row.latitude ?? null, longitude: row.longitude ?? null,
      aliases: row.aliases.map(alias => alias.trim().toLowerCase()), postcodeRanges: row.postcodeRanges.map(range => [...range]) });
  }
  // Keep historical city IDs resolvable; disable rather than delete them.
  if (BUNDLED_CITY_CATALOGUE.cities.some(city => !ids.has(city.id)) || !result.some(city => city.enabled)) return null;
  const aliases = new Map(); const ranges = [];
  for (const city of result) {
    for (const alias of city.aliases) {
      const key = alias.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (aliases.has(key) && aliases.get(key) !== city.id) return null;
      aliases.set(key, city.id);
    }
    for (const range of city.postcodeRanges) {
      if (ranges.some(other => other.id !== city.id && range[0] <= other.end && range[1] >= other.start)) return null;
      ranges.push({ id: city.id, start: range[0], end: range[1] });
    }
  }
  return { schemaVersion: 1, cities: result.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) };
}
export function installCityCatalogue(data) {
  const validated = validateCityCatalogue(data);
  if (!validated) return false;
  if (definitions.some(city => !validated.cities.some(next => next.id === city.id))) return false;
  if (JSON.stringify(definitions) === JSON.stringify(validated.cities)) return true;
  definitions = validated.cities;
  CITY_OPTIONS.splice(0, CITY_OPTIONS.length, ...definitions.filter(city => city.enabled).map(city => ({ value: city.id, label: city.label })));
  definitions.forEach(city => { CITY_CODES[city.id] = city.code; });
  revision++; subscribers.forEach(listener => listener());
  return true;
}

export function normalizeCity(value) {
  if (!value) return DEFAULT_CITY;
  // Preserve an unknown/disabled ID instead of silently reassigning a member to Sydney.
  return typeof value === 'string' && /^[a-z][a-z0-9-]{1,49}$/.test(value) ? value : '';
}

const CITY_NAME_MATCHES = [
  ['sydney', /\b(sydney|parramatta|auburn|granville|blacktown|campbelltown|liverpool|penrith|bankstown|kemps creek|wetherill park|greenacre|glenmore park|schofields|denham court|north kellyville|kings langley|edmondson park|blair athol|smithfield|annangrove|south granville)\b/i],
  ['melbourne', /\b(melbourne|cranbourne|dandenong|coburg|preston|footscray|reservoir|springvale|noble park|box hill)\b/i],
  ['canberra', /\b(canberra|gungahlin|belconnen|tuggeranong|woden|queanbeyan)\b/i],
  ['brisbane', /\b(brisbane|logan|ipswich|sunnybank|toowong|southport|gold coast)\b/i],
  ['adelaide', /\b(adelaide|prospect|salisbury|glenelg|marion)\b/i],
  ['hobart', /\b(hobart|glenorchy|sandy bay|kingston)\b/i],
  ['perth', /\b(perth|mirrabooka|cannington|morley|malaga|balga|thornlie|fremantle)\b/i],
];

function inRanges(postcode, ranges) {
  return ranges.some(([start, end]) => postcode >= start && postcode <= end);
}

export function classifyMetroArea(address = {}, catalogueCities = definitions) {
  const text = [
    address?.suburb,
    address?.city,
    address?.state,
    address?.fullAddress,
    address?.street,
  ].filter(Boolean).join(' ');
  const explicitPostcode = String(address?.postcode || '').match(/\b\d{4}\b/)?.[0] || '';
  const postcodeText = explicitPostcode || String(address?.fullAddress || '').match(/\b(NSW|VIC|ACT|QLD|SA|TAS|WA|NT)\s+(\d{4})\b/i)?.[2] || '';
  const postcode = Number.parseInt(postcodeText, 10);
  for (const city of catalogueCities) {
    if (Number.isFinite(postcode) && inRanges(postcode, city.postcodeRanges)) return city.id;
  }
  const searchText = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  for (const city of catalogueCities) {
    if (city.aliases.some(alias => searchText.includes(` ${alias.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `))) return city.id;
  }
  if (Number.isFinite(postcode)) {
    if (inRanges(postcode, [[2000, 2234], [2555, 2574], [2740, 2786]])) return 'sydney';
    if (inRanges(postcode, [[3000, 3207], [3335, 3341], [3427, 3430], [3750, 3810], [3910, 3978]])) return 'melbourne';
    if (inRanges(postcode, [[2600, 2620], [2900, 2920]])) return 'canberra';
    if (inRanges(postcode, [[4000, 4207], [4300, 4305], [4500, 4520]])) return 'brisbane';
    if (inRanges(postcode, [[5000, 5199], [5950, 5950]])) return 'adelaide';
    if (inRanges(postcode, [[7000, 7055]])) return 'hobart';
    if (inRanges(postcode, [[6000, 6214]])) return 'perth';
  }
  for (const [city, pattern] of CITY_NAME_MATCHES) {
    if (pattern.test(text)) return city;
  }
  const state = String(address?.state || text).toUpperCase();
  if (/\bWA\b|WESTERN AUSTRALIA/.test(state)) return 'perth';
  if (/\bVIC\b|VICTORIA/.test(state)) return 'melbourne';
  if (/\bACT\b/.test(state)) return 'canberra';
  if (/\bQLD\b|QUEENSLAND/.test(state)) return 'brisbane';
  if (/\bSA\b|SOUTH AUSTRALIA/.test(state)) return 'adelaide';
  if (/\bTAS\b|TASMANIA/.test(state)) return 'hobart';
  if (/\bNSW\b|NEW SOUTH WALES/.test(state)) return 'sydney';
  return 'rest-of-australia';
}

export function getEventMetroArea(event = {}, catalogueCities = definitions) {
  if (event.metroArea) return normalizeCity(event.metroArea);
  const classified = classifyMetroArea(event.address || event, catalogueCities);
  if (classified !== 'rest-of-australia') return classified;
  return classified;
}

export function cityLabel(value) {
  return getCityDefinition(value)?.label || (value ? `Unavailable city (${String(value).slice(0, 50)})` : 'No city selected');
}

export function cityCode(value) {
  return getCityDefinition(value)?.code || '—';
}

// Server callers need an immutable invocation-local view, never the mutable
// installed native catalogue (Cloud Functions handle concurrent invocations).
export function createCityResolver(data = BUNDLED_CITY_CATALOGUE) {
  const validated = validateCityCatalogue(data);
  if (!validated) throw new Error('Invalid city catalogue. No city-based operation was attempted.');
  const cities = validated.cities;
  const definition = value => cities.find(city => city.id === normalizeCity(value));
  return Object.freeze({
    cities, normalizeCity,
    classifyMetroArea: address => classifyMetroArea(address, cities),
    getEventMetroArea: event => getEventMetroArea(event, cities),
    getUserCity: user => normalizeCity(user?.adminCity || user?.defaultCity || DEFAULT_CITY),
    cityLabel: value => definition(value)?.label || `Unavailable city (${String(value || '').slice(0, 50)})`,
    enabled: value => definition(value)?.enabled === true,
  });
}
