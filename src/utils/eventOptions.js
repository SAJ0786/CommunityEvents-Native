export const EVENT_TYPE_GROUPS = [
  {
    key: 'faith', label: 'Faith & Worship', icon: '\u{1F54C}',
    eventTypes: ['Majlis', 'Milad', 'Prayers', 'Friday Prayers', 'Dua', 'Prayers & Amal', 'Dua-e-Kumail', 'Dua-e-Tawassul', 'Dua-e-Nutba'],
  },
  {
    key: 'community', label: 'Community & Social', icon: '\u{1F389}',
    eventTypes: ['Birthday', 'Marriage', 'Informal get together'],
  },
  { key: 'other', label: 'Other', icon: '\u2728', eventTypes: ['Custom'] },
];

export const EVENT_TYPES = EVENT_TYPE_GROUPS.flatMap(group => group.eventTypes);

export function getEventTypeCategory(label, categories = {}) {
  const builtIn = EVENT_TYPE_GROUPS.find(group => group.eventTypes.includes(label));
  if (builtIn) return builtIn.key;
  return EVENT_TYPE_GROUPS.some(group => group.key === categories[label]) ? categories[label] : 'other';
}

export function buildEventTypeGroups(dynamicOptions = [], categories = {}) {
  return EVENT_TYPE_GROUPS.map(group => ({
    ...group,
    eventTypes: [...new Set([
      ...group.eventTypes,
      ...dynamicOptions.filter(label => getEventTypeCategory(label, categories) === group.key),
    ])],
  }));
}

export const AUDIENCE_TYPES = [
  'Gents only',
  'Ladies only',
  'Kids only',
  'Family Event',
];

export const RECITER_TYPES = [
  'Reciter',
  'Zakir',
  'Peshkhani',
  'Soz',
  'Salam',
  'Manqebat',
  'Noha',
  'Marsiya',
  'Hadees-e-Kisa',
  'Custom',
];

export const ORGANISER_OPTIONS = [
  { value: 'private', label: 'Private (individual host)', name: '', organisationType: 'private' },
  { value: 'muhammadi', label: 'Muhammadi Welfare Association', name: 'Muhammadi Welfare Association', organisationType: 'centre' },
  { value: 'imamhasan', label: 'Imam Hasan Centre', name: 'Imam Hasan Centre', organisationType: 'centre' },
  { value: 'alamdar', label: 'Alamdar Granville', name: 'Alamdar Granville', organisationType: 'centre' },
  { value: 'centre', label: 'Other Centre / Organisation', name: '', organisationType: 'centre' },
];

export const RELIGIOUS_EVENT_TYPES = new Set([
  ...EVENT_TYPE_GROUPS.find(group => group.key === 'faith').eventTypes,
  'Custom',
]);

export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'ACT', 'QLD', 'SA', 'TAS', 'WA', 'NT'];
