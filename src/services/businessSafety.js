import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';
import { archiveBusinessListing } from './businesses';

const clean = value => String(value || '').trim();
const isAdmin = profile => profile?.role === 'admin' || profile?.role === 'superAdmin';

function asMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export function isBusinessSafetyThread(thread = {}) {
  return ['business-report', 'business-conversation-report', 'business-appeal'].includes(thread.category);
}

export async function setBusinessConversationBlocked({ thread, user, blocked }) {
  if (!user?.uid || !thread?.id || !thread?.participantUids?.includes(user.uid)) {
    throw new Error('This conversation is not available to your account.');
  }
  await updateDoc(doc(db, 'businessMessageThreads', thread.id), {
    [`blockedBy.${user.uid}`]: blocked === true,
    updatedAt: serverTimestamp(),
  });
}

export async function decideBusinessSafetyReport({ thread, user, profile, decision, reason }) {
  if (!user?.uid || !isAdmin(profile)) throw new Error('Administrator access is required.');
  if (!thread?.id || !isBusinessSafetyThread(thread)) throw new Error('Safety report not found.');
  const cleanReason = clean(reason);
  if (cleanReason.length < 10) throw new Error('Add a clear decision reason of at least 10 characters.');
  const allowed = ['under-review', 'dismissed', 'takedown', 'conversation-blocked', 'closed'];
  if (!allowed.includes(decision)) throw new Error('Choose a valid moderation decision.');

  if (decision === 'takedown') {
    if (!thread.businessId) throw new Error('This report is not linked to a business.');
    await archiveBusinessListing(thread.businessId, `Safety report ${thread.id}: ${cleanReason}`);
  }
  if (decision === 'conversation-blocked') {
    if (!thread.reportedThreadId) throw new Error('This report is not linked to a conversation.');
    await updateDoc(doc(db, 'businessMessageThreads', thread.reportedThreadId), {
      adminBlocked: true,
      adminBlockedReason: cleanReason,
      adminBlockedBy: user.uid,
      adminBlockedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const reportRef = doc(db, 'adminFeedbackThreads', thread.id);
  await updateDoc(reportRef, {
    moderationStatus: decision,
    moderationDecision: decision,
    moderationReason: cleanReason,
    moderatedBy: user.uid,
    moderatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'businessModerationAudit'), {
    reportId: thread.id,
    businessId: clean(thread.businessId),
    conversationId: clean(thread.reportedThreadId),
    action: decision,
    reason: cleanReason,
    actorUid: user.uid,
    actorRole: profile.role,
    createdAt: serverTimestamp(),
  });

  if (thread.businessId) {
    const businessSnapshot = await getDoc(doc(db, 'businesses', thread.businessId));
    const business = businessSnapshot.data() || {};
    if (businessSnapshot.exists() && business.ownerId) {
      await addDoc(collection(db, 'businessModerationNotices'), {
        ownerUid: business.ownerId,
        businessId: thread.businessId,
        businessName: clean(business.name) || clean(thread.businessName) || 'Business listing',
        reportId: thread.id,
        decision,
        reason: cleanReason,
        appealStatus: 'not-submitted',
        createdAt: serverTimestamp(),
      });
    }
  }
}

export function listenBusinessModerationNotices(ownerUid, onRows, onError) {
  if (!ownerUid) {
    onRows?.([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'businessModerationNotices'), where('ownerUid', '==', ownerUid)),
    snapshot => onRows?.(
      snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((left, right) => asMillis(right.createdAt) - asMillis(left.createdAt))
    ),
    onError
  );
}

export async function recordBusinessModerationAppeal({ notice, user, text }) {
  const appealText = clean(text);
  if (!user?.uid || notice?.ownerUid !== user.uid) throw new Error('This moderation notice is not available to your account.');
  if (appealText.length < 20) throw new Error('Explain the appeal in at least 20 characters.');
  await updateDoc(doc(db, 'businessModerationNotices', notice.id), {
    appealStatus: 'submitted',
    appealText,
    appealedAt: serverTimestamp(),
    appealedBy: user.uid,
  });
  await addDoc(collection(db, 'businessModerationAudit'), {
    reportId: clean(notice.reportId),
    businessId: clean(notice.businessId),
    action: 'business.appeal_submitted',
    reason: appealText,
    actorUid: user.uid,
    actorRole: 'business-owner',
    createdAt: serverTimestamp(),
  });
}
