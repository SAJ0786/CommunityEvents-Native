const PUBLIC_FIELDS = Object.freeze({
  hostName: 80, organiserType: 100, organiserId: 128, organiserName: 160, organisationType: 80,
  eventSubject: 160, audienceType: 80, speakerName: 160, timeMode: 10, prayerName: 40,
  prayerLabel: 80, prayerTimeZone: 100, hijriDate: 100,
});
function eventMetadata(raw) {
  const result = {};
  for (const [key, maximum] of Object.entries({ ...PUBLIC_FIELDS, hostPhone: 80, hostContactOptional: 254 })) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'string' || raw[key].length > maximum) throw Error(`Invalid ${key}.`);
    result[key] = raw[key].trim();
  }
  if (result.timeMode && !['manual', 'prayer'].includes(result.timeMode)) throw Error('Choose manual or prayer event time.');
  for (const key of ['isOnBehalfOf', 'enteredAsHijri']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'boolean') throw Error(`Invalid ${key}.`);
    result[key] = raw[key];
  }
  for (const [key, min, max] of [['prayerOffsetMinutes', -360, 360], ['hijriDay', 1, 30], ['hijriMonth', 1, 12], ['hijriYear', 1300, 1700]]) {
    if (raw[key] === undefined) continue;
    if (raw[key] === null && key !== 'prayerOffsetMinutes') { result[key] = null; continue; }
    if (!Number.isInteger(raw[key]) || raw[key] < min || raw[key] > max) throw Error(`Invalid ${key}.`);
    result[key] = raw[key];
  }
  if (raw.reciters !== undefined) {
    if (!Array.isArray(raw.reciters) || raw.reciters.length > 20) throw Error('Use up to 20 reciters.');
    result.reciters = raw.reciters.map(reciter => {
      const value = {};
      for (const key of ['type', 'name', 'customType']) {
        const text = reciter?.[key] ?? '';
        if (typeof text !== 'string' || text.length > (key === 'name' ? 160 : 80)) throw Error('Invalid reciter details.');
        value[key] = text.trim();
      }
      if (!value.type || !value.name) throw Error('Name each reciter and choose its type.');
      return value;
    });
  }
  return result;
}
module.exports = { eventMetadata, PUBLIC_FIELDS };
