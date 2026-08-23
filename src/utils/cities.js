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

const VALID_CITIES = new Set(CITY_OPTIONS.map(city => city.value));

export function normalizeCity(value) {
  return VALID_CITIES.has(value) ? value : DEFAULT_CITY;
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

export function classifyMetroArea(address = {}) {
  const text = [
    address?.suburb,
    address?.city,
    address?.state,
    address?.fullAddress,
    address?.street,
  ].filter(Boolean).join(' ');
  const explicitPostcode = String(address?.postcode || '').match(/\b\d{4}\b/)?.[0] || '';
  const postcodeText = explicitPostcode || String(address?.fullAddress || '').match(/\b(NSW|VIC|ACT|QLD|SA|TAS|WA)\s+(\d{4})\b/i)?.[2] || '';
  const postcode = Number.parseInt(postcodeText, 10);
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

export function getEventMetroArea(event = {}) {
  if (VALID_CITIES.has(event.metroArea)) return event.metroArea;
  const classified = classifyMetroArea(event.address || event);
  if (classified !== 'rest-of-australia') return classified;
  return classified;
}

export function cityLabel(value) {
  return CITY_OPTIONS.find(city => city.value === value)?.label
    || CITY_OPTIONS.find(city => city.value === DEFAULT_CITY)?.label
    || 'Sydney, Australia';
}

export function cityCode(value) {
  return CITY_CODES[normalizeCity(value)] || CITY_CODES[DEFAULT_CITY];
}
