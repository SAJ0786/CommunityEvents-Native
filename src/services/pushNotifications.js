import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import { getMessaging, getToken, getAPNSToken, registerDeviceForRemoteMessages, isDeviceRegisteredForRemoteMessages, onTokenRefresh, deleteToken, getInitialNotification, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import { auth, db } from '../firebase/firebase';

export const BUSINESS_ALERT_CHANNEL_ID = 'business-alerts';
const TOKEN_FETCH_TIMEOUT_MS = 20000;
const TOKEN_RETRY_DELAYS_MS = [0, 2000, 5000, 10000];
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const permissionAllowed = permission => permission.status === 'granted'
  || (Platform.OS === 'ios' && typeof permission.ios?.status === 'number'
    && permission.ios.status === Notifications.IosAuthorizationStatus?.PROVISIONAL);

async function withTimeout(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Push-token registration timed out.'), { code: 'push-token-timeout' })), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function ensureBusinessAlertChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(BUSINESS_ALERT_CHANNEL_ID, {
    name: 'Business Directory alerts',
    description: 'Business messages, administrative decisions, listings and promotions.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250], lightColor: '#129182', sound: 'default',
  });
}

async function saveFcmToken(uid, token, isActive = () => true) {
  const value = String(token || '').trim();
  if (!uid || !value || !isActive() || auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) return null;
  await runTransaction(db, async tx => {
    const ref = doc(db, 'users', uid), snapshot = await tx.get(ref);
    if (!snapshot.exists() || !isActive() || auth.currentUser?.uid !== uid) return;
    const tokens = snapshot.data().fcmTokens;
    // Some PWA accounts have a token map; do not replace or corrupt it.
    const updated = tokens && !Array.isArray(tokens)
      ? { ...tokens, [value]: { platform: Platform.OS, source: 'native' } }
      : [...new Set([...(tokens || []), value])];
    tx.update(ref, { fcmTokens: updated, pushTokenPlatform: Platform.OS, pushTokenUpdatedAt: serverTimestamp() });
  });
  return value;
}

export async function registerDevicePushNotifications(uid, isActive = () => true) {
  if (!uid || !['ios', 'android'].includes(Platform.OS)) return null;
  await ensureBusinessAlertChannel();
  const current = await Notifications.getPermissionsAsync();
  const permission = permissionAllowed(current)
    ? current : await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  if (!permissionAllowed(permission)) return null;
  const messaging = getMessaging();
  if (Platform.OS === 'ios' && !isDeviceRegisteredForRemoteMessages(messaging)) await registerDeviceForRemoteMessages(messaging);
  let lastError;
  for (const delay of TOKEN_RETRY_DELAYS_MS) {
    if (delay) await wait(delay);
    if (!isActive() || auth.currentUser?.uid !== uid) return null;
    try {
      // APNs tokens are NOT FCM tokens. Wait for APNs, then request Firebase's token.
      if (Platform.OS === 'ios' && !await withTimeout(getAPNSToken(messaging), TOKEN_FETCH_TIMEOUT_MS)) {
        throw Object.assign(new Error('Apple push registration is not ready. Check APNs credentials and the signed push entitlement.'), { code: 'push-apns-not-ready' });
      }
      const token = await withTimeout(getToken(messaging), TOKEN_FETCH_TIMEOUT_MS);
      return await saveFcmToken(uid, token, isActive);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Push-token registration failed.');
}

export function listenForDevicePushTokenChanges(uid, onError = () => {}) {
  if (!uid || !['ios', 'android'].includes(Platform.OS)) return () => {};
  let active = true;
  const unsubscribe = onTokenRefresh(getMessaging(), token => {
    saveFcmToken(uid, token, () => active).catch(onError);
  });
  return () => { active = false; unsubscribe(); };
}

export async function unregisterDevicePushNotifications(uid) {
  if (!uid || !['ios', 'android'].includes(Platform.OS)) return;
  const messaging = getMessaging();
  // Invalidate the device token before switching accounts, even if unlink fails.
  try {
    const token = await getToken(messaging);
    await runTransaction(db, async tx => {
      const ref = doc(db, 'users', uid), snapshot = await tx.get(ref);
      if (!snapshot.exists()) return;
      const tokens = snapshot.data().fcmTokens;
      if (Array.isArray(tokens)) tx.update(ref, { fcmTokens: tokens.filter(value => value !== token) });
      else if (tokens) { const updated = { ...tokens }; delete updated[token]; tx.update(ref, { fcmTokens: updated }); }
    });
  } catch {
    // A denied/not-yet-registered iPhone may have no token to read. Successful
    // invalidation below is sufficient even if its profile could not be unlinked.
  }
  await deleteToken(messaging);
}

export function listenForBusinessPushOpens(uid, onOpen, onError = () => {}) {
  if (!uid || !['ios', 'android'].includes(Platform.OS)) return () => {};
  let active = true;
  const seen = new Set();
  const open = data => {
    if (!active || auth.currentUser?.uid !== uid || data?.module !== 'directory'
      || (data.recipientUid && data.recipientUid !== uid)) return;
    const key = data.notificationId;
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    onOpen(data.threadId ? 'business-inbox' : 'business-notifications');
  };
  const messaging = getMessaging();
  const unsubscribe = onNotificationOpenedApp(messaging, message => open(message.data));
  getInitialNotification(messaging).then(message => { if (message) open(message.data); }).catch(onError);
  // Expo still handles local notifications and may own the tap callback on iOS.
  const expo = Notifications.addNotificationResponseReceivedListener(response => open(response.notification.request.content.data));
  return () => { active = false; unsubscribe(); expo.remove(); };
}
