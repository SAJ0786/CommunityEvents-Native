import { createDraft } from './prototypeModel';

export function eventDraftFromDetail(detail, eventTypes) {
  if (!detail?.canManage || !detail.privateDetails || !detail.form) throw new Error('Reload an event you can manage before editing.');
  const event = detail.event;
  const knownType = eventTypes.includes(event.eventType);
  return { ...createDraft(), title: event.title, eventType: knownType ? event.eventType : 'Custom',
    customEventType: knownType ? '' : event.eventType, date: event.date, suburb: event.suburb,
    startTime: event.startTime || '', endTime: event.endTime || '',
    address: detail.privateDetails.address, venue: detail.privateDetails.venue, notes: event.notes || '',
    capacity: event.capacity, closes: event.closes || '', allowCancellation: event.allowCancellation,
    purpose: detail.form.purpose, fields: JSON.parse(JSON.stringify(detail.form.fields)), poster: null };
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
