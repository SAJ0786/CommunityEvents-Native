export function registrationUnavailable(event) {
  return Boolean(event?.registrationOnly && (event.deleted || event.deletedAt || event.status === 'cancelled'));
}
export function registrationStatusLabel(event) {
  return event.deleted || event.deletedAt ? 'Event deleted' : event.status === 'cancelled' ? 'Event cancelled' : '';
}
