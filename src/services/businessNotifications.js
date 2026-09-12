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

const COLLECTION_NAME = 'userNotifications';

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

  return onSnapshot(
    query(collection(db, COLLECTION_NAME), where('recipientUid', '==', uid)),
    snapshot => onNotifications?.(
      snapshot.docs.map(mapNotification).sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt))
    ),
    onError
  );
}

export const listenBusinessNotifications = listenUserNotifications;

export async function markBusinessNotificationRead(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(db, COLLECTION_NAME, notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}

export async function clearUserNotifications(notifications = []) {
  const pending = notifications.filter(item => item?.id && item.read !== true);
  if (!pending.length) return;
  const batch = writeBatch(db);
  pending.forEach(item => batch.update(doc(db, COLLECTION_NAME, item.id), {
    read: true,
    readAt: serverTimestamp(),
  }));
  await batch.commit();
}
