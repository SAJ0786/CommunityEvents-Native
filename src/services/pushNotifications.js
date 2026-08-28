import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { arrayUnion, doc, serverTimestamp, updateDoc } from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';

export const BUSINESS_ALERT_CHANNEL_ID = 'business-alerts';
const TOKEN_FETCH_TIMEOUT_MS = 20000;
const TOKEN_RETRY_DELAYS_MS = [0, 2000, 5000, 10000];

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error('Firebase push-token registration timed out.');
        error.code = 'push-token-timeout';
        reject(error);
      }, milliseconds);
    }),
  ]);
}

async function ensureBusinessAlertChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(BUSINESS_ALERT_CHANNEL_ID, {
    name: 'Business Directory alerts',
    description: 'Business submissions, requested changes, approvals and promotions.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: '#129182',
    sound: 'default',
  });
}

async function saveAndroidFcmToken(uid, token) {
  const cleanToken = String(token || '').trim();
  if (!uid || !cleanToken || Platform.OS !== 'android') return null;
  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayUnion(cleanToken),
    pushTokenPlatform: Platform.OS,
    pushTokenUpdatedAt: serverTimestamp(),
  });
  return cleanToken;
}

export async function registerDevicePushNotifications(uid) {
  if (!uid) return null;
  await ensureBusinessAlertChannel();
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === 'granted'
    ? current
    : await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return null;

  // Android returns the Firebase Cloud Messaging token. It is saved against
  // the signed-in user so Cloud Functions can deliver alerts directly through
  // Firebase without exposing any server credentials in the APK.
  if (Platform.OS !== 'android') return null;
  let lastError = null;
  for (const delay of TOKEN_RETRY_DELAYS_MS) {
    if (delay) await wait(delay);
    try {
      const deviceToken = await withTimeout(
        Notifications.getDevicePushTokenAsync(),
        TOKEN_FETCH_TIMEOUT_MS,
      );
      return await saveAndroidFcmToken(uid, deviceToken?.data);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Firebase push-token registration failed.');
}

export function listenForDevicePushTokenChanges(uid) {
  if (!uid || Platform.OS !== 'android') return () => {};
  const subscription = Notifications.addPushTokenListener(token => {
    saveAndroidFcmToken(uid, token?.data).catch(() => {});
  });
  return () => subscription.remove();
}
