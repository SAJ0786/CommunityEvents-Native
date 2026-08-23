import { STORE_SHARE_LINES } from './storeLinks';

function isAdminRole(role) {
  return role === 'admin' || role === 'superAdmin';
}

function normalizeAudience(value = '') {
  return String(value || '').trim() === 'Mixed Audience'
    ? 'Family Event'
    : String(value || '').trim();
}

function getSharePrivacy(profile, event, uid, isGuest) {
  const role = profile?.role;
  const guestSession = isGuest || !uid;
  const isAdmin = isAdminRole(role);
  const isPrivate = event?.organiserType === 'private';
  const isOwner = uid && event?.createdByUserId === uid;

  if (guestSession) return { showFullAddress: !isPrivate, showPhone: false };
  if (isAdmin) return { showFullAddress: true, showPhone: true };
  if (!isPrivate || isOwner) return { showFullAddress: true, showPhone: true };
  return { showFullAddress: false, showPhone: false };
}

function eventDateLabel(value) {
  if (!value) return '';
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return String(value || '');
  }
}

function timeLabel(event = {}) {
  const parts = [event.prayerLabel, event.startTime].filter(Boolean);
  const start = parts.join(' ').trim();
  return event.endTime ? `${start} - ${event.endTime}` : start;
}

function fullAddressLabel(event = {}) {
  const address = event.address || {};
  if (typeof address === 'string') return address;
  return address.fullAddress || [address.street, address.suburb, address.state, address.postcode].filter(Boolean).join(', ');
}

function suburbLabel(event = {}) {
  const address = event.address || {};
  if (typeof address === 'string') return address.split(',')[0]?.trim() || '';
  return event.suburb || address.suburb || '';
}

export function buildEventShareMessage(event = {}, { isGuest = true, user = null, profile = null } = {}) {
  const sharePrivacy = getSharePrivacy(profile, event, user?.uid, isGuest);
  const location = sharePrivacy.showFullAddress ? (fullAddressLabel(event) || suburbLabel(event)) : suburbLabel(event);
  const locationLabel = sharePrivacy.showFullAddress ? '*Location:*' : '*Suburb:*';
  const displayType = event.eventSubject?.trim()
    ? `${event.eventTypeDisplay || event.customEventType || event.eventType || 'Event'} | ${event.eventSubject.trim()}`
    : (event.eventTypeDisplay || event.customEventType || event.eventType || 'Event');
  const reciterLines = (event.reciters || [])
    .filter(reciter => reciter?.name?.trim())
    .map(reciter => `🎙️ *${reciter.customType || reciter.type || 'Reciter'}:* ${reciter.name.trim()}`);

  return [
    `📅 *${displayType}*`,
    event.hostName ? `🏠 *Host:* ${event.hostName}` : '',
    event.eventDate ? `📆 *Date:* ${eventDateLabel(event.eventDate)}` : '',
    timeLabel(event) ? `⏰ *Time:* ${timeLabel(event)}` : '',
    location ? `📍 ${locationLabel} ${location}` : '',
    sharePrivacy.showPhone && event.hostPhone ? `📞 *Phone:* ${event.hostPhone}` : '',
    event.hijriDateDisplay || event.hijriDate ? `🌙 *Hijri:* ${event.hijriDateDisplay || event.hijriDate}` : '',
    event.speakerName ? `🎤 *Speaker:* ${event.speakerName}` : '',
    ...reciterLines,
    normalizeAudience(event.audienceType || event.audience) ? `👥 ${normalizeAudience(event.audienceType || event.audience)}` : '',
    event.notes?.trim() ? `📝 *Notes:* ${event.notes.trim()}` : '',
    '',
    ...STORE_SHARE_LINES,
    '',
    '_Shared via Community Events Australia_',
  ].filter(Boolean).join('\n');
}
