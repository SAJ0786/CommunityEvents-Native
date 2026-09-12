import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
  where,
  query,
} from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLLECTION_NAME = 'userNotifications';
const dismissListeners = new Map();
const dismissedKey = uid => `@community-events/dismissed-notifications/${uid}`;

function mapNotification(snapshot) {
  return { id: snapshot.id, ...snapshot.data() };
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function listenUserNotifications(uid, onNotifications, onError) {
  if (!uid) {
    onNotifications?.([]);
    return () => {};
  }

  let rows = [];
  let dismissed = new Set();
  let ready = false;
  let active = true;
  const emit = () => { if (active && ready) onNotifications?.(rows.filter(item => !dismissed.has(item.id))); };
  const refreshDismissed = ids => { dismissed = new Set(ids); ready = true; emit(); };
  if (!dismissListeners.has(uid)) dismissListeners.set(uid, new Set());
  dismissListeners.get(uid).add(refreshDismissed);
  AsyncStorage.getItem(dismissedKey(uid)).then(value => {
    if (!ready) refreshDismissed(JSON.parse(value || '[]'));
  }).catch(() => { ready = true; emit(); });
  const unsubscribe = onSnapshot(
    query(collection(db, COLLECTION_NAME), where('recipientUid', '==', uid)),
    snapshot => {
      rows = snapshot.docs.map(mapNotification).sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));
      emit();
    },
    onError
  );
  return () => { active = false; unsubscribe(); dismissListeners.get(uid)?.delete(refreshDismissed); };
}

export const listenBusinessNotifications = listenUserNotifications;

export async function markBusinessNotificationRead(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(db, COLLECTION_NAME, notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}

export async function clearUserNotifications(notifications = [], uid) {
  if (!uid) return;
  const pending = notifications.filter(item => item?.id && item.read !== true);
  for (let start = 0; start < pending.length; start += 400) {
    const batch = writeBatch(db);
    pending.slice(start, start + 400).forEach(item => batch.update(doc(db, COLLECTION_NAME, item.id), {
      read: true,
      readAt: serverTimestamp(),
    }));
    await batch.commit();
  }
  // Preserve server-side history and moderation evidence. Dismiss on this
  // device, shared by both the drawer and full Notifications page.
  const previous = JSON.parse(await AsyncStorage.getItem(dismissedKey(uid)) || '[]');
  const ids = [...new Set([...previous, ...notifications.map(item => item.id).filter(Boolean)])];
  await AsyncStorage.setItem(dismissedKey(uid), JSON.stringify(ids));
  dismissListeners.get(uid)?.forEach(listener => listener(ids));
}
