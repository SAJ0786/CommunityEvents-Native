// Kept identical in the app and lifecycle function; parity is regression-tested.
const CITY_ZONES = { sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', canberra: 'Australia/Sydney', brisbane: 'Australia/Brisbane', adelaide: 'Australia/Adelaide', hobart: 'Australia/Hobart', perth: 'Australia/Perth', darwin: 'Australia/Darwin' };
const STATE_ZONES = { NSW: 'Australia/Sydney', VIC: 'Australia/Melbourne', ACT: 'Australia/Sydney', QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide', TAS: 'Australia/Hobart', WA: 'Australia/Perth', NT: 'Australia/Darwin' };
function isFutureSeriesEvent(event, now = new Date()) {
  if (!event || event.isLive === true || ['inactive', 'archived', 'deleted', 'cancelled'].includes(event.status)) return false;
  const date = String(event.eventDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const zone = CITY_ZONES[String(event.metroArea || event.city || '').toLowerCase()]
    || STATE_ZONES[String(event.address?.state || '').toUpperCase()] || event.prayerTimeZone || 'Australia/Sydney';
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map(part => [part.type, part.value]));
    const today = [parts.year, parts.month, parts.day].join('-');
    if (date !== today) return date > today;
    // Unknown same-day times are excluded, not assumed upcoming.
    const match = String(event.startTime || '').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!match) return false;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return false;
    if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    return hour * 3600 + minute * 60 > Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  } catch (_) {
    return false;
  }
}
module.exports = { isFutureSeriesEvent };
