// Prototype-only contract. No Firebase, persistence, authentication or capacity authority.
// Keep native and web copies identical; parity is checked before integration.
export const FIELD_TYPES = [
  ['text', 'Short answer'], ['textarea', 'Long answer'], ['email', 'Email'],
  ['phone', 'Phone'], ['number', 'Number'], ['date', 'Date'],
  ['select', 'Dropdown'], ['radio', 'Multiple choice'], ['checkboxes', 'Checkboxes'],
  ['consent', 'Consent'],
];
export const STANDARD_FIELDS = [
  { id: 'name', label: 'Full name', type: 'text', required: true },
  { id: 'email', label: 'Email', type: 'email', required: true },
  { id: 'phone', label: 'Phone', type: 'phone', required: true },
  { id: 'diet', label: 'Dietary requirements', type: 'textarea', required: false },
  { id: 'access', label: 'Accessibility requirements', type: 'textarea', required: false },
  { id: 'guardian', label: 'Parent or guardian name', type: 'text', required: true },
  { id: 'age', label: 'Age', type: 'number', required: false },
  { id: 'consent', label: 'I agree to the event registration terms', type: 'consent', required: true },
];
export const TERMS_LIMIT = 1000;
export const NOTES_LIMIT = 5000;
export const FORM_TEMPLATES = [
  { name: 'Basic registration', ids: ['name', 'email', 'phone'] },
  { name: 'Community meal', ids: ['name', 'email', 'phone', 'diet', 'access'] },
  { name: 'Family activity', ids: ['name', 'email', 'phone', 'guardian', 'age', 'access'] },
];
export function templateFields(template) {
  return STANDARD_FIELDS.filter(field => template.ids.includes(field.id)).map(field => ({ ...field, description: '', options: [] }));
}
export function consentLast(fields) {
  return [...fields.filter(field => field.type !== 'consent'), ...fields.filter(field => field.type === 'consent')];
}
export function resolvedEventType(draft) {
  return draft.eventType === 'Custom' ? draft.customEventType.trim() : draft.eventType;
}
export function closingDateError(draft) {
  if (!draft.closes) return '';
  if (!isCalendarDate(draft.closes.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.closes)) return 'Enter a valid registration closing date and time.';
  if (!isCalendarDate(draft.date)) return 'Choose the event date before setting the registration closing date.';
  return draft.closes.slice(0, 10) >= draft.date ? 'Registration closing date must be before the event date, not the same day.' : '';
}
// Defensive checks, not a general personal-data detector. Hosts must review public text.
const normaliseAddressText = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function containsPrivateAddress(value, address = '') {
  const text = normaliseAddressText(value);
  const fragments = [address, String(address).split(/[,\n]/)[0]].map(normaliseAddressText).filter(part => part.length >= 6);
  if (fragments.some(part => (` ${text} `).includes(` ${part} `))) return true;
  return /\b\d+[a-z]?(?:\s+\d+[a-z]?)?\s+(?:[\p{L}]+\s+){1,6}(?:street|st|road|rd|drive|dr|avenue|ave|lane|ln|court|ct|crescent|cres|place|pl|parade|pde|terrace|tce|way|close|circuit|boulevard|blvd)\b/iu.test(text);
}
export function publicSuburbError(draft) {
  if (!draft.suburb?.trim()) return 'Enter a suburb.';
  return /[\d\r\n,/:]/u.test(draft.suburb) || containsPrivateAddress(draft.suburb, draft.address) ? 'Enter only the public suburb, not a street address.' : '';
}
export function publicNotesError(draft) {
  return containsPrivateAddress(draft.notes, draft.address) ? 'Move the street address out of public notes. Keep it only in Full address — private.' : '';
}
// Allowlisted public projection. Never include private venue, coordinates or poster.
export function publicEvent(draft) {
  const metadata = {};
  for (const key of ['seriesId', 'occurrenceIndex', 'occurrenceCount', 'recurrenceRule']) {
    if (draft[key] !== undefined) metadata[key] = draft[key];
  }
  for (const key of ['hostName', 'organiserType', 'organiserId', 'organiserName', 'organisationType', 'isOnBehalfOf', 'eventSubject', 'audienceType', 'speakerName', 'reciters', 'timeMode', 'prayerName', 'prayerLabel', 'prayerOffsetMinutes', 'prayerTimeZone', 'hijriDate', 'enteredAsHijri', 'hijriDay', 'hijriMonth', 'hijriYear']) {
    if (draft[key] !== undefined) metadata[key] = draft[key];
  }
  return { ...metadata, title: draft.title, eventType: resolvedEventType(draft), date: draft.date, startTime: draft.startTime || '', endTime: draft.endTime || '', startAt: draft.startAt || null, endAt: draft.endAt || null, suburb: publicSuburbError(draft) ? '' : draft.suburb, notes: publicNotesError(draft) ? '' : draft.notes, capacity: Number(draft.capacity), closes: draft.closes };
}
export function createDraft() {
  return { title: 'Community family workshop', eventType: 'Custom', customEventType: 'Workshop', date: '', suburb: '', address: '', notes: '', poster: null,
    startTime: '', endTime: '', capacity: 30, closes: '', allowCancellation: true,
    purpose: 'Your answers will be used by the organiser to arrange this event.',
    fields: STANDARD_FIELDS.filter(f => ['name', 'email', 'phone'].includes(f.id)).map(f => ({ ...f, description: '', options: [] })) };
}
export function makeField(type, id) {
  return { id, type, label: type === 'consent' ? 'I agree to the event registration terms' : 'New question', description: '', terms: '', required: type === 'consent',
    options: ['select', 'radio', 'checkboxes'].includes(type) ? ['Option 1', 'Option 2'] : [] };
}
export function moveField(fields, index, direction) {
  const target = index + direction;
  if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) return fields;
  if (fields[index].type === 'consent' || fields[target].type === 'consent') return fields;
  const next = [...fields];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function validateDraft(draft) {
  const errors = [];
  if (!draft.title.trim()) errors.push('Enter an event title.');
  if (!isCalendarDate(draft.date)) errors.push('Choose a valid event date.');
  if ((draft.startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime)) || (draft.endTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime)) || (draft.endTime && !draft.startTime)) errors.push('Enter a start time and optional end time as HH:mm.');
  if (draft.startTime && draft.endTime === draft.startTime) errors.push('End time must differ from start time.');
  if (!draft.eventType?.trim() || (draft.eventType === 'Custom' && !draft.customEventType?.trim())) errors.push('Select an event type or enter a custom event type.');
  if (!draft.address?.trim() || draft.address.length > 500) errors.push('Enter the full event address (up to 500 characters).');
  if (publicSuburbError(draft)) errors.push(publicSuburbError(draft));
  if (publicNotesError(draft)) errors.push(publicNotesError(draft));
  if ((draft.notes || '').length > NOTES_LIMIT) errors.push(`Detailed notes must not exceed ${NOTES_LIMIT} characters.`);
  if (closingDateError(draft)) errors.push(closingDateError(draft));
  if (!Number.isSafeInteger(Number(draft.capacity)) || Number(draft.capacity) < 1 || Number(draft.capacity) > 10000) errors.push('Capacity must be between 1 and 10,000 places.');
  if (!draft.purpose.trim()) errors.push('Explain why you are collecting these answers.');
  if (!draft.fields.length) errors.push('Add at least one question.');
  if (draft.fields.length > 30) errors.push('Use no more than 30 questions in this prototype.');
  const ids = new Set();
  for (const field of draft.fields) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(field.id) || ['__proto__', 'prototype', 'constructor'].includes(field.id)) errors.push('Question IDs must be safe, stable identifiers.');
    if (ids.has(field.id)) errors.push('Question IDs must be unique.');
    ids.add(field.id);
    if (!field.label.trim() || field.label.length > 200) errors.push('Question labels must contain 1–200 characters.');
    if (!FIELD_TYPES.some(([type]) => type === field.type)) errors.push('Choose a supported question type.');
    if (field.type === 'consent' && (!field.terms?.trim() || field.terms.length > TERMS_LIMIT)) errors.push(`Write the terms registrants must agree to (1–${TERMS_LIMIT} characters).`);
    if (field.type === 'consent' && field.perParticipant) errors.push('Consent applies once to the booking, not separately to each participant.');
    if (field.type === 'consent' && !field.required) errors.push('Agreement must be required when included.');
    if (['select', 'radio', 'checkboxes'].includes(field.type)) {
      const options = field.options.map(o => o.trim());
      if (options.length < 2 || options.length > 20 || options.some(o => !o || o.length > 100) || new Set(options).size !== options.length) errors.push('Choice questions need 2–20 different, non-empty options.');
    }
  }
  if (draft.fields.some((field, index) => field.type === 'consent' && draft.fields.slice(index + 1).some(next => next.type !== 'consent'))) errors.push('Keep agreement fields at the end of the form.');
  if (draft.fields.some(field => field.perParticipant) && !draft.fields.some(field => field.perParticipant && field.required)) errors.push('Make at least one participant question required, such as full name.');
  return [...new Set(errors)];
}
export function validateAnswers(fields, answers, places, capacity) {
  const errors = {};
  if (!Number.isSafeInteger(Number(places)) || Number(places) < 1 || Number(places) > Math.min(MAX_BOOKING_PLACES, Number(capacity))) errors.places = 'Choose 1–5 places within the available capacity.';
  for (const field of registrationFields(fields, places)) {
    const value = Object.prototype.hasOwnProperty.call(answers, field.id) ? answers[field.id] : undefined;
    const empty = value == null || value === false || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
    if (empty) { if (field.required) errors[field.id] = 'This answer is required.'; continue; }
    if (field.type === 'consent' && value !== true) errors[field.id] = 'Select this checkbox to agree.';
    else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors[field.id] = 'Enter a valid email address.';
    else if (field.type === 'phone' && !/^\+?[\d\s()-]{7,20}$/.test(String(value))) errors[field.id] = 'Enter a valid phone number.';
    else if (field.type === 'number' && !Number.isFinite(Number(value))) errors[field.id] = 'Enter a number.';
    else if (field.type === 'date' && !isCalendarDate(value)) errors[field.id] = 'Enter a valid date as YYYY-MM-DD.';
    else if (['select', 'radio'].includes(field.type) && !field.options.includes(value)) errors[field.id] = 'Choose a listed option.';
    else if (field.type === 'checkboxes' && (!Array.isArray(value) || value.some(v => !field.options.includes(v)))) errors[field.id] = 'Choose only listed options.';
    else if (typeof value === 'string' && value.length > 2000) errors[field.id] = 'Use no more than 2,000 characters.';
  }
  return errors;
}
export function snapshotBooking(draft, answers, places) {
  return { id: 'DEMO-001', eventTitle: draft.title, status: 'Demo confirmation', places: Number(places),
    formVersion: 1, submittedAt: new Date().toISOString(),
    fields: JSON.parse(JSON.stringify(draft.fields)), answers: JSON.parse(JSON.stringify(answers)) };
}
function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}


export const MAX_BOOKING_PLACES = 5;
// Colon namespaces cannot collide with organiser question IDs (letters/digits/_/- only).
export function registrationFields(fields, places) {
  const count = Math.max(0, Math.min(MAX_BOOKING_PLACES, Number.isSafeInteger(Number(places)) ? Number(places) : 0));
  const booking = fields.filter(field => !field.perParticipant && field.type !== 'consent');
  const repeat = fields.filter(field => field.perParticipant);
  const consent = fields.filter(field => field.type === 'consent' && !field.perParticipant);
  return [...booking, ...Array.from({length:count}, (_, index) => repeat.map(field => ({ ...field,
    id: `participant:${index + 1}:${field.id}`, sourceId:field.id, participantIndex:index + 1,
    originalLabel:field.label, label:`Participant ${index + 1} — ${field.label}` }))).flat(), ...consent];
}
export function registrationFieldGroups(fields, places) {
  const expanded = registrationFields(fields, places);
  const groups = [{id:'booking',label:'Booking details',fields:expanded.filter(field => !field.participantIndex && field.type !== 'consent')}];
  for (let index=1; index<=MAX_BOOKING_PLACES; index++) groups.push({id:`participant-${index}`,label:`Participant ${index}`,fields:expanded.filter(field => field.participantIndex === index)});
  groups.push({id:'consent',label:'Agreement',fields:expanded.filter(field => field.type === 'consent')});
  return groups.filter(group => group.fields.length);
}
