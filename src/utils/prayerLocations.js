import { DEFAULT_CITY, normalizeCity, getCityDefinition } from './cities';

export function getPrayerLocation(city) {
  const normalized = normalizeCity(city || DEFAULT_CITY);
  const definition = getCityDefinition(normalized);
  if (!definition || definition.latitude == null || definition.longitude == null) return {};
  return { suburb: definition.label.replace(', Australia', ''), state: definition.state, timeZone: definition.timeZone,
    latitude: definition.latitude, longitude: definition.longitude, fullAddress: `${definition.label} ${definition.state}` };
}
