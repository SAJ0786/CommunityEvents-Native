import { getHijriDisplay, hijriDisplayFromParts, hijriToGregorian } from './hijri';

export const RECURRENCE_FREQUENCIES = ['day', 'week', 'month', 'year'];

export function formatLocalDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  const result = new Date(year, month - 1, day);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonthsClamped(date, months) {
  const originalDay = date.getDate();
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, maxDay));
  return next;
}

export function addYearsClamped(date, years) {
  return addMonthsClamped(date, years * 12);
}

function addGregorianStep(date, frequency, repeatEvery) {
  if (frequency === 'day') return addDays(date, repeatEvery);
  if (frequency === 'week') return addDays(date, repeatEvery * 7);
  if (frequency === 'month') return addMonthsClamped(date, repeatEvery);
  return addYearsClamped(date, repeatEvery);
}

function normaliseRepeatEvery(value) {
  const repeatEvery = Number(value);
  if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > 100) {
    throw new Error('Repeat frequency must be between 1 and 100.');
  }
  return repeatEvery;
}

function normaliseOccurrenceCount(value, frequency) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Please enter a valid number of occurrences.');
  }
  if (frequency === 'year' && count > 5) {
    throw new Error('Yearly recurring events can have a maximum of 5 occurrences.');
  }
  return count;
}

function maxGregorianEndDate(startDate, frequency) {
  return frequency === 'year' ? addYearsClamped(startDate, 4) : addYearsClamped(startDate, 1);
}

function validateFrequency(frequency) {
  if (!RECURRENCE_FREQUENCIES.includes(frequency)) {
    throw new Error('Please choose a valid recurrence frequency.');
  }
}

export function generateGregorianOccurrences({
  startDate,
  frequency,
  repeatEvery,
  endMode,
  endDate,
  occurrenceCount,
  overrides = [],
}) {
  validateFrequency(frequency);
  const start = parseLocalDate(startDate);
  if (!start) throw new Error('Please select the first event date.');
  const step = normaliseRepeatEvery(repeatEvery);
  const hardEnd = maxGregorianEndDate(start, frequency);
  const limitByDate = endMode === 'date';
  const limitByCount = endMode === 'count';
  if (!limitByDate && !limitByCount) throw new Error('Please choose how the recurring events should end.');

  let end = hardEnd;
  let countLimit = frequency === 'year' ? 5 : 370;
  if (limitByDate) {
    const chosenEnd = parseLocalDate(endDate);
    if (!chosenEnd) throw new Error('Please select an end date.');
    if (chosenEnd < start) throw new Error('End date must be after the first event date.');
    if (chosenEnd > hardEnd) {
      throw new Error(frequency === 'year'
        ? 'Yearly recurring events can only generate 5 occurrences.'
        : 'Daily, weekly and monthly recurring events cannot go beyond one year.');
    }
    end = chosenEnd;
  } else {
    countLimit = normaliseOccurrenceCount(occurrenceCount, frequency);
  }

  const occurrences = [];
  let current = start;
  while (occurrences.length < countLimit && current <= hardEnd && (!limitByDate || current <= end)) {
    const eventDate = formatLocalDate(current);
    occurrences.push({
      eventDate,
      hijriDate: getHijriDisplay(eventDate, overrides),
      enteredAsHijri: false,
    });
    current = addGregorianStep(current, frequency, step);
  }
  if (limitByCount && occurrences.length < countLimit) {
    throw new Error(frequency === 'year'
      ? 'Yearly recurring events can only generate 5 occurrences.'
      : 'The requested occurrences go beyond one year. Reduce the occurrence count or increase the repeat frequency.');
  }
  return occurrences;
}

function normaliseHijriParts(parts, fieldLabel) {
  const day = Number(parts?.day);
  const month = Number(parts?.month);
  const year = Number(parts?.year);
  if (!Number.isInteger(day) || day < 1 || day > 30
    || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(year)) {
    throw new Error(`Please enter a valid ${fieldLabel} Hijri date.`);
  }
  return { day, month, year };
}

function hijriMonthIndex(year, month) {
  return year * 12 + (month - 1);
}

function fromHijriMonthIndex(index) {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function compareHijriParts(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function addHijriStep(parts, frequency, repeatEvery) {
  if (frequency === 'day' || frequency === 'week') {
    let day = parts.day + (frequency === 'day' ? repeatEvery : repeatEvery * 7);
    let monthIndex = hijriMonthIndex(parts.year, parts.month);
    while (day > 30) {
      day -= 30;
      monthIndex += 1;
    }
    const monthParts = fromHijriMonthIndex(monthIndex);
    return { day, month: monthParts.month, year: monthParts.year };
  }
  const monthsToAdd = frequency === 'month' ? repeatEvery : repeatEvery * 12;
  const monthParts = fromHijriMonthIndex(hijriMonthIndex(parts.year, parts.month) + monthsToAdd);
  return { day: Math.min(parts.day, 30), month: monthParts.month, year: monthParts.year };
}

export function generateHijriOccurrences({
  startHijri,
  frequency,
  repeatEvery,
  endMode,
  endHijri,
  occurrenceCount,
  overrides = [],
}) {
  validateFrequency(frequency);
  const start = normaliseHijriParts(startHijri, 'start');
  const startGregorian = hijriToGregorian(start.day, start.month, start.year, overrides);
  const startDate = parseLocalDate(startGregorian);
  if (!startDate) throw new Error('Could not convert the Hijri start date.');
  const step = normaliseRepeatEvery(repeatEvery);
  const hardEndGregorian = maxGregorianEndDate(startDate, frequency);
  const limitByDate = endMode === 'date';
  const limitByCount = endMode === 'count';
  if (!limitByDate && !limitByCount) throw new Error('Please choose how the recurring events should end.');

  let endHijriParts = null;
  let countLimit = frequency === 'year' ? 5 : 370;
  if (limitByDate) {
    endHijriParts = normaliseHijriParts(endHijri, 'end');
    if (compareHijriParts(endHijriParts, start) < 0) {
      throw new Error('End date must be after the first event date.');
    }
    const endGregorian = hijriToGregorian(endHijriParts.day, endHijriParts.month, endHijriParts.year, overrides);
    const parsedEndDate = parseLocalDate(endGregorian);
    if (!parsedEndDate || parsedEndDate > hardEndGregorian) {
      throw new Error(frequency === 'year'
        ? 'Yearly recurring events can only generate 5 occurrences.'
        : 'Daily, weekly and monthly recurring events cannot go beyond one year.');
    }
  } else {
    countLimit = normaliseOccurrenceCount(occurrenceCount, frequency);
  }

  const occurrences = [];
  let current = start;
  while (occurrences.length < countLimit) {
    if (limitByDate && compareHijriParts(current, endHijriParts) > 0) break;
    const eventDate = hijriToGregorian(current.day, current.month, current.year, overrides);
    const gregorian = parseLocalDate(eventDate);
    if (!gregorian || gregorian > hardEndGregorian) break;
    occurrences.push({
      eventDate,
      hijriDate: hijriDisplayFromParts(current.day, current.month, current.year),
      hijriDay: current.day,
      hijriMonth: current.month,
      hijriYear: current.year,
      enteredAsHijri: true,
    });
    current = addHijriStep(current, frequency, step);
  }
  if (limitByCount && occurrences.length < countLimit) {
    throw new Error(frequency === 'year'
      ? 'Yearly recurring events can only generate 5 occurrences.'
      : 'The requested occurrences go beyond one year. Reduce the occurrence count or increase the repeat frequency.');
  }
  return occurrences;
}

export function recurrenceLabel(frequency, repeatEvery) {
  const n = Number(repeatEvery) || 1;
  const label = { day: 'day', week: 'week', month: 'month', year: 'year' }[frequency] || 'day';
  return n === 1 ? `Every ${label}` : `Every ${n} ${label}s`;
}
