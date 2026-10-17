export function responseAnswer(value) {
  return Array.isArray(value) ? value.join(', ') : value === true ? 'Agreed' : value === false ? 'No' : String(value ?? '');
}
export function responseName(row) {
  const fields = row.fields || [];
  const field = fields.find(field => /^(full name|name of participant|participant name|attendee name|your name|name)$/i.test(field.label.trim()))
    || fields.find(field => field.type === 'text' && /name/i.test(field.label));
  return String(row.answers?.[field?.id] || '').trim() || (row.answersDeletedAt ? 'Answers deleted' : 'Unnamed participant');
}
