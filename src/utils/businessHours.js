// Day-by-day hours. Legacy { closed, open, close } rows remain valid unchanged.
// Optional periods/open24Hours fields are added only when a day is edited.
export const BUSINESS_DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];
const clean = value => String(value ?? '').trim();
const timeMinutes = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(value))
  ? Number(clean(value).slice(0, 2)) * 60 + Number(clean(value).slice(3)) : null;

export function dayPeriods(row = {}) {
  row = row || {};
  if (Array.isArray(row.periods)) return row.periods.map(period => ({ open: clean(period?.open), close: clean(period?.close) }));
  return row.open || row.close ? [{ open: clean(row.open), close: clean(row.close) }] : [];
}

export function editableHoursDay(row = {}) {
  row = row || {};
  const periods = dayPeriods(row);
  return { closed: Boolean(row.closed), open24Hours: row.open24Hours === true,
    periods: periods.length ? periods : [{ open: '09:00', close: '17:00' }] };
}

export function cleanBusinessHours(hours = {}) {
  return Object.fromEntries(Object.entries(hours || {}).map(([day, row]) => {
    const value = { closed: Boolean(row?.closed), open: clean(row?.open), close: clean(row?.close) };
    if (Array.isArray(row?.periods)) {
      value.periods = dayPeriods(row);
      value.open = value.periods[0]?.open || '';
      value.close = value.periods[0]?.close || '';
    }
    if (typeof row?.open24Hours === 'boolean') value.open24Hours = row.open24Hours;
    if (value.open24Hours && !value.closed) { value.open = '00:00'; value.close = '23:59'; }
    return [day, value];
  }));
}

export function applyHoursToDays(hours, days, schedule) {
  const next = { ...hours };
  for (const [day] of BUSINESS_DAYS) {
    if (days.includes(day)) next[day] = cleanBusinessHours({ [day]: schedule })[day];
  }
  return next;
}

function twelveHour(value) {
  const minutes = timeMinutes(value);
  if (minutes === null) return clean(value);
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatBusinessDay(row) {
  if (!row) return 'Hours not supplied';
  if (row.closed) return 'Closed';
  if (row.open24Hours === true) return 'Open 24 Hours';
  // Keep the existing display for untouched legacy records exactly as before.
  if (!Array.isArray(row.periods)) return [row.open, row.close].filter(Boolean).join(' – ') || 'Hours not supplied';
  if (!row.periods.length) return 'Hours not supplied';
  return dayPeriods(row).map(period => {
    const overnight = timeMinutes(period.open) !== null && timeMinutes(period.close) !== null
      && timeMinutes(period.close) < timeMinutes(period.open);
    return `${twelveHour(period.open) || 'Select time'} – ${twelveHour(period.close) || 'Select time'}${overnight ? ' (next day)' : ''}`;
  }).join('\n');
}

export function validateBusinessHours(hours = {}) {
  const segments = [];
  for (const [index, [day, label]] of BUSINESS_DAYS.entries()) {
    const row = hours?.[day];
    if (!row || row.closed) continue;
    const enhanced = Array.isArray(row.periods) || typeof row.open24Hours === 'boolean';
    const periods = row.open24Hours === true ? [{ open: '00:00', close: '00:00' }] : dayPeriods(row);
    if (enhanced && !periods.length) return `${label}: add an opening period, choose Closed or Open 24 Hours.`;
    for (const period of periods) {
      const start = timeMinutes(period.open), end = timeMinutes(period.close);
      if (start === null || end === null) {
        if (enhanced) return `${label}: select both opening and closing times.`;
        continue; // Do not reject or rewrite historical free-text/unspecified hours.
      }
      if (start === end && !row.open24Hours) {
        if (enhanced) return `${label}: opening and closing times must differ. For a full day, choose Open 24 Hours.`;
        continue;
      }
      segments.push({ start: index * 1440 + start, end: index * 1440 + end + (end <= start ? 1440 : 0), enhanced, label });
    }
  }
  // Include the weekly wrap so Sunday overnight cannot overlap Monday morning.
  for (let a = 0; a < segments.length; a++) {
    for (let b = a + 1; b < segments.length; b++) {
      const first = segments[a], second = segments[b];
      if (!first.enhanced && !second.enhanced) continue;
      for (const shift of [-10080, 0, 10080]) {
        if (Math.max(first.start, second.start + shift) < Math.min(first.end, second.end + shift)) {
          return `${first.label}${first.label === second.label ? '' : ` / ${second.label}`}: opening periods overlap. Adjust or remove the overlapping period.`;
        }
      }
    }
  }
  return '';
}

export function businessOpenState(hours = {}, now = new Date()) {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = hours?.[keys[now.getDay()]];
  const yesterday = hours?.[keys[(now.getDay() + 6) % 7]];
  const minute = now.getHours() * 60 + now.getMinutes();
  // An overnight period belongs to its starting day, including after midnight.
  if (yesterday && !yesterday.closed && !yesterday.open24Hours && dayPeriods(yesterday).some(period => {
    const start = timeMinutes(period.open), end = timeMinutes(period.close);
    return start !== null && end !== null && end < start && minute < end;
  })) return true;
  if (!today) return null;
  if (today.closed) return false;
  if (today.open24Hours === true) return true;
  const periods = dayPeriods(today).filter(period => timeMinutes(period.open) !== null && timeMinutes(period.close) !== null);
  if (!periods.length) return null;
  return periods.some(period => {
    const start = timeMinutes(period.open), end = timeMinutes(period.close);
    return end < start ? minute >= start : minute >= start && minute < end;
  });
}
