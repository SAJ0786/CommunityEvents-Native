const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function wallMinute(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// Like prayerTimeInstant, reject DST gaps and overlaps instead of choosing a time.
export function registrationInstant(date, time, timeZone) {
  if (!DATE.test(date || '') || !TIME.test(time || '') || !timeZone?.startsWith('Australia/')) throw new Error('Choose a valid event date, time and Australian city timezone.');
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) throw new Error('Choose a valid event date.');
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = wall + delta;
    const local = Date.parse(`${wallMinute(sample, timeZone)}:00Z`);
    const instant = wall - (local - sample);
    if (wallMinute(instant, timeZone) === `${date}T${time}`) candidates.add(instant);
  }
  if (candidates.size !== 1) throw new Error('This event time is missing or ambiguous during a daylight-saving clock change. Choose another time.');
  return new Date([...candidates][0]).toISOString();
}

export function registrationSchedule({ date, startTime = '', endTime = '', timeZone }) {
  if (!startTime && !endTime) return { startTime: '', endTime: '', startAt: null, endAt: null };
  if (!TIME.test(startTime) || (endTime && !TIME.test(endTime))) throw new Error('Enter a start time and optional end time as HH:mm.');
  if (endTime === startTime) throw new Error('End time must differ from start time. An earlier end time means the following day.');
  const startAt = registrationInstant(date, startTime, timeZone);
  let endAt = null;
  if (endTime) {
    const day = new Date(`${date}T12:00:00Z`);
    if (endTime < startTime) day.setUTCDate(day.getUTCDate() + 1);
    endAt = registrationInstant(day.toISOString().slice(0, 10), endTime, timeZone);
    if (endAt <= startAt) throw new Error('The event end must be after its start.');
  }
  return { startTime, endTime, startAt, endAt };
}
