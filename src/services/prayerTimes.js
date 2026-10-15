export const PRAYER_OPTIONS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'sunrise', label: 'Sunrise' },
  { key: 'zohrain', label: 'Zohrain' },
  { key: 'sunset', label: 'Sunset' },
  { key: 'maghreb', label: 'Maghreb' },
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function fixAngle(value) {
  return ((value % 360) + 360) % 360;
}

function fixHour(value) {
  return ((value % 24) + 24) % 24;
}

function dateToJulian(year, month, day) {
  let adjustedYear = year;
  let adjustedMonth = month;
  if (adjustedMonth <= 2) {
    adjustedYear -= 1;
    adjustedMonth += 12;
  }
  const a = Math.floor(adjustedYear / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (adjustedYear + 4716))
    + Math.floor(30.6001 * (adjustedMonth + 1))
    + day + b - 1524.5;
}

function sunPosition(julianDate) {
  const d = julianDate - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d) * DEG_TO_RAD;
  const q = fixAngle(280.459 + 0.98564736 * d);
  const l = fixAngle(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG_TO_RAD;
  const e = (23.439 - 0.00000036 * d) * DEG_TO_RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) * RAD_TO_DEG / 15;
  const declination = Math.asin(Math.sin(e) * Math.sin(l)) * RAD_TO_DEG;
  return { declination, equation: q / 15 - fixHour(ra) };
}

function hourAngle(angle, latitude, declination) {
  const lat = latitude * DEG_TO_RAD;
  const dec = declination * DEG_TO_RAD;
  const numerator = -Math.sin(angle * DEG_TO_RAD) - Math.sin(lat) * Math.sin(dec);
  const denominator = Math.cos(lat) * Math.cos(dec);
  const clamped = Math.max(-1, Math.min(1, numerator / denominator));
  return Math.acos(clamped) * RAD_TO_DEG / 15;
}

function asrTime(factor, latitude, declination) {
  const angle = -Math.atan(1 / (factor + Math.tan(Math.abs(latitude - declination) * DEG_TO_RAD))) * RAD_TO_DEG;
  return hourAngle(angle, latitude, declination);
}

export function timeZoneForAddress(address = {}) {
  if (typeof address.timeZone === 'string' && address.timeZone.startsWith('Australia/')) {
    try { new Intl.DateTimeFormat('en-AU', { timeZone: address.timeZone }).format(new Date()); return address.timeZone; } catch { /* resolve from state */ }
  }
  const state = String(address.state || '').trim().toUpperCase();
  if (state === 'WA') return 'Australia/Perth';
  if (state === 'SA') return 'Australia/Adelaide';
  if (state === 'NT') return 'Australia/Darwin';
  if (state === 'QLD') return 'Australia/Brisbane';
  if (state === 'TAS') return 'Australia/Hobart';
  if (state === 'VIC') return 'Australia/Melbourne';
  return 'Australia/Sydney';
}

export function timeZoneOffsetHours(dateStr, timeZone) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) return null;
  return zonedPrayerClock(date, timeZone)?.offsetHours ?? null;
}

// Calendar fields belong to the selected location, never the device timezone.
export function zonedPrayerClock(instant, timeZone) {
  try {
    if (!timeZone) return null;
    const date = new Date(instant);
    if (!Number.isFinite(date.getTime())) return null;
    // Numeric zoned components work even where Hermes returns AEDT/AEST
    // instead of GMT+11/GMT+10, or does not support shortOffset at all.
    const parts = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter(item => item.type !== 'literal').map(item => [item.type, Number(item.value)]));
    if (!['year', 'month', 'day', 'hour', 'minute', 'second'].every(key => Number.isFinite(values[key]))) return null;
    const zonedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour % 24, values.minute, values.second);
    const offset = (zonedAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 3600000;
    if (!Number.isFinite(offset) || Math.abs(offset) > 14) return null;
    const pad = value => String(value).padStart(2, '0');
    return { date: `${values.year}-${pad(values.month)}-${pad(values.day)}`,
      time: `${pad(values.hour % 24)}:${pad(values.minute)}`, offsetHours: offset };
  } catch {
    // Do not silently give every city Sydney's winter offset.
    return null;
  }
}

export function prayerDateAt(address, instant = new Date(), dayOffset = 0) {
  if (!address || !hasPrayerLocation(address)) return null;
  const clock = zonedPrayerClock(instant, timeZoneForAddress(address));
  if (!clock || !Number.isInteger(dayOffset)) return null;
  const day = new Date(`${clock.date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  return day.toISOString().slice(0, 10);
}

// Convert a location's wall-clock time exactly once for native notification APIs.
// Reject nonexistent/ambiguous clock-change times rather than guess an instant.
export function prayerTimeInstant(dateStr, time, timeZone) {
  if (!/^\d{2}:\d{2}$/.test(time || '') || timeZoneOffsetHours(dateStr, timeZone) === null) return null;
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) return null;
  const wall = Date.parse(`${dateStr}T${time}:00Z`);
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const offset = zonedPrayerClock(new Date(wall + delta), timeZone)?.offsetHours;
    if (offset === undefined) continue;
    const value = wall - offset * 3600000;
    const check = zonedPrayerClock(new Date(value), timeZone);
    if (check?.date === dateStr && check.time === time) candidates.add(value);
  }
  return candidates.size === 1 ? new Date([...candidates][0]) : null;
}

function decimalToTime(value) {
  const fixed = fixHour(value + 0.5 / 60);
  const hours = Math.floor(fixed);
  const minutes = Math.floor((fixed - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function hasPrayerLocation(address = {}) {
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  const addressText = typeof address === 'string'
    ? address.trim()
    : String(address.fullAddress || address.street || address.suburb || '').trim();
  if (addressText.length < 5) return false;
  if (address.latitude === null || address.latitude === undefined) return false;
  if (address.longitude === null || address.longitude === undefined) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return latitude >= -45 && latitude <= -9 && longitude >= 110 && longitude <= 155;
}

export function calculatePrayerTimes(dateStr, address = {}) {
  if (!dateStr || !hasPrayerLocation(address)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  const latitude = Number(address.latitude);
  const longitude = Number(address.longitude);
  const timeZone = timeZoneForAddress(address);
  const offset = timeZoneOffsetHours(dateStr, timeZone);
  if (offset === null) return null;
  const julian = dateToJulian(year, month, day) - longitude / (15 * 24);
  const sun = sunPosition(julian);
  const noon = fixHour(12 + offset - longitude / 15 - sun.equation);
  const fajr = noon - hourAngle(16, latitude, sun.declination);
  const sunrise = noon - hourAngle(0.833, latitude, sun.declination);
  const sunset = noon + hourAngle(0.833, latitude, sun.declination);
  const asr = noon + asrTime(1, latitude, sun.declination);
  const maghreb = noon + hourAngle(4, latitude, sun.declination);
  const isha = noon + hourAngle(14, latitude, sun.declination);
  return {
    method: 'Jafari',
    timeZone,
    fajr: decimalToTime(fajr),
    sunrise: decimalToTime(sunrise),
    zohrain: decimalToTime(noon),
    asr: decimalToTime(asr),
    sunset: decimalToTime(sunset),
    maghreb: decimalToTime(Math.max(maghreb, sunset + 7 / 60)),
    isha: decimalToTime(isha),
  };
}

export function prayerLabel(key) {
  return PRAYER_OPTIONS.find(option => option.key === key)?.label || '';
}

export function applyPrayerOffset(time, offsetMinutes = 0) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return time || '';
  const [hours, minutes] = time.split(':').map(Number);
  const total = ((hours * 60 + minutes + Number(offsetMinutes || 0)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
