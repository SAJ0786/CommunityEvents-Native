import { getHijriParts, getHijriMonthLength, hijriToGregorian, hijriDisplayFromParts } from '../services/hijri';

export function todayEventDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function currentHijriEventDate(overrides = [], now = new Date()) {
  const eventDate = todayEventDate(now);
  const { day, month, year } = getHijriParts(eventDate, overrides);
  return { eventDate, hijriDay: day, hijriMonth: month, hijriYear: year,
    hijriDate: hijriDisplayFromParts(day, month, year), enteredAsHijri: true };
}

export function resolveHijriEventDate(form, overrides = [], now = new Date()) {
  const day = Number(form.hijriDay);
  const month = Number(form.hijriMonth);
  const year = Number(form.hijriYear);
  if (!day || month < 1 || month > 12 || !month || String(form.hijriYear || '').length !== 4) {
    return { ...form, eventDate: '', hijriDate: '', enteredAsHijri: true };
  }
  const safeDay = Math.min(Math.max(day, 1), getHijriMonthLength(year, month, overrides));
  const eventDate = hijriToGregorian(safeDay, month, year, overrides);
  if (eventDate && eventDate < todayEventDate(now)) return { ...form, ...currentHijriEventDate(overrides, now) };
  return { ...form, eventDate: eventDate || '', hijriDay: safeDay, hijriMonth: month,
    hijriYear: year, hijriDate: eventDate ? hijriDisplayFromParts(safeDay, month, year) : '', enteredAsHijri: true };
}
