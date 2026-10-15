const { createHash, randomUUID } = require('node:crypto');
const GRACE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 8;
function validPath(eventId, path) {
  return typeof eventId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(eventId)
    && typeof path === 'string' && path.startsWith(`registration-private/${eventId}/`)
    && /^[A-Za-z0-9_-]{1,180}$/.test(path.slice(`registration-private/${eventId}/`.length));
}
function cleanupRef(db, path) { return db.collection('registrationPosterCleanup').doc(createHash('sha256').update(path).digest('hex')); }
function enqueuePosterCleanup(db, tx, eventId, path, now) {
  if (!validPath(eventId, path)) return false;
  tx.set(cleanupRef(db, path), { eventId, path, state: 'pending', attempts: 0,
    notBefore: new Date(now.getTime() + GRACE_MS).toISOString(), createdAt: now.toISOString() });
  return true;
}

// Scheduled INTERNAL maintenance, never exported as a callable. Intent is written
// before uploading, so process crashes leave a durable, bounded cleanup job.
function createPosterMaintenance({ db, bucket, now = () => new Date(), enabled = () => false }) {
  return async function sweepRegistrationPosters() {
    if (!enabled()) return { disabled: true };
    const page = await db.collection('registrationPosterCleanup').where('state', '==', 'pending')
      .where('notBefore', '<=', now().toISOString()).orderBy('notBefore').limit(50).get();
    const result = { examined: page.docs.length, removed: 0, retained: 0, deferred: 0, failed: 0 };
    for (const doc of page.docs) {
      const lease = randomUUID();
      const job = await db.runTransaction(async tx => {
        const snapshot = await tx.get(doc.ref); const data = snapshot.data();
        if (!data || data.state !== 'pending' || data.notBefore > now().toISOString()) return null;
        if (!validPath(data.eventId, data.path)) { tx.update(doc.ref, { state: 'failed', error: 'invalid-private-path' }); return { invalid: true }; }
        const venue = await tx.get(db.collection('registrationEventPrivate').doc(data.eventId));
        if (venue.data()?.posterPath === data.path) { tx.delete(doc.ref); return { retained: true }; }
        tx.update(doc.ref, { lease, attempts: (data.attempts || 0) + 1, notBefore: new Date(now().getTime() + 5 * 60 * 1000).toISOString() });
        return data;
      });
      if (!job) continue;
      if (job.invalid) { result.failed++; continue; }
      if (job.retained) { result.retained++; continue; }
      let failed = false;
      try { await bucket.file(job.path).delete({ ignoreNotFound: true }); }
      catch { failed = true; }
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(doc.ref); const current = snapshot.data();
        if (!current || current.lease !== lease) return;
        if (!failed) { tx.delete(doc.ref); return; }
        const exhausted = current.attempts >= MAX_ATTEMPTS;
        tx.update(doc.ref, { state: exhausted ? 'failed' : 'pending', error: 'storage-delete-failed',
          notBefore: new Date(now().getTime() + Math.min(24 * 60, 5 * 2 ** current.attempts) * 60000).toISOString() });
      });
      if (failed && (job.attempts || 0) + 1 >= MAX_ATTEMPTS) result.failed++;
      else if (failed) result.deferred++;
      else result.removed++;
    }
    return result;
  };
}
module.exports = { createPosterMaintenance, enqueuePosterCleanup, validPath, GRACE_MS };
