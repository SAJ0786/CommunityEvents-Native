import { APPLE_APP_STORE_URL, GOOGLE_PLAY_URL } from './storeLinks';

export const STORE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;
const APP_IDS = { ios: 'info.siza.communityevents', android: 'info.siza.communityevents.app' };
function parts(value) {
  if (typeof value !== 'string' || !/^\d{1,6}(?:\.\d{1,6}){0,2}$/.test(value)) return null;
  return value.split('.').map(Number).concat([0, 0]).slice(0, 3);
}
export function isNewerStoreVersion(installed, published) {
  const left = parts(installed); const right = parts(published);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) {
    if (right[i] !== left[i]) return right[i] > left[i];
  }
  return false;
}
export function storeUpdateNotice({ release, platform, applicationId, installedVersion, now = Date.now(), snoozedUntil = 0 }) {
  if (!APP_IDS[platform] || applicationId !== APP_IDS[platform] || !release || release.enabled !== true || release.storeVerified !== true) return null;
  if (release.applicationId !== applicationId || !isNewerStoreVersion(installedVersion, release.version)) return null;
  const published = typeof release.publishedAt === 'string' ? Date.parse(release.publishedAt) : NaN;
  const expires = typeof release.expiresAt === 'string' ? Date.parse(release.expiresAt) : NaN;
  if (!Number.isFinite(published) || !Number.isFinite(expires) || published > now || expires <= now || expires <= published) return null;
  // Bound corrupt/local future timestamps so the notice cannot stay hidden forever.
  if (Number.isFinite(snoozedUntil) && snoozedUntil > now && snoozedUntil <= now + UPDATE_SNOOZE_MS) return null;
  return { version: release.version, url: platform === 'ios' ? APPLE_APP_STORE_URL : GOOGLE_PLAY_URL };
}
