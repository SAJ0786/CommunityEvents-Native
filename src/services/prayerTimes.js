export const PRAYER_OPTIONS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'sunrise', label: 'Sunrise' },
  { key: 'zohrain', label: 'Zohrain' },
  { key: 'sunset', label: 'Sunset' },
  { key: 'maghreb', label: 'Maghrebain' },
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

function timeZoneForAddress(address = {}) {
  const state = String(address.state || '').trim().toUpperCase();
  if (state === 'WA') return 'Australia/Perth';
  if (state === 'SA') return 'Australia/Adelaide';
  if (state === 'NT') return 'Australia/Darwin';
  if (state === 'QLD') return 'Australia/Brisbane';
  if (state === 'TAS') return 'Australia/Hobart';
  return 'Australia/Sydney';
}

function timeZoneOffsetHours(dateStr, timeZone) {
  try {
    const date = new Date(`${dateStr}T12:00:00Z`);
    const part = new Intl.DateTimeFormat('en-AU', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date).find(item => item.type === 'timeZoneName')?.value || '';
    const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 10;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) + Number(match[3] || 0) / 60);
  } catch {
    return 10;
  }
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
