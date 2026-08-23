import { DEFAULT_CITY, normalizeCity } from './cities';

export const CITY_PRAYER_LOCATIONS = {
  sydney: { suburb: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, fullAddress: 'Sydney NSW, Australia' },
  melbourne: { suburb: 'Melbourne', state: 'VIC', latitude: -37.8136, longitude: 144.9631, fullAddress: 'Melbourne VIC, Australia' },
  canberra: { suburb: 'Canberra', state: 'ACT', latitude: -35.2809, longitude: 149.13, fullAddress: 'Canberra ACT, Australia' },
  brisbane: { suburb: 'Brisbane', state: 'QLD', latitude: -27.4698, longitude: 153.0251, fullAddress: 'Brisbane QLD, Australia' },
  adelaide: { suburb: 'Adelaide', state: 'SA', latitude: -34.9285, longitude: 138.6007, fullAddress: 'Adelaide SA, Australia' },
  hobart: { suburb: 'Hobart', state: 'TAS', latitude: -42.8821, longitude: 147.3272, fullAddress: 'Hobart TAS, Australia' },
  perth: { suburb: 'Perth', state: 'WA', latitude: -31.9523, longitude: 115.8613, fullAddress: 'Perth WA, Australia' },
  'rest-of-australia': { suburb: 'Sydney', state: 'NSW', latitude: -33.8688, longitude: 151.2093, fullAddress: 'Sydney NSW, Australia' },
};

export function getPrayerLocation(city) {
  const normalized = normalizeCity(city || DEFAULT_CITY);
  return CITY_PRAYER_LOCATIONS[normalized] || CITY_PRAYER_LOCATIONS[DEFAULT_CITY];
}
