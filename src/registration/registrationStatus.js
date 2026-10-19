export function registrationUnavailable(event) {
  return Boolean(event?.registrationOnly && (event.deleted || event.deletedAt || event.status === 'cancelled'));
}
export function registrationStatusLabel(event) {
  return event.deleted || event.deletedAt ? 'Event deleted' : event.status === 'cancelled' ? 'Event cancelled' : '';
}

export function registrationEntryAllowed(detail) {
  return Boolean(detail?.event?.status === 'approved' && !detail.event.deleted && !detail.event.deletedAt
    && detail.form && (detail.canRegister || detail.canEditRegistration));
}
export function registrationEventEnded(detail) {
  return Boolean(detail?.event && (detail.event.status === 'cancelled' || detail.event.deleted || detail.event.deletedAt));
}
