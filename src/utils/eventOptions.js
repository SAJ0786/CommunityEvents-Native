export const EVENT_TYPES = [
  'Majlis',
  'Milad',
  'Prayers',
  'Dua',
  'Prayers & Amal',
  'Birthday',
  'Informal get together',
  'Custom',
];

export const EVENT_TYPE_GROUPS = [
  {
    key: 'faith',
    label: 'Faith & Worship',
    icon: '\u{1F54C}',
    eventTypes: ['Majlis', 'Milad', 'Prayers', 'Dua', 'Prayers & Amal'],
  },
  {
    key: 'community',
    label: 'Community & Social',
    icon: '\u{1F389}',
    eventTypes: ['Birthday', 'Informal get together'],
  },
  {
    key: 'other',
    label: 'Other',
    icon: '\u2728',
    eventTypes: ['Custom'],
  },
];

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
  'Majlis',
  'Milad',
  'Prayers',
  'Dua',
  'Prayers & Amal',
  'Custom',
]);

export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'ACT', 'QLD', 'SA', 'TAS', 'WA', 'NT'];
