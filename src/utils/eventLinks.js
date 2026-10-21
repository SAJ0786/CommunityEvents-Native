const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function eventShareLink(event) {
  if (!safeId(event?.id)) return '';
  return 'https://communityconnect.siza.info/?' + (event.registrationOnly ? 'registration=' : 'event=') + encodeURIComponent(event.id);
}
export function parseEventShareLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['communityconnect.siza.info','communityevents.siza.info'].includes(url.hostname) || url.pathname !== '/') return null;
    const registration = url.searchParams.get('registration'), normal = url.searchParams.get('event');
    if (registration && normal) return null;
    const id = registration || normal;
    return safeId(id) ? {id,registrationOnly:Boolean(registration)} : null;
  } catch { return null; }
}
