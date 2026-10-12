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
export function createDraft() {
  return { title: 'Community family workshop', eventType: 'Workshop', date: '', suburb: 'Parramatta',
    capacity: 30, closes: '', allowCancellation: true,
    purpose: 'Your answers will be used by the organiser to arrange this event.',
    fields: STANDARD_FIELDS.filter(f => ['name', 'email', 'phone'].includes(f.id)).map(f => ({ ...f, description: '', options: [] })) };
}
export function makeField(type, id) {
  return { id, type, label: 'New question', description: '', required: false,
    options: ['select', 'radio', 'checkboxes'].includes(type) ? ['Option 1', 'Option 2'] : [] };
}
export function moveField(fields, index, direction) {
  const target = index + direction;
  if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) return fields;
  const next = [...fields];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function validateDraft(draft) {
  const errors = [];
  if (!draft.title.trim()) errors.push('Enter an event title.');
  if (!isCalendarDate(draft.date)) errors.push('Choose a valid event date.');
  if (!draft.suburb.trim()) errors.push('Enter a suburb.');
  if (!Number.isSafeInteger(Number(draft.capacity)) || Number(draft.capacity) < 1 || Number(draft.capacity) > 10000) errors.push('Capacity must be between 1 and 10,000 places.');
  if (!draft.purpose.trim()) errors.push('Explain why you are collecting these answers.');
  if (!draft.fields.length) errors.push('Add at least one question.');
  if (draft.fields.length > 30) errors.push('Use no more than 30 questions in this prototype.');
  const ids = new Set();
  for (const field of draft.fields) {
    if (ids.has(field.id)) errors.push('Question IDs must be unique.');
    ids.add(field.id);
    if (!field.label.trim() || field.label.length > 200) errors.push('Question labels must contain 1–200 characters.');
    if (!FIELD_TYPES.some(([type]) => type === field.type)) errors.push('Choose a supported question type.');
    if (['select', 'radio', 'checkboxes'].includes(field.type)) {
      const options = field.options.map(o => o.trim());
      if (options.length < 2 || options.length > 20 || options.some(o => !o || o.length > 100) || new Set(options).size !== options.length) errors.push('Choice questions need 2–20 different, non-empty options.');
    }
  }
  return [...new Set(errors)];
}
export function validateAnswers(fields, answers, places, capacity) {
  const errors = {};
  if (!Number.isSafeInteger(Number(places)) || Number(places) < 1 || Number(places) > Number(capacity)) errors.places = 'Choose a whole number of places within capacity.';
  for (const field of fields) {
    const value = answers[field.id];
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
