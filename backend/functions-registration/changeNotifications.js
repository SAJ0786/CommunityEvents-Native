'use strict';
const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
const active = user => user && user.active !== false && user.isActive !== false && !user.archivedAt && !user.bannedAt && !user.accountDeletedAt
  && !['inactive', 'archived', 'banned', 'deleted', 'suspended'].includes(user.accountStatus);
const emailValid = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const tokensFor = user => [...new Set((Array.isArray(user.fcmTokens) ? user.fcmTokens : Object.keys(user.fcmTokens || {})).filter(token => typeof token === 'string' && token.trim()))];

// Transactional service notices, not promotional campaigns. Never put answers,
// question text, full addresses or private media in the outbox or message body.
function createChangeNotifications({ db, now = () => new Date(), enabled = () => false, sendEmail, sendPush }) {
  async function expand(changeRef) {
    const change = (await changeRef.get()).data();
    if (!change || change.state !== 'pending') return;
    let query = db.collection('registrationEvents').doc(change.eventId).collection('registrations').orderBy('__name__').limit(50);
    if (change.cursor) query = query.startAfter(change.cursor);
    const page = await query.get();
    await db.runTransaction(async tx => {
      const current = (await tx.get(changeRef)).data();
      if (!current || current.state !== 'pending' || current.cursor !== change.cursor) return;
      // Reread booking state in the transaction so cancellation cannot race queueing.
      const bookings = await Promise.all(page.docs.map(doc => tx.get(doc.ref)));
      for (const booking of bookings) {
        const row = booking.data();
        if (!row || row.status !== 'registered' || !row.submittedAt || row.submittedAt > change.createdAt) continue;
        for (const channel of ['email', 'push']) {
          const jobId = digest(JSON.stringify([changeRef.id, booking.id, channel]));
          tx.set(db.collection('registrationNoticeDeliveries').doc(jobId), {
            changeId: changeRef.id, eventId: change.eventId, uid: booking.id, channel,
            registeredAt: row.submittedAt, state: 'pending', createdAt: now().toISOString(),
          });
        }
      }
      tx.update(changeRef, { cursor: page.docs.at(-1)?.id || change.cursor, state: page.docs.length < 50 ? 'queued' : 'pending' });
    });
  }

  async function deliver(ref) {
    // Claim BEFORE the external call. Ambiguous provider outcomes must not cause
    // duplicate emails. Stale sending jobs become review-required, never auto resent.
    const claimed = await db.runTransaction(async tx => {
      const job = (await tx.get(ref)).data();
      if (!job || job.state !== 'pending') return null;
      const eventRef = db.collection('registrationEvents').doc(job.eventId);
      const change = (await tx.get(db.collection('registrationChanges').doc(job.changeId))).data();
      const event = (await tx.get(eventRef)).data();
      const booking = (await tx.get(eventRef.collection('registrations').doc(job.uid))).data();
      const user = (await tx.get(db.collection('users').doc(job.uid))).data();
      const formOnly = change?.changes?.length === 1 && change.changes[0] === 'form';
      const cancelled = change?.changes?.includes('cancelled');
      const eligible = change && event?.status === (cancelled ? 'cancelled' : 'approved') && active(user) && booking?.status === 'registered'
        && booking.submittedAt === job.registeredAt && booking.submittedAt <= change.createdAt
        && !(formOnly && booking.formVersion >= change.formVersion);
      if (!eligible) { tx.update(ref, { state: 'skipped', reason: 'recipient-or-event-changed' }); return null; }
      const tokens = tokensFor(user);
      if ((job.channel === 'email' && !emailValid(user.email)) || (job.channel === 'push' && !tokens.length)) {
        tx.update(ref, { state: 'skipped', reason: job.channel === 'email' ? 'no-valid-email' : 'no-device-token' }); return null;
      }
      tx.update(ref, { state: 'sending', startedAt: now().toISOString() });
      return { job, change, email: user.email, tokens };
    });
    if (!claimed) return;
    const { job, change } = claimed;
    const form = change.changes.includes('form');
    const cancelled = change.changes.includes('cancelled');
    const notice = {
      title: cancelled ? 'Your registered event has been cancelled' : form ? 'Please review your event registration' : 'Your registered event has changed',
      body: cancelled ? 'The organiser cancelled this event. Your places are no longer reserved. Open the event to view its status or delete your registration answers.' : form ? 'The organiser changed the registration form. Open the event and edit your registration to review your answers and the current terms.' : 'The organiser changed the event date or venue. Open your registered event to review the latest details.',
      eventId: job.eventId, noticeId: ref.id, recipientUid: job.uid,
    };
    try {
      const result = job.channel === 'email' ? await sendEmail(claimed.email, notice) : await sendPush(claimed.tokens, notice);
      await db.runTransaction(async tx => { const current = (await tx.get(ref)).data(); if (current?.state === 'sending') tx.update(ref, {
        state: result?.needsReview ? 'review-required' : 'sent', completedAt: now().toISOString(),
      }); });
    } catch {
      // Includes accepted-provider/failed-writeback ambiguity. Do not log PII/errors
      // from providers (these can include recipient addresses or device tokens).
      await db.runTransaction(async tx => { const current = (await tx.get(ref)).data(); if (current?.state === 'sending') tx.update(ref, { state: 'review-required', reason: 'provider-outcome-uncertain' }); });
    }
  }

  async function tick() {
    if (!enabled()) return { disabled: true };
    // Transport configuration is checked by the production adapter before tick.
    if (typeof sendEmail !== 'function' || typeof sendPush !== 'function') throw Error('Registration notice transports are required.');
    const changes = await db.collection('registrationChanges').where('state', '==', 'pending').limit(5).get();
    for (const change of changes.docs) await expand(change.ref);
    const jobs = await db.collection('registrationNoticeDeliveries').where('state', '==', 'pending').limit(30).get();
    for (const job of jobs.docs) await deliver(job.ref);
    const stale = await db.collection('registrationNoticeDeliveries').where('state', '==', 'sending')
      .where('startedAt', '<=', new Date(now().getTime() - 10 * 60000).toISOString()).limit(30).get();
    for (const item of stale.docs) await db.runTransaction(async tx => {
      const job = (await tx.get(item.ref)).data();
      if (job?.state === 'sending' && job.startedAt <= new Date(now().getTime() - 10 * 60000).toISOString()) tx.update(item.ref, { state: 'review-required', reason: 'interrupted-delivery' });
    });
    return { campaigns: changes.docs.length, deliveries: jobs.docs.length, interrupted: stale.docs.length };
  }
  return { tick, expand, deliver };
}
module.exports = { createChangeNotifications };
