import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';
import { DEFAULT_CITY, cityLabel, normalizeCity } from '../utils/cities';

const GUEST_ID_KEY = '@community-events/feedback-guest-id';

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
  if (!user?.uid) throw new Error('Please sign in to contact the host.');
  if (!messageText) throw new Error('Please write a message first.');
  if (messageText.length > 2000) throw new Error('Please keep the message under 2000 characters.');
  if (!event?.id) throw new Error('This event does not have a host inbox.');
  if (!hostUid) {
    const fallbackTitle = `${event.eventTypeDisplay || event.eventType || 'Event'} - ${event.hostName || 'Host'}`;
    await sendFeedbackMessage({
      user,
      profile,
      city: normalizeCity(event.metroArea || DEFAULT_CITY),
      target: 'cityAdmins',
      text: `Host contact request for ${fallbackTitle}${event.eventDate ? ` on ${event.eventDate}` : ''}:\n\n${messageText}`,
    });
    return;
  }
  if (hostUid === user.uid) throw new Error('This event is already managed by you.');

  const senderUid = user.uid;
  const threadId = `${event.id}_${senderUid}_${hostUid}`;
  const threadRef = doc(db, 'hostMessageThreads', threadId);
  const senderName = getSenderName(user, profile);
  const eventTitle = `${event.eventTypeDisplay || event.eventType || 'Event'} - ${event.hostName || 'Host'}`;
  const city = normalizeCity(event.metroArea || DEFAULT_CITY);

  await setDoc(threadRef, {
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
  }, { merge: true });

  await addDoc(collection(threadRef, 'messages'), {
    senderUid,
    senderName,
    text: messageText,
    kind: 'text',
    createdAt: serverTimestamp(),
  });

  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(),
    lastMessage: messageText,
    lastSenderUid: senderUid,
    [`unreadBy.${hostUid}`]: increment(1),
    [`unreadBy.${senderUid}`]: 0,
  });
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

  await addDoc(collection(threadRef, 'messages'), {
    senderUid: user.uid,
    senderName,
    text: messageText,
    kind: 'text',
    createdAt: serverTimestamp(),
  });
  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(),
    lastMessage: messageText,
    lastSenderUid: user.uid,
    [`unreadBy.${user.uid}`]: 0,
    ...(recipientUid ? { [`unreadBy.${recipientUid}`]: increment(1) } : {}),
  });
}

export async function sendBusinessMessage({ business, user, profile, text }) {
  const messageText = clean(text);
  if (!user?.uid || user.isAnonymous) throw new Error('Please sign in to contact this business.');
  if (!business?.id) throw new Error('This business does not have an in-app contact inbox yet.');
  const routeSnapshot = await getDoc(doc(db, 'businessContactRoutes', business.id));
  const ownerUid = clean(routeSnapshot.data()?.ownerUid);
  if (!routeSnapshot.exists() || routeSnapshot.data()?.active !== true || !ownerUid) {
    throw new Error('This business does not have an in-app contact inbox yet.');
  }
  if (ownerUid === user.uid) throw new Error('This business listing is already managed by you.');
  if (!messageText) throw new Error('Please write a message first.');
  if (messageText.length > 2000) throw new Error('Please keep the message under 2000 characters.');
  const senderUid = user.uid;
  const threadId = `${business.id}_${senderUid}_${ownerUid}`;
  const threadRef = doc(db, 'businessMessageThreads', threadId);
  const senderName = getSenderName(user, profile);
  await setDoc(threadRef, {
    type: 'business', businessId: business.id, businessName: clean(business.name), ownerUid,
    senderUid, senderName, participantUids: compact([senderUid, ownerUid]), createdAt: serverTimestamp(),
  }, { merge: true });
  await addDoc(collection(threadRef, 'messages'), { senderUid, senderName, text: messageText, kind: 'text', createdAt: serverTimestamp() });
  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(), lastMessage: messageText, lastSenderUid: senderUid,
    [`unreadBy.${ownerUid}`]: increment(1), [`unreadBy.${senderUid}`]: 0,
  });
}

export function listenBusinessThreads(uid, callback) {
  if (!uid) return () => callback([]);
  const q = query(collection(db, 'businessMessageThreads'), where('participantUids', 'array-contains', uid));
  return onSnapshot(q, snap => callback(sortByUpdatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })))), () => callback([]));
}

export async function sendBusinessReply({ thread, user, profile, text }) {
  const messageText = clean(text);
  if (!user?.uid || !thread?.participantUids?.includes(user.uid)) throw new Error('You cannot reply to this business conversation.');
  if (!messageText) throw new Error('Please write a reply first.');
  const recipientUid = thread.participantUids.find(uid => uid !== user.uid);
  const threadRef = doc(db, 'businessMessageThreads', thread.id);
  const senderName = getSenderName(user, profile);
  await addDoc(collection(threadRef, 'messages'), { senderUid: user.uid, senderName, text: messageText, kind: 'text', createdAt: serverTimestamp() });
  await updateDoc(threadRef, { updatedAt: serverTimestamp(), lastMessage: messageText, lastSenderUid: user.uid, [`unreadBy.${user.uid}`]: 0, ...(recipientUid ? { [`unreadBy.${recipientUid}`]: increment(1) } : {}) });
}

export async function markBusinessThreadRead(threadId, uid) {
  if (threadId && uid) await updateDoc(doc(db, 'businessMessageThreads', threadId), { [`unreadBy.${uid}`]: 0 });
}

export function listenHostThreads(uid, callback) {
  if (!uid) return () => callback([]);
  const q = query(collection(db, 'hostMessageThreads'), where('participantUids', 'array-contains', uid));
  return onSnapshot(q, snap => {
    callback(sortByUpdatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, error => {
    console.error('[listenHostThreads]', error);
    callback([]);
  });
}

export async function markHostThreadRead(threadId, uid) {
  if (!threadId || !uid) return;
  await updateDoc(doc(db, 'hostMessageThreads', threadId), { [`unreadBy.${uid}`]: 0 });
}

async function guestId() {
  try {
    const existing = await AsyncStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const value = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await AsyncStorage.setItem(GUEST_ID_KEY, value);
    return value;
  } catch {
    return `guest_${Date.now()}`;
  }
}

export async function sendFeedbackMessage({
  user,
  profile,
  text,
  city = DEFAULT_CITY,
  target = 'cityAdmins',
  module = 'events',
  category = 'feedback',
  subject = '',
  businessId = '',
  businessName = '',
}) {
  const messageText = clean(text);
  if (!messageText) throw new Error('Please write your message first.');
  if (messageText.length > 2500) throw new Error('Please keep the message under 2500 characters.');

  const safeTarget = target === 'superAdmins' ? 'superAdmins' : 'cityAdmins';
  const safeCity = normalizeCity(city || profile?.defaultCity || DEFAULT_CITY);
  const safeModule = module === 'business' ? 'business' : 'events';
  const safeCategory = clean(category) || 'feedback';
  const senderUid = user?.uid && !user?.isAnonymous ? user.uid : null;
  const senderGuestId = senderUid ? null : await guestId();
  const senderName = senderUid ? getSenderName(user, profile) : 'Guest user';
  const routePrefix = safeModule === 'events' && safeCategory === 'feedback'
    ? `${safeTarget}_${safeCity}`
    : `${safeModule}_${safeCategory.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}_${safeTarget}_${safeCity}`;
  const threadId = senderUid
    ? `${routePrefix}_${senderUid}`
    : `${routePrefix}_${senderGuestId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const threadRef = doc(db, 'adminFeedbackThreads', threadId);
  const unreadField = safeTarget === 'superAdmins' ? 'unreadForSuperAdmins' : 'unreadForCityAdmins';
  const existing = senderUid ? await getDoc(threadRef) : null;

  await setDoc(threadRef, {
    type: 'feedback',
    module: safeModule,
    category: safeCategory,
    subject: clean(subject),
    businessId: clean(businessId),
    businessName: clean(businessName),
    target: safeTarget,
    city: safeCity,
    cityLabel: cityLabel(safeCity),
    senderUid,
    senderGuestId,
    senderName,
    senderEmail: clean(user?.email || profile?.email || profile?.emailAddress),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: messageText,
    lastSenderUid: senderUid || senderGuestId,
    [unreadField]: existing?.exists() ? increment(1) : 1,
    ...(senderUid ? { [`unreadBy.${senderUid}`]: 0 } : {}),
  }, { merge: true });

  await addDoc(collection(threadRef, 'messages'), {
    senderUid,
    senderGuestId,
    senderName,
    text: messageText,
    kind: 'text',
    createdAt: serverTimestamp(),
  });
}

export async function sendFeedbackReply({ thread, user, profile, text }) {
  const messageText = clean(text);
  if (!user?.uid) throw new Error('Please sign in to reply.');
  if (!thread?.id) throw new Error('Feedback thread not found.');
  if (!messageText) throw new Error('Please write a reply first.');
  const senderIsReplying = thread.senderUid === user.uid;
  const adminIsReplying = isAdminRole(profile?.role) && (
    isSuperAdminRole(profile?.role)
    || (thread.target === 'cityAdmins' && thread.city === getAdminCity(profile))
  );
  if (!senderIsReplying && !adminIsReplying) throw new Error('You cannot reply to this conversation.');

  const threadRef = doc(db, 'adminFeedbackThreads', thread.id);
  const senderName = getSenderName(user, profile);

  await addDoc(collection(threadRef, 'messages'), {
    senderUid: user.uid,
    senderName,
    text: messageText,
    kind: 'text',
    createdAt: serverTimestamp(),
  });

  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(),
    lastMessage: messageText,
    lastSenderUid: user.uid,
    [thread.target === 'superAdmins' ? 'unreadForSuperAdmins' : 'unreadForCityAdmins']: senderIsReplying ? increment(1) : 0,
    ...(thread.senderUid ? { [`unreadBy.${thread.senderUid}`]: senderIsReplying ? 0 : increment(1) } : {}),
  });
}

export async function sendFeedbackReaction({ thread, user, profile, reaction }) {
  const safeReaction = clean(reaction);
  if (!user?.uid) throw new Error('Please sign in to react.');
  if (!thread?.id) throw new Error('Feedback thread not found.');
  if (!['Like', 'Love', 'Unlike'].includes(safeReaction)) throw new Error('Reaction not available.');

  const isAdminParticipant = isAdminRole(profile?.role) && (
    isSuperAdminRole(profile?.role) ||
    (thread.target === 'cityAdmins' && thread.city === getAdminCity(profile))
  );
  const isSenderParticipant = thread.senderUid === user.uid;
  if (!isAdminParticipant && !isSenderParticipant) throw new Error('You cannot react to this feedback.');

  const senderName = getSenderName(user, profile);
  const text = safeReaction === 'Like'
    ? 'Liked this message'
    : safeReaction === 'Love'
      ? 'Loved this message'
      : 'Marked this message as not liked';
  const unreadField = thread.target === 'superAdmins' ? 'unreadForSuperAdmins' : 'unreadForCityAdmins';
  const adminIsReactingToOwnQueue = (thread.target === 'superAdmins' && isSuperAdminRole(profile?.role))
    || (thread.target === 'cityAdmins' && profile?.role === 'admin');
  const threadRef = doc(db, 'adminFeedbackThreads', thread.id);

  await addDoc(collection(threadRef, 'messages'), {
    senderUid: user.uid,
    senderName,
    text,
    reaction: safeReaction,
    kind: 'reaction',
    createdAt: serverTimestamp(),
  });

  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(),
    lastMessage: text,
    lastSenderUid: user.uid,
    [unreadField]: adminIsReactingToOwnQueue ? 0 : increment(1),
    ...(thread.senderUid ? { [`unreadBy.${thread.senderUid}`]: isSenderParticipant ? 0 : increment(1) } : {}),
  });
}

export async function markFeedbackThreadRead(thread, user, profile) {
  if (!thread?.id) return;
  const updates = {};
  if (user?.uid && thread.senderUid === user.uid) updates[`unreadBy.${user.uid}`] = 0;
  if (isSuperAdminRole(profile?.role) && thread.target === 'superAdmins') updates.unreadForSuperAdmins = 0;
  if (profile?.role === 'admin' && thread.target === 'cityAdmins') updates.unreadForCityAdmins = 0;
  if (Object.keys(updates).length) await updateDoc(doc(db, 'adminFeedbackThreads', thread.id), updates);
}

export function listenThreadMessages(collectionName, threadId, callback) {
  if (!threadId) return () => {};
  const q = query(collection(db, collectionName, threadId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))), error => {
    console.error('[listenThreadMessages]', error);
    callback([]);
  });
}

export function listenAdminFeedbackThreads(profile, callback) {
  if (!isAdminRole(profile?.role)) return () => callback([]);
  const base = collection(db, 'adminFeedbackThreads');
  const q = isSuperAdminRole(profile?.role)
    ? query(base)
    : query(base, where('target', '==', 'cityAdmins'), where('city', '==', getAdminCity(profile)));
  return onSnapshot(q, snap => callback(sortByUpdatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => !isBusinessSupportThread(item)))), error => {
    console.error('[listenAdminFeedbackThreads]', error);
    callback([]);
  });
}

export function listenOwnFeedbackThreads(uid, callback) {
  if (!uid) return () => callback([]);
  const q = query(collection(db, 'adminFeedbackThreads'), where('senderUid', '==', uid));
  return onSnapshot(q, snap => callback(sortByUpdatedDesc(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => !isBusinessSupportThread(item)))), error => {
    console.error('[listenOwnFeedbackThreads]', error);
    callback([]);
  });
}

export function isBusinessSupportThread(thread = {}) {
  const message = clean(thread.lastMessage).toUpperCase();
  return thread.module === 'business'
    || message.startsWith('BUSINESS REPORT')
    || message.startsWith('BUSINESS DIRECTORY CONTACT');
}

export function listenBusinessSupportThreads(user, profile, callback) {
  if (!user?.uid || user.isAnonymous) return () => callback([]);
  const base = collection(db, 'adminFeedbackThreads');
  const q = isSuperAdminRole(profile?.role)
    ? query(base)
    : profile?.role === 'admin'
      ? query(base, where('target', '==', 'cityAdmins'), where('city', '==', getAdminCity(profile)))
      : query(base, where('senderUid', '==', user.uid));
  return onSnapshot(q, snap => callback(sortByUpdatedDesc(
    snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isBusinessSupportThread)
  )), error => {
    console.error('[listenBusinessSupportThreads]', error);
    callback([]);
  });
}
