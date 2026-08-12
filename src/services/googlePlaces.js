import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PLACES_API_KEY = Constants.expoConfig?.extra?.googlePlacesApiKey || '';
const ANDROID_PACKAGE = 'info.siza.communityevents.app';
// EAS Android application-signing certificate. Keep this aligned with the
// Android application restriction on the Google Maps/Places API key.
const ANDROID_CERT_SHA1 = 'BD5CF4E7FB8E03AD94BC186FB3049D40132FD041';
const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

function requestHeaders(fieldMask = '') {
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': PLACES_API_KEY,
  };
  if (fieldMask) headers['X-Goog-FieldMask'] = fieldMask;
  if (Platform.OS === 'android') {
    headers['X-Android-Package'] = ANDROID_PACKAGE;
    headers['X-Android-Cert'] = ANDROID_CERT_SHA1;
  }
  return headers;
}

async function readGoogleResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Google address search failed (${response.status}).`);
  }
  return payload;
}

function componentValue(components, type, short = false) {
  const component = components.find(item => Array.isArray(item.types) && item.types.includes(type));
  return short ? component?.shortText || '' : component?.longText || '';
}

export function isGooglePlacesConfigured() {
  return Boolean(PLACES_API_KEY);
}

export function createPlacesSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export async function autocompleteAustralianAddresses(input, sessionToken) {
  const query = String(input || '').trim();
  if (query.length < 3) return [];
  if (!PLACES_API_KEY) throw new Error('Google address search is not configured.');

  const response = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: requestHeaders(),
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ['au'],
      regionCode: 'au',
      languageCode: 'en-AU',
      sessionToken,
    }),
  });
  const payload = await readGoogleResponse(response);
  return (payload.suggestions || [])
    .map(item => item.placePrediction)
    .filter(Boolean)
    .map(prediction => ({
      placeId: prediction.placeId,
      fullText: prediction.text?.text || '',
      primaryText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || '',
      secondaryText: prediction.structuredFormat?.secondaryText?.text || '',
    }))
    .filter(item => item.placeId && item.fullText);
}

export async function getAustralianAddressDetails(placeId, sessionToken) {
  if (!placeId) throw new Error('Select an address from the suggestions.');
  if (!PLACES_API_KEY) throw new Error('Google address search is not configured.');

  const params = new URLSearchParams({
    languageCode: 'en-AU',
    regionCode: 'au',
  });
  if (sessionToken) params.set('sessionToken', sessionToken);
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`, {
    headers: requestHeaders('id,formattedAddress,addressComponents,location'),
  });
  const place = await readGoogleResponse(response);
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const streetNumber = componentValue(components, 'street_number');
  const route = componentValue(components, 'route');
  const suburb = componentValue(components, 'locality')
    || componentValue(components, 'postal_town')
    || componentValue(components, 'administrative_area_level_2');
  const state = componentValue(components, 'administrative_area_level_1', true);
  const postcode = componentValue(components, 'postal_code');
  const country = componentValue(components, 'country', true);
  if (country && country !== 'AU') throw new Error('Please select an Australian address.');

  return {
    placeId: place.id || placeId,
    fullAddress: place.formattedAddress || '',
    street: [streetNumber, route].filter(Boolean).join(' '),
    suburb,
    state,
    postcode,
    latitude: Number(place.location?.latitude),
    longitude: Number(place.location?.longitude),
  };
}
