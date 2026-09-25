'use strict';
const { createHash } = require('node:crypto');
const { allowsNotification, fcmTokens } = require('./notification-policy');
const digest = value => createHash('sha256').update(value).digest('hex');
const INVALID_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

function register({ admin, db, onDocumentCreated, REGION, logger }) {
  // Every directory bell notification has exactly one push delivery path.
  const deliverBusinessPush = onDocumentCreated({ document: 'userNotifications/{notificationId}', region: REGION, retry: true, timeoutSeconds: 120 }, async event => {
    const notice = event.data?.data();
    if (!notice || notice.module !== 'directory' || !notice.recipientUid) return;
    const userRef = db.collection('users').doc(notice.recipientUid);
    const jobRef = db.collection('businessPushDeliveries').doc(event.params.notificationId);
    const claimed = await db.runTransaction(async tx => {
      const snapshot = await tx.get(jobRef), job = snapshot.data() || {};
      if (['sent', 'skipped', 'failed'].includes(job.status)) return false;
      if (job.leaseUntil > Date.now()) throw new Error('Push delivery busy; retry later.');
      if (Number(job.attempts || 0) >= 5) {
        tx.set(jobRef, { ...job, status: 'failed', leaseUntil: 0 });
        return false;
      }
      tx.set(jobRef, { ...job, status: 'sending', attempts: Number(job.attempts || 0) + 1, leaseUntil: Date.now() + 180000 });
      return true;
    });
    if (!claimed) return;
    const finish = (status, reason = '') => jobRef.update({ status, reason, leaseUntil: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    try {
      const user = (await userRef.get()).data();
      if (!allowsNotification(user, notice.type, 'push')) return finish('skipped', 'preferences-or-inactive-account');
      const tokens = fcmTokens(user);
      if (!tokens.length) return finish('skipped', 'no-device-token');
      let failed = false;
      for (let offset = 0; offset < tokens.length; offset += 500) {
        const pending = [];
        for (const token of tokens.slice(offset, offset + 500)) {
          const receipt = jobRef.collection('devices').doc(digest(token));
          if ((await receipt.get()).data()?.done !== true) pending.push({ token, receipt });
        }
        if (!pending.length) continue;
        const response = await admin.messaging().sendEachForMulticast({
          tokens: pending.map(item => item.token),
          notification: { title: notice.title, body: notice.body },
          data: { module: 'directory', type: notice.type || '', notificationId: event.params.notificationId,
            recipientUid: notice.recipientUid, businessId: notice.businessId || '', threadId: notice.threadId || '',
            entityId: notice.entityId || '', entityType: notice.entityType || '',
            screen: notice.threadId ? 'business-inbox' : 'business-notifications' },
          android: { priority: 'high', notification: { channelId: 'business-alerts', sound: 'default', tag: event.params.notificationId } },
          apns: { headers: { 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-collapse-id': digest(event.params.notificationId) },
            payload: { aps: { sound: 'default' } } },
        });
        for (let index = 0; index < response.responses.length; index++) {
          const result = response.responses[index], item = pending[index], code = result.error?.code || '';
          if (result.success || INVALID_TOKEN.has(code)) {
            await item.receipt.set({ done: true, status: result.success ? 'accepted' : 'invalid-token', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          } else {
            failed = true;
            logger.error('Business push rejected', { notificationId: event.params.notificationId, code });
          }
          if (INVALID_TOKEN.has(code)) {
            // Preserve both legacy map tokens and the native array format.
            await db.runTransaction(async tx => {
              const current = (await tx.get(userRef)).data();
              if (!current) return;
              const value = current.fcmTokens;
              if (Array.isArray(value)) tx.update(userRef, { fcmTokens: value.filter(token => token !== item.token) });
              else if (value && Object.prototype.hasOwnProperty.call(value, item.token)) {
                const next = { ...value }; delete next[item.token]; tx.update(userRef, { fcmTokens: next });
              }
            });
          }
        }
      }
      if (failed) throw new Error('Some push recipients require a retry.');
      await finish('sent');
    } catch (error) {
      await finish('retrying');
      logger.error('Business push retry required', { notificationId: event.params.notificationId, code: error?.code || 'delivery-error' });
      throw new Error('Business push delivery failed; retry required.');
    }
  });
  return { deliverBusinessPush };
}
module.exports = { register };
