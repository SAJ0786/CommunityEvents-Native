export const cleanMemberName = value => String(value || '').trim().replace(/\s+/g, ' ');
export const cleanMemberEmail = value => String(value || '').trim().toLowerCase();
export const validMemberName = value => cleanMemberName(value).length >= 2 && cleanMemberName(value).length <= 120;
export const validMemberEmail = value => cleanMemberEmail(value).length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanMemberEmail(value));

export function memberEntryState(user, profile, loading) {
  if (!user || user.isAnonymous) return 'guest';
  if (loading) return 'loading';
  if (!profile) return 'retry';
  if (profile.isActive === false || ['banned', 'archived', 'deleted'].includes(profile.accountStatus)) return 'blocked';
  if (!/^\+614\d{8}$/.test(user.phoneNumber || '')) return 'verify-phone';
  return validMemberName(profile.fullName) && validMemberEmail(profile.email) ? 'ready' : 'complete-profile';
}
export function memberJoinedMillis(user = {}) {
  for (const value of [user.registeredAt, user.createdAt, user.joinedAt, user.createdOn]) {
    if (!value) continue;
    let millis;
    if (typeof value.toMillis === 'function') millis = value.toMillis();
    else if (typeof value.toDate === 'function') millis = value.toDate().getTime();
    else if (typeof value.seconds === 'number' || typeof value._seconds === 'number') millis = (value.seconds ?? value._seconds) * 1000;
    else millis = new Date(value).getTime();
    if (Number.isFinite(millis) && millis > 0) return millis;
  }
  return 0;
}
export function memberJoinedLabel(user) {
  const millis = memberJoinedMillis(user);
  return millis ? new Date(millis).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';
}
export function newestMembersFirst(a, b) {
  return memberJoinedMillis(b) - memberJoinedMillis(a)
    || String(a.id || a.uid || '').localeCompare(String(b.id || b.uid || ''));
}
