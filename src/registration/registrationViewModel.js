import { createDraft, validateDraft } from './prototypeModel';

const EVENT_METADATA = ['hostName', 'organiserType', 'organiserId', 'organiserName', 'organisationType', 'isOnBehalfOf', 'eventSubject', 'audienceType', 'speakerName', 'reciters', 'timeMode', 'prayerName', 'prayerLabel', 'prayerOffsetMinutes', 'prayerTimeZone', 'hijriDate', 'enteredAsHijri', 'hijriDay', 'hijriMonth', 'hijriYear'];
const eventMetadata = source => Object.fromEntries(EVENT_METADATA.filter(key => source[key] !== undefined).map(key => [key, source[key]]));

// Only editors/reviewers opt into staging. Attendee entry always consumes top-level detail.
export function registrationManagementView(detail) {
  if (!detail?.canManage) throw new Error('Reload an event you can manage before editing.');
  return detail.pendingChanges || detail;
}

export function eventDraftFromDetail(detail, eventTypes) {
  const selected = registrationManagementView(detail);
  if (!selected.privateDetails || !selected.form) throw new Error('Reload an event you can manage before editing.');
  const event = selected.event;
  const knownType = eventTypes.includes(event.eventType);
  return { ...createDraft(), ...eventMetadata(event), title: event.title, eventType: knownType ? event.eventType : 'Custom',
    customEventType: knownType ? '' : event.eventType, date: event.date, suburb: event.suburb,
    startTime: event.startTime || '', endTime: event.endTime || '',
    address: selected.privateDetails.address, venue: selected.privateDetails.venue, notes: event.notes || '',
    hostPhone: selected.privateDetails.hostPhone || '', hostContactOptional: selected.privateDetails.hostContactOptional || '',
    capacity: event.capacity, closes: event.closes || '', allowCancellation: event.allowCancellation,
    purpose: selected.form.purpose, fields: JSON.parse(JSON.stringify(selected.form.fields)), poster: null };
}

export function normalEventFromRegistrationDraft(draft, eventId) {
  return { ...eventMetadata(draft), ...(eventId ? { id: eventId } : {}), eventType: draft.eventType, customEventType: draft.customEventType,
    eventDate: draft.date, startTime: draft.startTime || '', endTime: draft.endTime || '',
    hostPhone: draft.hostPhone || '', hostContactOptional: draft.hostContactOptional || '',
    notes: draft.notes || '', address: draft.venue || { fullAddress: draft.address || '', suburb: draft.suburb || '' } };
}

export function registrationDraftFromNormalEvent(draft, event) {
  return { ...draft, ...eventMetadata(event), eventType: event.eventType, customEventType: event.customEventType || '',
    date: event.eventDate, startTime: event.startTime || '', endTime: event.endTime || '',
    hostPhone: event.hostPhone || '', hostContactOptional: event.hostContactOptional || '',
    venue: { ...event.address }, address: event.address.fullAddress, suburb: event.address.suburb,
    notes: event.notes || '' };
}

export function registrationPrayerStart(draft, date, prayer, cityDefinition) {
  if (draft.timeMode !== 'prayer') return draft.startTime || '';
  const venue = draft.venue;
  if (!venue || !['NSW', 'ACT', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT'].includes(venue.state)
      || !draft.prayerName || !Number.isFinite(Number(draft.prayerOffsetMinutes || 0))) throw Error(`Cannot resolve prayer time for ${date}. Select a complete venue and prayer.`);
  const times = prayer.calculatePrayerTimes(date, venue);
  if (!times?.timeZone || !times[draft.prayerName] || (cityDefinition?.timeZone && times.timeZone !== cityDefinition.timeZone)
      || (!cityDefinition?.timeZone && !draft.prayerTimeZone) || (draft.prayerTimeZone && times.timeZone !== draft.prayerTimeZone)) throw Error(`Cannot reliably resolve prayer time in the event city for ${date}. Review the venue and timezone.`);
  const start = prayer.applyPrayerOffset(times[draft.prayerName], draft.prayerOffsetMinutes || 0);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)) throw Error(`Cannot resolve prayer time for ${date}.`);
  return start;
}

export function registrationOccurrenceDefaults(draft, dates, prayer, cityDefinition) {
  const lead = draft.closes ? (Date.parse(`${draft.date}T12:00:00Z`) - Date.parse(`${draft.closes.slice(0, 10)}T12:00:00Z`)) / 86400000 : null;
  return dates.map(row => ({ ...row, capacity: Number(draft.capacity), startTime: registrationPrayerStart(draft, row.date, prayer, cityDefinition), endTime: draft.endTime || '',
    closes: lead === null ? '' : `${new Date(Date.parse(`${row.date}T12:00:00Z`) - lead * 86400000).toISOString().slice(0, 10)}T${draft.closes.slice(11)}` }));
}

export function validateRegistrationOccurrences(draft, rows, prayer, cityDefinition) {
  if (!Array.isArray(rows) || rows.length < 2) throw Error('Preview at least two occurrences before saving.');
  rows.forEach((row, index) => {
    const errors = validateDraft({ ...draft, ...row });
    if (errors.length) throw Error(`Occurrence ${index + 1} (${row.date}): ${errors.join(' ')}`);
    if (draft.timeMode === 'prayer' && row.startTime !== registrationPrayerStart(draft, row.date, prayer, cityDefinition)) throw Error(`Prayer time changed for ${row.date}. Regenerate the occurrence preview.`);
  });
}

// Preserve compatible saved answers, never auto-agree to old or changed terms.
export function answersForReview(detail) {
  const previous = detail.ownRegistration;
  const answers = {};
  for (const field of detail.form?.fields || []) {
    const oldField = previous?.fields?.find(item => item.id === field.id);
    if (field.type === 'consent') { answers[field.id] = false; continue; }
    if (!oldField || oldField.type !== field.type || oldField.label !== field.label) continue;
    const answer = previous.answers?.[field.id];
    if (answer !== undefined) Object.defineProperty(answers, field.id, { value: JSON.parse(JSON.stringify(answer)), enumerable: true, writable: true, configurable: true });
  }
  return answers;
}

export function mergeRegistrationPage(previous, incoming) {
  return [...new Map([...previous, ...incoming].map(row => [row.id || row.registrationId, row])).values()];
}
