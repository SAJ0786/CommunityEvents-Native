// Shared transport contract. Callers must explicitly enable the reviewed feature.
// Keep retries on the same submission object; never generate a new request ID on retry.
export function createRegistrationClient(call, { enabled = false } = {}) {
  async function invoke(name, data) {
    if (!enabled) throw new Error('Event registration is not enabled for this release.');
    const response = await call(name, data);
    return response.data;
  }
  return Object.freeze({
    list: ({ scope = 'public', city, cursor = null } = {}) => invoke('listRegistrationEvents', { scope, ...(city ? { city } : {}), cursor }),
    load: eventId => invoke('getRegistrationEvent', { eventId }),
    save: ({ eventId, city, expectedRevision, createKey, draft }) => {
      const { poster, ...details } = draft;
      return invoke('saveRegistrationEvent', { ...(eventId ? { eventId, expectedRevision } : { createKey }), city, draft: details });
    },
    approve: (eventId, expectedRevision) => invoke('approveRegistrationEvent', { eventId, expectedRevision }),
    submit: submission => invoke('submitEventRegistration', submission),
    cancel: (eventId, expectedRevision) => invoke('cancelEventRegistration', { eventId, expectedRevision }),
    cancelEvent: (eventId, expectedRevision, confirmation) => invoke('cancelRegistrationEvent', { eventId, expectedRevision, confirmation }),
    deleteEvent: (eventId, expectedRevision) => invoke('deleteRegistrationEvent', { eventId, expectedRevision, confirmation: 'DELETE EVENT' }),
    responses: (eventId, cursor = null) => invoke('listEventRegistrations', { eventId, cursor }),
    deleteAnswers: (eventId, registrationId, expectedRevision, confirmation) => invoke('deleteRegistrationAnswers', { eventId, registrationId, expectedRevision, confirmation }),
    poster: eventId => invoke('getRegistrationPoster', { eventId }),
    uploadPoster: (eventId, expectedRevision, mime, base64) => invoke('putRegistrationPoster', { eventId, expectedRevision, mime, base64 }),
    removePoster: (eventId, expectedRevision) => invoke('removeRegistrationPoster', { eventId, expectedRevision }),
    saveTemplate: template => invoke('saveRegistrationTemplate', template),
    templates: (cursor = null) => invoke('listRegistrationTemplates', { cursor }),
  });
}

export function createSubmission(eventId, formVersion, previousRegistration, answers, places, requestId) {
  if (!requestId || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new Error('A stable submission reference is required.');
  return { eventId, formVersion, expectedRevision: previousRegistration?.revision || 0, answers: JSON.parse(JSON.stringify(answers)), places: Number(places), requestId };
}

// CSV is generated only from responses already authorised by the server.
// Neutralise spreadsheet formula injection, including leading whitespace/control characters.
export function registrationsCsv(registrations) {
  const quote = value => {
    let text = String(value ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [['Registration', 'Status', 'Places', 'Form version', 'Submitted at', 'Question', 'Answer']];
  for (const registration of registrations) for (const field of registration.fields || []) {
    const answer = registration.answers[field.id];
    rows.push([registration.registrationId, registration.status, registration.places, registration.formVersion, registration.submittedAt, field.label, Array.isArray(answer) ? answer.join('; ') : answer === true ? 'Agreed' : answer ?? '']);
  }
  return rows.map(row => row.map(quote).join(',')).join('\r\n');
}
