import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  where,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { db, functions } from '../firebase/firebase';
import { DEFAULT_CITY, normalizeCity } from '../utils/cities';
import { newSupportReference, submitSupportRequest } from './support';


const clean = value => String(value || '').trim();
const compact = arr => [...new Set((arr || []).filter(Boolean))];

const asMillis = value => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const sortByUpdatedDesc = rows =>
  [...rows].sort((a, b) => asMillis(b.updatedAt || b.createdAt) - asMillis(a.updatedAt || a.createdAt));

export const isAdminRole = role => role === 'admin' || role === 'superAdmin';
export const isSuperAdminRole = role => role === 'superAdmin';
export const getAdminCity = profile => normalizeCity(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);

export const getSenderName = (user, profile) =>
  clean(profile?.fullName) || clean(user?.displayName) || clean(user?.email) || 'Community member';

export const getEventHostUid = event =>
  clean(event?.createdByUserId || event?.ownerUid || event?.createdByUid || event?.userId);

export async function sendHostMessage({ event, user, profile, text }) {
  const messageText = clean(text);
  const hostUid = getEventHostUid(event);
  if (!user?.uid || user.isAnonymous) throw new Error('Please sign in to contact the host.');
  if (!messageText) throw new Error('Please write a message first.');
  if (messageText.length > 2000) throw new Error('Please keep the message under 2000 characters.');
  if (!event?.id) throw new Error('This event does not have a host inbox.');
  if (!hostUid) throw new Error('This event has no linked host account. A private host message cannot be delivered.');
  if (hostUid === user.uid) throw new Error('This event is already managed by you.');

  const senderUid = user.uid;
  const threadId = `${event.id}_${senderUid}_${hostUid}`;
  const threadRef = doc(db, 'hostMessageThreads', threadId);
  const senderName = getSenderName(user, profile);
  const eventTitle = `${event.eventTypeDisplay || event.eventType || 'Event'} - ${event.hostName || 'Host'}`;
  const city = normalizeCity(event.metroArea || DEFAULT_CITY);

  const messageRef = doc(collection(threadRef, 'messages'));
  const batch = writeBatch(db);
  batch.set(threadRef, {
    type: 'host',
    eventId: event.id,
    eventTitle,
    eventDate: event.eventDate || '',
    eventCity: city,
    hostUid,
    hostName: clean(event.createdByName) || clean(event.hostName) || 'Host',
    senderUid,
    senderName,
    participantUids: compact([senderUid, hostUid]),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: messageText,
    lastSenderUid: senderUid,
    unreadBy: { [hostUid]: increment(1), [senderUid]: 0 },
  }, { merge: true });
  batch.set(messageRef, {
    senderUid,
    senderName,
    text: messageText,
    kind: 'text',
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function sendHostReply({ thread, user, profile, text }) {
  const messageText = clean(text);
  if (!user?.uid) throw new Error('Please sign in to reply.');
  if (!thread?.id) throw new Error('Message thread not found.');
  if (!messageText) throw new Error('Please write a reply first.');
  if (messageText.length > 2000) throw new Error('Please keep the reply under 2000 characters.');
  const participants = thread.participantUids || [];
  if (!participants.includes(user.uid)) throw new Error('You cannot reply to this message.');
  const recipientUid = participants.find(uid => uid !== user.uid);
  const threadRef = doc(db, 'hostMessageThreads', thread.id);
  const senderName = getSenderName(user, profile);

  const batch = writeBatch(db);
  batch.set(doc(collection(threadRef, 'messages')), {
    senderUid: user.uid,
    senderName,
    text: messageText,
    kind: 'text',
    createdAt: serverTimestamp(),
  });
  batch.update(threadRef, {
    updatedAt: serverTimestamp(),
    lastMessage: messageText,
    lastSenderUid: user.uid,
    [`unreadBy.${user.uid}`]: 0,
    ...(recipientUid ? { [`unreadBy.${recipientUid}`]: increment(1) } : {}),
  });
  await batch.commit();
}

export async function sendBusinessMessage({ business, user, profile, text }) {
  const messageText = clean(text);
  if (!user?.uid || user.isAnonymous) throw new Error('Please sign in to contact this business.');
  if (!business?.id) throw new Error('This business does not have an in-app contact inbox yet.');
  if (!messageText) throw new Error('Please write a message first.');
  if (messageText.length > 2000) throw new Error('Please keep the message under 2000 characters.');
  const senderName = getSenderName(user, profile);
  try {
    const callable = httpsCallable(functions, 'sendBusinessEnquiry');
    const result = await callable({ businessId: business.id, text: messageText, senderName });
    return result.data || {};
  } catch (error) {
    const code = String(error?.code || '');
    if (code.includes('not-found') || code.includes('failed-precondition') || code.includes('permission-denied')) {
      throw new Error('This business does not have an active in-app contact inbox yet. Please use its listed phone, website or WhatsApp option.');
    }
    throw new Error(error?.message || 'The message could not be sent. Please try again.');
  }
}

export function listenBusinessThreads(uid, callback, onError) {
  if (!uid) return () => callback([]);
  const q = query(collection(db, 'businessMessageThreads'), where('participantUids', 'array-contains', uid));
  return onSnapshot(q, snap => callback(sortByUpdatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })))), error => {
    console.error('[listenBusinessThreads]', error);
    onError?.(error);
  });
}

export async function sendBusinessReply({ thread, user, profile, text }) {
  const messageText = clean(text);
  if (!user?.uid || !thread?.participantUids?.includes(user.uid)) throw new Error('You cannot reply to this business conversation.');
  if (thread.adminBlocked === true || Object.values(thread.blockedBy || {}).some(Boolean)) {
    throw new Error('This conversation is blocked. Unblock it before sending another message.');
  }
  if (!messageText) throw new Error('Please write a reply first.');
  const recipientUid = thread.participantUids.find(uid => uid !== user.uid);
  if (messageText.length > 2000) throw new Error('Please keep the reply under 2000 characters.');
  const threadRef = doc(db, 'businessMessageThreads', thread.id);
  const senderName = getSenderName(user, profile);
  const batch = writeBatch(db);
  batch.set(doc(collection(threadRef, 'messages')), { senderUid: user.uid, senderName, text: messageText, kind: 'text', createdAt: serverTimestamp() });
  batch.update(threadRef, { updatedAt: serverTimestamp(), lastMessage: messageText, lastSenderUid: user.uid, [`unreadBy.${user.uid}`]: 0, ...(recipientUid ? { [`unreadBy.${recipientUid}`]: increment(1) } : {}) });
  await batch.commit();
}

export async function markBusinessThreadRead(threadId, uid) {
  if (threadId && uid) await updateDoc(doc(db, 'businessMessageThreads', threadId), { [`unreadBy.${uid}`]: 0 });
}

export function listenHostThreads(uid, callback, onError) {
  if (!uid) return () => callback([]);
  const q = query(collection(db, 'hostMessageThreads'), where('participantUids', 'array-contains', uid));
  return onSnapshot(q, snap => {
    callback(sortByUpdatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, error => {
    console.error('[listenHostThreads]', error);
    onError?.(error);
  });
}

export async function markHostThreadRead(threadId, uid) {
  if (!threadId || !uid) return;
  await updateDoc(doc(db, 'hostMessageThreads', threadId), { [`unreadBy.${uid}`]: 0 });
}

// Compatibility for older report/appeal entry points: email, never a feedback inbox.
export async function sendFeedbackMessage({ user, profile, text, category = 'feedback', businessId = '', subject = '' }) {
  return submitSupportRequest({
    requestId: newSupportReference(),
    kind: businessId && category !== 'business-appeal' ? 'business-report' : 'app-feedback',
    businessId, category: 'Other',
    senderName: getSenderName(user, profile),
    senderEmail: clean(profile?.email || user?.email),
    message: [subject, clean(text)].filter(Boolean).join('\n\n'),
  });
}

export function listenThreadMessages(collectionName, threadId, callback, onError) {
  if (!threadId) return () => {};
  const q = query(collection(db, collectionName, threadId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), error => {
    console.error('[listenThreadMessages]', error);
    onError?.(error);
  });
}
