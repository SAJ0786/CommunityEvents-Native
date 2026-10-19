// Only selectable, sufficiently available dates may be added to a shared booking.
export function availableOccurrences(detail, places) {
  return (detail?.occurrences || []).filter(row => row.selectable && row.availablePlaces >= Number(places));
}
export function occurrenceSubmission(detail, selected, answers, places, requestId) {
  const unique = [...new Set(selected)];
  const eligible = availableOccurrences(detail,places);
  if (!unique.length) throw Error('Select at least one occurrence.');
  if (unique.some(id => !eligible.some(row => row.eventId === id))) throw Error('A selected occurrence is no longer available for this number of places. Review your selection.');
  return { eventId:detail.event.id,requestId,places:Number(places),answers:JSON.parse(JSON.stringify(answers)),
    occurrences:unique.map(id => { const row = eligible.find(item => item.eventId === id);return {eventId:id,formVersion:row.formVersion,
      expectedRevision:row.registrationRevision ?? (id === detail.event.id ? detail.ownRegistration?.revision || 0 : 0)}; }) };
}
