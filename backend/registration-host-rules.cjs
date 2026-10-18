// Scoped patch: preserve every unrelated production rule. Fail on unexpected source.
const HOST_MATCH = `    function hostThreadMatchesEvent(data) {
      let registration = data.get('eventCollection', 'events') == 'registrationEvents';
      let event = registration
        ? get(/databases/$(database)/documents/registrationEvents/$(data.eventId)).data
        : get(/databases/$(database)/documents/events/$(data.eventId)).data;
      let host = event.get('createdByUserId', '') != '' ? event.createdByUserId
        : event.get('ownerUid', '') != '' ? event.ownerUid
        : event.get('createdByUid', '') != '' ? event.createdByUid : event.get('userId', '');
      return data.get('eventCollection', 'events') in ['events', 'registrationEvents']
        && data.hostUid == host && event.get('hidden', false) == false
        && (!registration || (event.get('status', '') == 'approved' && event.get('deletedAt', null) == null))
        && !(event.get('status', 'active') in ['inactive', 'archived', 'deleted', 'cancelled']);
    }`;
function patchRegistrationHostRules(source) {
  const pattern = /    function hostThreadMatchesEvent\(data\) \{[\s\S]*?\n    \}/g;
  if ((source.match(pattern) || []).length !== 1) throw Error('Expected one authoritative host-event matcher.');
  source = source.replace(pattern, () => HOST_MATCH);
  const identity = "'type', 'eventId', 'hostUid', 'senderUid', 'participantUids'";
  const patched = "'type', 'eventId', 'eventCollection', 'hostUid', 'senderUid', 'participantUids'";
  if (!source.includes(identity) && !source.includes(patched)) throw Error('Unexpected host identity update rule.');
  source = source.replace(identity, patched);
  // Only the validated public catalogue may load before authentication.
  source = source.replace(/(match \/settings\/\{docId\} \{\s*allow read:\s*)if signedIn\(\);/, "$1if docId == 'cityCatalogue' || signedIn();");
  return source;
}
module.exports = { patchRegistrationHostRules, HOST_MATCH };
