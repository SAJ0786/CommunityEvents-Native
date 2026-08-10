export function formatEventDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatEventTime(startTime, endTime) {
  const start = String(startTime || '').trim();
  const end = String(endTime || '').trim();
  if (!start) return 'Time TBC';
  return end ? `${start} - ${end}` : start;
}
