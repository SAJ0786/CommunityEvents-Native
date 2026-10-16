'use strict';
const { localMinute } = require('./registration');
const { enqueuePosterCleanup } = require('./posterMaintenance');
const deleted = profile => !profile || profile.accountStatus === 'deleted' || Boolean(profile.accountDeletedAt);
// Bounded resumable cleanup for registration data only. The existing account
// lifecycle remains responsible for Auth, legacy events and non-registration data.
function createAccountCleanup({ db, now = () => new Date(), enabled = () => false }) {
  async function enqueue(uid) {
    if (!enabled()) return;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('Invalid account reference');
    await db.runTransaction(async tx => {
      const user = (await tx.get(db.collection('users').doc(uid))).data();
      const ref = db.collection('registrationAccountCleanup').doc(uid);
      const job = (await tx.get(ref)).data();
      if (!deleted(user) || job) return;
      tx.set(ref, { state: 'pending', phase: 'hosted', cursor: null, createdAt: now().toISOString() });
    });
  }
  async function process(ref) {
    const job = (await ref.get()).data();
    if (!job || job.state !== 'pending') return;
    const uid = ref.id; const userRef = db.collection('users').doc(uid);
    let query = job.phase === 'hosted' ? db.collection('registrationEvents').where('ownerUid', '==', uid)
      : job.phase === 'attendee' ? db.collection('registrationMemberEvents').doc(uid).collection('events')
      : db.collection('registrationTemplates').doc(uid).collection('items');
    query = query.orderBy('__name__').limit(25);
    if (job.cursor) query = query.startAfter(job.cursor);
    const page = await query.get();
    for (const item of page.docs) {
      await db.runTransaction(async tx => {
        if (!deleted((await tx.get(userRef)).data())) return;
        if (job.phase === 'hosted') {
          const event = (await tx.get(item.ref)).data();
          if (!event || event.ownerUid !== uid) return;
          const pendingRef = db.collection('registrationPendingChanges').doc(item.id);
          const pending = (await tx.get(pendingRef)).data();
          if (event.status === 'cancelled' || event.date < localMinute(now(), event.timeZone).slice(0, 10)) {
            if (pending) {
              tx.delete(pendingRef);
              tx.update(item.ref, { hasPendingChanges: false });
              if (pending.privateDetails.posterPath) enqueuePosterCleanup(db, tx, item.id, pending.privateDetails.posterPath, now());
            }
            return;
          }
          const revision = event.revision + 1; const timestamp = now().toISOString();
          tx.update(item.ref, { status: 'cancelled', revision, reservedPlaces: 0, cancelledAt: timestamp, cancellationReason: 'organiser-account-deleted', hasPendingChanges: false });
          tx.delete(pendingRef);
          if (pending?.privateDetails.posterPath) enqueuePosterCleanup(db, tx, item.id, pending.privateDetails.posterPath, now());
          if (event.registrationCount > 0) tx.set(db.collection('registrationChanges').doc(`${item.id}-${revision}`), {
            eventId: item.id, revision, formVersion: event.formVersion, changes: ['cancelled'], createdAt: timestamp, state: 'pending', cursor: null,
          });
        } else if (job.phase === 'attendee') {
          if (!(await tx.get(item.ref)).exists) return;
          const eventRef = db.collection('registrationEvents').doc(item.id);
          const bookingRef = eventRef.collection('registrations').doc(uid);
          const event = (await tx.get(eventRef)).data(); const booking = (await tx.get(bookingRef)).data();
          if (booking) {
            // Replace, never merge: remove answers AND original question snapshots.
            tx.set(bookingRef, { eventId: item.id, registrationId: uid, uid, status: 'cancelled', places: 0,
              revision: (booking.revision || 0) + 1, answersDeletedAt: now().toISOString(), deletionReason: 'account-deleted' });
            if (event && booking.status === 'registered') tx.update(eventRef, {
              reservedPlaces: event.status === 'cancelled' ? 0 : Math.max(0, event.reservedPlaces - booking.places),
              registrationCount: Math.max(0, event.registrationCount - 1),
            });
          }
          tx.delete(item.ref);
        } else tx.delete(item.ref);
      });
    }
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data(); const user = (await tx.get(userRef)).data();
      if (current?.state !== 'pending' || current.phase !== job.phase || current.cursor !== job.cursor) return;
      if (!deleted(user)) { tx.update(ref, { state: 'stopped-account-active' }); return; }
      if (page.docs.length === 25) tx.update(ref, { cursor: page.docs.at(-1).id });
      else if (job.phase === 'hosted') tx.update(ref, { phase: 'attendee', cursor: null });
      else if (job.phase === 'attendee') tx.update(ref, { phase: 'templates', cursor: null });
      else tx.update(ref, { state: 'complete', completedAt: now().toISOString() });
    });
  }
  async function tick() {
    if (!enabled()) return { disabled: true };
    const page = await db.collection('registrationAccountCleanup').where('state', '==', 'pending').limit(5).get();
    for (const job of page.docs) await process(job.ref);
    return { jobs: page.docs.length };
  }
  return { enqueue, tick };
}
module.exports = { createAccountCleanup, deleted };
