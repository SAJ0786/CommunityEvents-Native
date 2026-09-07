const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

admin.initializeApp();
const db = admin.firestore();
const REGION = 'australia-southeast1';
const DEFAULT_CITY = 'sydney';

function city(value) {
  return String(value || DEFAULT_CITY).trim().toLowerCase();
}

function userCity(user = {}) {
  return city(user.adminCity || user.defaultCity);
}

function eventCity(event = {}) {
  return city(event.metroArea || event.city || event.address?.city);
}

function adminCanAccessEvent(caller = {}, event = {}) {
  return caller.role === 'superAdmin' || (caller.role === 'admin' && eventCity(event) === userCity(caller));
}

function adminCanAccessUser(caller = {}, target = {}) {
  return caller.role === 'superAdmin' || (caller.role === 'admin' && userCity(target) === userCity(caller));
}

async function callerProfile(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const snapshot = await db.collection('users').doc(request.auth.uid).get();
  return snapshot.data() || {};
}

exports.archiveEventRecords = onCall({ region: REGION }, async request => {
  const eventId = String(request.data?.eventId || '').trim();
  const seriesId = String(request.data?.seriesId || '').trim();
  if (!eventId && !seriesId) throw new HttpsError('invalid-argument', 'An event or series reference is required.');
  const caller = await callerProfile(request);
  let eventDocs = eventId
    ? [await db.collection('events').doc(eventId).get()]
    : (await db.collection('events').where('seriesId', '==', seriesId).get()).docs;
  if (seriesId && !eventDocs.length) {
    eventDocs = (await db.collection('events').where('recurringSeriesId', '==', seriesId).get()).docs;
  }
  eventDocs = eventDocs.filter(item => item.exists);
  if (!eventDocs.length) throw new HttpsError('not-found', 'No matching active event was found.');
  for (const eventDoc of eventDocs) {
    const data = eventDoc.data() || {};
    const owner = data.createdByUserId === request.auth.uid || data.ownerUid === request.auth.uid;
    if (!owner && !adminCanAccessEvent(caller, data)) throw new HttpsError('permission-denied', 'You cannot archive one or more selected events.');
    if (data.isLive === true) throw new HttpsError('failed-precondition', 'End the live stream before archiving this event.');
  }
  const archivedAt = admin.firestore.Timestamp.now();
  for (let offset = 0; offset < eventDocs.length; offset += 240) {
    const batch = db.batch();
    eventDocs.slice(offset, offset + 240).forEach(eventDoc => {
      batch.set(db.collection('archivedEvents').doc(eventDoc.id), {
        ...eventDoc.data(), status: 'inactive', archivedAt, archivedBy: request.auth.uid,
        archivedFromEventId: eventDoc.id,
        archiveReason: seriesId ? 'series_archived_by_user_or_admin' : 'event_archived_by_user_or_admin',
      }, { merge: true });
      batch.delete(eventDoc.ref);
    });
    await batch.commit();
  }
  if (seriesId) await db.collection('recurringEventSeries').doc(seriesId).set({ status: 'archived', archivedAt, archivedBy: request.auth.uid, updatedAt: archivedAt }, { merge: true });
  return { archived: eventDocs.length };
});

exports.deleteUserData = onCall({ region: REGION }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const uid = request.auth.uid;
  const archiveEventsNow = request.data?.archiveEventsNow === true;
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data() || {};
  if (userData.role === 'superAdmin') {
    const active = await db.collection('users').where('role', '==', 'superAdmin').where('isActive', '==', true).get();
    if (active.size <= 1) throw new HttpsError('failed-precondition', 'Assign another Super Admin before closing this account.');
  }
  const events = await db.collection('events').where('createdByUserId', '==', uid).get();
  if (events.docs.some(item => item.data()?.isLive === true)) throw new HttpsError('failed-precondition', 'End your active live stream before closing your account.');
  const archivedAt = admin.firestore.Timestamp.now();
  if (archiveEventsNow) {
    for (let offset = 0; offset < events.docs.length; offset += 240) {
      const batch = db.batch();
      events.docs.slice(offset, offset + 240).forEach(eventDoc => {
        batch.set(db.collection('archivedEvents').doc(eventDoc.id), { ...eventDoc.data(), status: 'inactive', creatorDeleted: true, accountDeletedAt: archivedAt, archivedAt, archivedFromEventId: eventDoc.id, archiveReason: 'creator_account_deleted' }, { merge: true });
        batch.delete(eventDoc.ref);
      });
      await batch.commit();
    }
  } else {
    for (let offset = 0; offset < events.docs.length; offset += 450) {
      const batch = db.batch();
      events.docs.slice(offset, offset + 450).forEach(eventDoc => batch.update(eventDoc.ref, { creatorDeleted: true, accountDeletedAt: archivedAt }));
      await batch.commit();
    }
  }
  const batch = db.batch();
  batch.set(db.collection('archivedUsers').doc(uid), { ...userData, uid, accountStatus: 'deleted', isActive: false, archivedAt, archivedBy: uid, archiveReason: 'self_service_account_closure' }, { merge: true });
  batch.set(db.collection('users').doc(uid), { accountStatus: 'deleted', isActive: false, accountDeletedAt: archivedAt, archivedAt, archivedBy: uid, updatedAt: archivedAt }, { merge: true });
  batch.set(db.collection('calendarSubscriptions').doc(uid), { active: false, accountStatus: 'deleted', archivedAt, updatedAt: archivedAt }, { merge: true });
  await batch.commit();
  await admin.auth().updateUser(uid, { disabled: true }).catch(error => console.warn('Disable auth failed:', error.message));
  return { archived: true, archivedNow: archiveEventsNow ? events.size : 0, keptUntilExpiry: archiveEventsNow ? 0 : events.size };
});

exports.adminDeleteUser = onCall({ region: REGION }, async request => {
  const caller = await callerProfile(request);
  if (!['admin', 'superAdmin'].includes(caller.role)) throw new HttpsError('permission-denied', 'Admin access required.');
  const targetUid = String(request.data?.targetUid || '').trim();
  const ban = request.data?.ban === true;
  if (!targetUid || targetUid === request.auth.uid) throw new HttpsError('invalid-argument', 'Choose another user.');
  const targetDoc = await db.collection('users').doc(targetUid).get();
  if (!targetDoc.exists) throw new HttpsError('not-found', 'User not found.');
  const target = targetDoc.data() || {};
  if (!adminCanAccessUser(caller, target) || (caller.role === 'admin' && target.role !== 'user')) throw new HttpsError('permission-denied', 'You cannot manage this user.');
  if (target.role === 'superAdmin') {
    const active = await db.collection('users').where('role', '==', 'superAdmin').where('isActive', '==', true).get();
    if (active.size <= 1) throw new HttpsError('failed-precondition', 'Cannot archive the only Super Admin.');
  }
  const events = await db.collection('events').where('createdByUserId', '==', targetUid).get();
  const archivedAt = admin.firestore.Timestamp.now();
  for (let offset = 0; offset < events.docs.length; offset += 240) {
    const batch = db.batch();
    events.docs.slice(offset, offset + 240).forEach(eventDoc => {
      batch.set(db.collection('archivedEvents').doc(eventDoc.id), { ...eventDoc.data(), status: 'inactive', creatorDeleted: true, accountDeletedAt: archivedAt, archivedAt, archivedFromEventId: eventDoc.id, archiveReason: ban ? 'creator_account_banned' : 'creator_account_archived_by_admin', archivedBy: request.auth.uid }, { merge: true });
      batch.delete(eventDoc.ref);
    });
    await batch.commit();
  }
  const accountStatus = ban ? 'banned' : 'deleted';
  const batch = db.batch();
  batch.set(db.collection('archivedUsers').doc(targetUid), { ...target, uid: targetUid, accountStatus, isActive: false, archivedAt, archivedBy: request.auth.uid, archiveReason: ban ? 'admin_ban' : 'admin_account_archive' }, { merge: true });
  batch.set(db.collection('users').doc(targetUid), { accountStatus, isActive: false, archivedAt, archivedBy: request.auth.uid, updatedAt: archivedAt }, { merge: true });
  batch.set(db.collection('calendarSubscriptions').doc(targetUid), { active: false, accountStatus, archivedAt, updatedAt: archivedAt }, { merge: true });
  if (ban && target.email) batch.set(db.collection('bannedUsers').doc(target.email.toLowerCase().replace(/\./g, '_')), { email: target.email.toLowerCase(), bannedAt: archivedAt, bannedBy: request.auth.uid, reason: 'Admin archive with ban', active: true, fullName: target.fullName || '', uid: targetUid, role: target.role || 'user', phone: target.phone || '', phoneVerified: target.phoneVerified || false }, { merge: true });
  await batch.commit();
  await admin.auth().updateUser(targetUid, { disabled: true }).catch(error => console.warn('Disable auth failed:', error.message));
  return { archived: true, eventsArchived: events.size, banned: ban };
});

exports.adminUnbanUser = onCall({ region: REGION }, async request => {
  const caller = await callerProfile(request);
  if (caller.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Super Admin access required.');
  const bannedDocId = String(request.data?.bannedDocId || '').trim();
  const uid = String(request.data?.uid || '').trim();
  if (!bannedDocId || !uid) throw new HttpsError('invalid-argument', 'Ban record and user are required.');
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();
  batch.set(db.collection('bannedUsers').doc(bannedDocId), { active: false, unbannedAt: now, unbannedBy: request.auth.uid }, { merge: true });
  batch.set(db.collection('users').doc(uid), { isActive: true, accountStatus: 'active', unbannedAt: now, unbannedBy: request.auth.uid, updatedAt: now }, { merge: true });
  batch.set(db.collection('archivedUsers').doc(uid), { archiveActive: false, restoredAt: now, restoredBy: request.auth.uid }, { merge: true });
  await batch.commit();
  await admin.auth().updateUser(uid, { disabled: false });
  return { success: true };
});

exports.adminRestoreUser = onCall({ region: REGION }, async request => {
  const caller = await callerProfile(request);
  if (caller.role !== 'superAdmin') throw new HttpsError('permission-denied', 'Super Admin access required.');
  const targetUid = String(request.data?.targetUid || '').trim();
  const target = await db.collection('users').doc(targetUid).get();
  if (!target.exists) throw new HttpsError('not-found', 'Archived user record not found.');
  if (target.data()?.accountStatus === 'banned') throw new HttpsError('failed-precondition', 'Use Unban for a banned account.');
  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();
  batch.set(target.ref, { isActive: true, accountStatus: 'active', restoredAt: now, restoredBy: request.auth.uid, updatedAt: now }, { merge: true });
  batch.set(db.collection('archivedUsers').doc(targetUid), { archiveActive: false, restoredAt: now, restoredBy: request.auth.uid }, { merge: true });
  await batch.commit();
  await admin.auth().updateUser(targetUid, { disabled: false });
  return { restored: true };
});
