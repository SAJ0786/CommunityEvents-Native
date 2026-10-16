import { createDraft } from './prototypeModel';

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
