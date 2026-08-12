import { doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { auth, db, functions } from '../firebase/firebase';

const EMPTY_HIJRI_SETTINGS = {
  overrides: [],
  adjustmentDays: 0,
  anchorDate: '',
  anchorMonth: '',
  anchorYear: '',
};

function monthIndex(year, month) {
  return Number(year) * 12 + (Number(month) - 1);
}

function gregorianToJdn(dateString) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y
    + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function isPlausibleRelativeOverride(existing, hYear, hMonth, gDate) {
  if (!existing?.gDate) return false;
  const existingIdx = monthIndex(existing.hYear, existing.hMonth);
  const targetIdx = monthIndex(hYear, hMonth);
  if (existingIdx === targetIdx) return false;

  const existingJdn = gregorianToJdn(existing.gDate);
  const targetJdn = gregorianToJdn(gDate);
  if (!existingJdn || !targetJdn) return false;

  const monthDiff = existingIdx - targetIdx;
  const minDays = Math.abs(monthDiff) * 29;
  const maxDays = Math.abs(monthDiff) * 30;
  const dayDiff = monthDiff > 0 ? existingJdn - targetJdn : targetJdn - existingJdn;
  return dayDiff >= minDays && dayDiff <= maxDays;
}

export async function getHijriSettings() {
  try {
    const snapshot = await getDoc(doc(db, 'settings', 'hijriCalendar'));
    const exists = typeof snapshot.exists === 'function' ? snapshot.exists() : snapshot.exists;
    if (!exists) return EMPTY_HIJRI_SETTINGS;
    const data = snapshot.data() || {};
    return {
      overrides: data.overrides || [],
      adjustmentDays: data.adjustmentDays ?? 0,
      anchorDate: data.anchorDate ?? '',
      anchorMonth: data.anchorMonth ?? '',
      anchorYear: data.anchorYear ?? '',
    };
  } catch {
    return EMPTY_HIJRI_SETTINGS;
  }
}

export async function saveHijriSettings(settings) {
  await setDoc(doc(db, 'settings', 'hijriCalendar'), settings, { merge: true });
  return settings;
}

export async function saveMonthOverride(hYear, hMonth, gDate) {
  const current = await getHijriSettings();
  const overrides = [
    ...(current.overrides || [])
      .filter(item => !(Number(item.hYear) === Number(hYear) && Number(item.hMonth) === Number(hMonth)))
      .filter(item => isPlausibleRelativeOverride(item, hYear, hMonth, gDate)),
    { hYear: Number(hYear), hMonth: Number(hMonth), gDate },
  ];
  await saveHijriSettings({ ...current, overrides });
  return overrides;
}

export async function removeMonthOverride(hYear, hMonth) {
  const current = await getHijriSettings();
  const overrides = (current.overrides || []).filter(
    item => !(Number(item.hYear) === Number(hYear) && Number(item.hMonth) === Number(hMonth))
  );
  await saveHijriSettings({ ...current, overrides });
  return overrides;
}

async function requireAdminSession() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in with an admin account to use this tool.');
}

export async function sendReminderEmailJob(payload = {}) {
  await requireAdminSession();
  const fn = httpsCallable(functions, 'sendRemindersNow');
  const result = await fn(payload);
  return result.data || { queued: false, sent: 0, message: 'Reminder request finished.' };
}

export async function sendCommunityUpdateMessage({ message, city } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return sendReminderEmailJob({
    mode: 'date',
    date: today,
    customMode: true,
    customMessage: String(message || '').trim(),
    city,
  });
}

export async function sendStoreAnnouncement({ city } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return sendReminderEmailJob({
    mode: 'date',
    date: today,
    customMode: true,
    customTemplate: 'storeAnnouncement',
    city,
  });
}

export async function getYouTubeConnectionStatus() {
  await requireAdminSession();
  const fn = httpsCallable(functions, 'youtubeConnectionStatus');
  const result = await fn();
  return { connected: Boolean(result.data?.connected) };
}

export async function getYouTubeOAuthUrl() {
  await requireAdminSession();
  const fn = httpsCallable(functions, 'youtubeOAuthUrl');
  const result = await fn();
  return String(result.data?.url || '');
}

export async function refreshYouTubeThumbnails({ limit = 10, force = true } = {}) {
  await requireAdminSession();
  const fn = httpsCallable(functions, 'refreshStreamVideoThumbnails');
  const result = await fn({ limit, force });
  return result.data || { updated: 0, attempted: 0, errors: [], message: 'Thumbnail update finished.' };
}
