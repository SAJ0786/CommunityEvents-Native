import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';

export function isGooglePlacesConfigured() {
  return true;
}

export function createPlacesSessionToken() {
  // Places API (New) accepts session tokens up to 36 characters. A UUID keeps
  // autocomplete and place-details requests in one billable session.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

export async function autocompleteAustralianAddresses(input, sessionToken) {
  const query = String(input || '').trim();
  if (query.length < 3) return [];
  const result = await httpsCallable(functions, 'autocompleteAustralianAddresses')({
    input: query,
    sessionToken: String(sessionToken || ''),
  });
  return Array.isArray(result.data?.suggestions) ? result.data.suggestions : [];
}

export async function getAustralianAddressDetails(placeId, sessionToken) {
  if (!placeId) throw new Error('Select an address from the suggestions.');
  const result = await httpsCallable(functions, 'getAustralianAddressDetails')({
    placeId: String(placeId),
    sessionToken: String(sessionToken || ''),
  });
  if (!result.data?.address) throw new Error('The selected address could not be loaded.');
  return result.data.address;
}
