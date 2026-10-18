'use strict';
const { createHash } = require('node:crypto');
const keyFor = value => createHash('sha256').update(String(value)).digest('hex');
async function queueEmail(db, key, uid, message, required = false, category = 'events') {
  const ref = db.collection('eventEmailOutbox').doc(keyFor(key));
  // Only trusted server templates enter this collection. Recipients never share envelopes.
  const value = { uid, required, category, state: 'pending', message: Object.fromEntries(Object.entries(message).filter(([key]) => ['subject', 'html', 'text', 'to', 'replyTo'].includes(key))), queuedAt: Date.now() };
  try { await ref.create(value); } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
  return { queued: true, reference: ref.id };
}
function register(deps = {}) {
  const admin = deps.admin || require('firebase-admin'), db = deps.db || admin.firestore();
  const { onDocumentCreated } = deps.triggers || require('firebase-functions/v2/firestore');
  const { onSchedule } = deps.scheduler || require('firebase-functions/v2/scheduler');
  const { defineSecret } = deps.params || require('firebase-functions/params');
  const { sendEventEmail } = require('./email-layout');
  const { active, optionalEmail } = require('./notification-matrix');
  const secrets = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].map(name => defineSecret(name));
  const deliverQueuedEventEmail = onDocumentCreated({ document: 'eventEmailOutbox/{id}', region: 'australia-southeast1', secrets, retry: true, timeoutSeconds: 120, maxInstances: 5, concurrency: 1 }, async event => {
    const ref = event.data.ref;
    const config = Object.fromEntries(secrets.map(secret => [secret.name, secret.value()]));
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) throw Error('SMTP unavailable; no send attempted');
    const mailer = (deps.nodemailer || require('nodemailer')).createTransport({ host: config.SMTP_HOST, port: Number(config.SMTP_PORT || 587), secure: Number(config.SMTP_PORT) === 465,
      connectionTimeout: 10000, socketTimeout: 15000, auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } });
    const job = await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data(); if (data?.state !== 'pending') return null;
      const user = data.uid ? (await tx.get(db.collection('users').doc(data.uid))).data() : null;
      if (data.uid && (!active(user, data.uid) || user.emailDisabledByBounce || ['bounced','complained','suppressed'].includes(user.emailStatus) || (!data.required && (data.category === 'events' ? !optionalEmail(user) : data.category === 'admin' ? user.adminAlertEmailEnabled === false : user.emailNotificationsEnabled === false || user.businessNotificationsEnabled === false))
        || String(user.email || '').toLowerCase() !== String(data.message.to || '').toLowerCase())) {
        tx.update(ref, { state: 'skipped', reason: 'recipient-or-preferences-changed' }); return null;
      }
      tx.update(ref, { state: 'sending', startedAt: Date.now() }); return data;
    });
    if (!job) return;
    try {
      const formatted = job.module === 'directory' ? require('./email-template').buildWorkflowEmail({ title: job.message.subject, body: job.message.text }) : null;
      const envelope = { ...job.message, from: { name: 'Community Connect Australia', address: 'support@siza.info' }, replyTo: 'support@siza.info', messageId: `<${event.params.id}@siza.info>` };
      const result = formatted ? await mailer.sendMail({ ...envelope, ...formatted }) : await sendEventEmail(mailer, { ...job.message, from: { name: 'Community Connect Australia', address: 'support@siza.info' }, messageId: `<${event.params.id}@siza.info>` });
      if (!result.accepted?.length) throw Error('Provider did not confirm recipient acceptance');
      await ref.update({ state: 'accepted', acceptedAt: Date.now(), messageId: String(result.messageId || '') });
    } catch (error) {
      // No blind resend after SMTP ambiguity, including failed acceptance writeback.
      const attempts = Number(job.attempts || 0) + 1;
      if ([421, 450, 451, 452].includes(error.responseCode) && attempts < 5) { await ref.update({ state: 'pending', attempts, reason: 'temporary-provider-rejection' }); throw Error('Retry temporary SMTP rejection'); }
      await ref.update({ state: 'review-required', attempts, reason: 'provider-outcome-uncertain', updatedAt: Date.now() });
    }
  });
  const reconcileQueuedEventEmail = onSchedule({ schedule: 'every 10 minutes', region: 'australia-southeast1', maxInstances: 1 }, async () => {
    const stale = await db.collection('eventEmailOutbox').where('state', '==', 'sending').limit(200).get();
    for (const doc of stale.docs) if (doc.data().startedAt < Date.now() - 600000) await doc.ref.update({ state: 'review-required', reason: 'interrupted-delivery' });
  });
  return { deliverQueuedEventEmail, reconcileQueuedEventEmail };
}
module.exports = { queueEmail, register };
