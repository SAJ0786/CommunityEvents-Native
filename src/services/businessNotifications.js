import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
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

export function listenBusinessNotifications(uid, onNotifications, onError) {
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

export async function markBusinessNotificationRead(notificationId) {
  if (!notificationId) return;
  await updateDoc(doc(db, COLLECTION_NAME, notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}
