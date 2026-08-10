import { httpsCallable } from 'firebase/functions';
import { ensureFirebaseSession, functions } from '../firebase/firebase';
import { getEventMetroArea } from '../utils/cities';

function toComparableTime(time = '') {
  const value = String(time || '').trim();
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '99:99';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function compareEventsByDateTime(a, b) {
  const dateA = String(a?.eventDate || '9999-99-99');
  const dateB = String(b?.eventDate || '9999-99-99');
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return toComparableTime(a?.startTime).localeCompare(toComparableTime(b?.startTime));
}

export async function getPublicEvents() {
  await ensureFirebaseSession();
  const fn = httpsCallable(functions, 'getPublicEvents');
  const result = await fn();
  return Array.isArray(result.data?.events) ? result.data.events : [];
}

export function filterEventsByCity(events, city) {
  if (!city) return events;
  return events.filter(event => getEventMetroArea(event) === city);
}

export function prepareHomeEvents(events, city) {
  return filterEventsByCity(events, city)
    .filter(event => event?.status !== 'inactive' && !event?.hidden)
    .sort(compareEventsByDateTime);
}

export function getEventTitle(event = {}) {
  const type = event.eventType || event.type || 'Event';
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const subject = event.subject || event.eventName || '';
  return [type, host, subject].filter(Boolean).join(' - ') || 'Community Event';
}

export function getEventSuburb(event = {}) {
  if (event.suburb) return event.suburb;
  const address = event.address || {};
  if (typeof address === 'string') return address.split(',')[0]?.trim() || '';
  return address.suburb || address.city || '';
}

export function getEventPoster(event = {}) {
  return event.posterUrl || event.imageUrl || event.poster || event.organisationLogo || event.orgLogo || null;
}
