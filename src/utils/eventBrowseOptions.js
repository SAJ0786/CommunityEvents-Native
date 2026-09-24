import { CITY_OPTIONS, getEventMetroArea } from './cities';

export const EVENT_BROWSE_PRESETS = [
  { label: 'Upcoming', field: '', value: '' },
  { label: 'Near Me', field: 'nearby', value: 'nearby' },
  { label: 'Today', field: 'period', value: 'today' },
  { label: 'Tomorrow', field: 'period', value: 'tomorrow' },
  { label: 'This Week', field: 'period', value: 'week' },
  { label: 'This Month', field: 'period', value: 'month' },
  { label: 'Prayers', field: 'eventType', value: 'Prayers' },
  { label: 'Majlis', field: 'eventType', value: 'Majlis' },
  { label: 'Milad', field: 'eventType', value: 'Milad' },
];

function dateString(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function matchesEventPeriod(event, period, now = new Date()) {
  if (!period) return true;
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  if (period === 'tomorrow') start.setDate(start.getDate() + 1);
  const end = new Date(start);
  if (period === 'week') end.setDate(end.getDate() + (7 - end.getDay()) % 7);
  if (period === 'month') end.setMonth(end.getMonth() + 1, 0);
  // A live event must also match the selected date range; no hidden map override.
  return Boolean(event.eventDate && event.eventDate >= dateString(start) && event.eventDate <= dateString(end));
}

export function canArrangeEventNiaz(event, user, profile, isGuest = false) {
  if (isGuest || !user?.uid || user.isAnonymous || !event?.id) return false;
  // Prefer the current owner field after an ownership transfer.
  const ownerUid = event.createdByUserId || event.ownerUid || event.createdBy;
  if (ownerUid === user.uid) return true;
  if (profile?.role === 'superAdmin') return true;
  if (profile?.role !== 'admin') return false;
  const adminCity = profile.adminCity || profile.defaultCity;
  return CITY_OPTIONS.some(city => city.value === adminCity) && getEventMetroArea(event) === adminCity;
}
