export function registrationEventCard(event) {
  return {
    ...event,
    registrationOnly: true,
    eventDate: event.date,
    eventTypeDisplay: event.eventType,
    eventSubject: event.eventSubject || event.title,
    createdByUserId: event.ownerUid,
    metroArea: event.city,
    city: event.city,
    organiserType: event.organiserType || 'private',
    address: { suburb: event.suburb, city: event.city },
  };
}

export async function registrationEventFeed(api, scope, city) {
  const events = new Map();
  const cursors = new Set();
  let cursor = null;
  do {
    const page = await api.list({ scope, city, cursor });
    for (const event of page.events) {
      if (scope !== 'public' || event.status === 'approved') events.set(event.id, registrationEventCard(event));
    }
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('Event pagination did not advance. Reload and try again.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...events.values()];
}
