import { hijriToGregorian } from '../services/hijri';

export const MAX_REGISTRATION_OCCURRENCES = 100;

function civilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid recurrence date.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Choose a valid recurrence date.');
  return date;
}
const format = date => date.toISOString().slice(0, 10);
function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const last = new Date(next);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  next.setUTCDate(Math.min(date.getUTCDate(), last.getUTCDate()));
  return next;
}

// Civil arithmetic is independent of device timezone and DST; schedules are
// resolved separately for each occurrence in the authoritative event city.
export function registrationOccurrencePreview(startDate, rule, overrides = []) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('Choose recurrence settings.');
  const { frequency, repeatEvery, endMode } = rule;
  if (!['gregorian', 'hijri'].includes(rule.calendarType)) throw new Error('Choose the recurrence calendar.');
  if (!['day', 'week', 'month', 'year'].includes(frequency)
      || !Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > 100
      || !['count', 'date'].includes(endMode)) throw new Error('Choose a valid recurrence frequency and end condition.');
  const start = civilDate(startDate);
  const hardEnd = addMonths(start, frequency === 'year' ? 48 : 12);
  const maximum = frequency === 'year' ? 5 : MAX_REGISTRATION_OCCURRENCES;
  const count = endMode === 'count' ? rule.occurrenceCount : maximum + 1;
  if (endMode === 'count' && (!Number.isInteger(count) || count < 2 || count > maximum)) throw new Error(`Choose between 2 and ${maximum} occurrences.`);
  const parts = (value, label) => {
    if (!value || !Number.isInteger(value.day) || value.day < 1 || value.day > 30
        || !Number.isInteger(value.month) || value.month < 1 || value.month > 12
        || !Number.isInteger(value.year) || value.year < 1300 || value.year > 1700) throw new Error(`Choose a valid ${label} Hijri date.`);
    return { day: value.day, month: value.month, year: value.year };
  };
  const lunar = rule.calendarType === 'hijri';
  let hijri = lunar ? parts(rule.startHijri, 'start') : null;
  if (hijri && hijriToGregorian(hijri.day, hijri.month, hijri.year, overrides) !== startDate) throw new Error('The Hijri start date changed. Reload the calendar and preview again.');
  const lunarEnd = lunar && endMode === 'date' ? parts(rule.endHijri, 'end') : null;
  const end = endMode === 'date' ? civilDate(lunarEnd ? hijriToGregorian(lunarEnd.day, lunarEnd.month, lunarEnd.year, overrides) : rule.endDate) : hardEnd;
  if (end < start || end > hardEnd) throw new Error('Recurring events must stay within one year, or four years for yearly recurrence.');
  const dates = [];
  let current = start;
  while (dates.length < count && current <= end) {
    if (dates.length >= maximum) throw new Error(`Use no more than ${maximum} occurrences per series.`);
    dates.push({ date: format(current), ...(hijri ? { enteredAsHijri: true, hijriDay: hijri.day, hijriMonth: hijri.month, hijriYear: hijri.year } : { enteredAsHijri: false, hijriDay: null, hijriMonth: null, hijriYear: null }) });
    if (hijri) {
      let monthIndex = hijri.year * 12 + hijri.month - 1;
      let day = hijri.day;
      if (frequency === 'day' || frequency === 'week') {
        day += repeatEvery * (frequency === 'week' ? 7 : 1);
        while (day > 30) { day -= 30; monthIndex++; }
      } else monthIndex += repeatEvery * (frequency === 'year' ? 12 : 1);
      hijri = { day, month: monthIndex % 12 + 1, year: Math.floor(monthIndex / 12) };
      current = civilDate(hijriToGregorian(hijri.day, hijri.month, hijri.year, overrides));
      if (format(current) <= dates.at(-1).date) throw new Error('These Hijri recurrence dates overlap. Review the calendar settings.');
    } else if (frequency === 'day' || frequency === 'week') {
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + repeatEvery * (frequency === 'week' ? 7 : 1));
    } else current = addMonths(current, repeatEvery * (frequency === 'year' ? 12 : 1));
  }
  if (dates.length < 2 || (endMode === 'count' && dates.length !== count)) throw new Error('Choose at least two occurrences within the recurrence date limit.');
  return dates;
}

export function registrationOccurrenceDates(startDate, rule, overrides = []) {
  return registrationOccurrencePreview(startDate, rule, overrides).map(row => row.date);
}
