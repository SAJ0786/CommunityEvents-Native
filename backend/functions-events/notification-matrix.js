'use strict';
// Approved workbook policy, 18 October 2026. Server owns recipients and channels.
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const clean = value => String(value || '').trim();
const emailValid = value => /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(clean(value));
const cityOf = user => clean(user?.adminCity || user?.defaultCity || user?.metroArea || user?.city || 'sydney').toLowerCase();
const active = (user, uid) => Boolean(user) && user.active !== false && user.isActive !== false
  && !user.archivedAt && !user.bannedAt && !user.accountDeletedAt
  && !['inactive', 'archived', 'banned', 'deleted', 'suspended'].includes(user.accountStatus)
  && (!user.migratedToUid || user.migratedToUid === uid);
const optionalEmail = user => (user.emailNotificationsEnabled ?? user.reminderEmailEnabled) !== false && user.eventNotificationsEnabled !== false;
function recipientMatches(user, uid, job) {
  if (!active(user, uid)) return false;
  const admin = user.role === 'superAdmin' || user.role === 'admin' && cityOf(user) === job.city;
  if (job.audience === 'ids') return job.uids?.includes(uid);
  if (job.audience === 'admins') return admin;
  if (job.audience === 'superadmins') return user.role === 'superAdmin';
  if (job.audience === 'city') return cityOf({ defaultCity: user.defaultCity }) === job.city;
  if (job.audience === 'interested') return admin || job.uids?.includes(uid) || user.savedEvents?.includes(job.eventId);
  if (job.audience === 'registration') return admin || job.uids?.includes(uid); // bookings checked server-side below
  return job.audience === 'all';
}
function channelAllowed(user, job, channel) {
  if (job.required) return true;
  if (job.policy === 'admin') return channel !== 'email' || user.adminAlertEmailEnabled !== false;
  return channel === 'email' ? optionalEmail(user) : channel === 'push' ? user.pushNotificationsEnabled !== false && user.eventNotificationsEnabled !== false : true;
}
function register(deps = {}) {
  const admin = deps.admin || require('firebase-admin');
  const { onDocumentWritten, onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = deps.triggers || require('firebase-functions/v2/firestore');
  const { onSchedule } = deps.scheduler || require('firebase-functions/v2/scheduler');
  const { defineSecret } = deps.params || require('firebase-functions/params');
  const nodemailer = deps.nodemailer || require('nodemailer');
  const db = deps.db || admin.firestore(), region = 'australia-southeast1';
  const secrets = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].map(name => defineSecret(name));
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  async function hostEvent(thread) {
    if (!thread) return null;
    if (['events','registrationEvents'].includes(thread.eventCollection)) return (await db.collection(thread.eventCollection).doc(thread.eventId).get()).data();
    // Older conversations predate the explicit collection discriminator.
    return (await db.collection('events').doc(thread.eventId).get()).data() || (await db.collection('registrationEvents').doc(thread.eventId).get()).data();
  }

  async function create(ref, value) { try { await ref.create(value); } catch (e) { if (e.code !== 6 && e.code !== 'already-exists') throw e; } }
  async function queue(key, value) {
    await create(db.collection('notificationCampaigns').doc(hash(key)), {
      required: true, channels: ['email', 'push', 'bell'], module: 'events', audience: 'admins',
      city: 'sydney', ...value, state: 'pending', cursor: '', createdAt: timestamp(),
    });
  }
  const owner = e => clean(e?.ownerUid || e?.createdByUserId || e?.createdByUid || e?.userId);
  const title = e => clean(e?.title) || `${clean(e?.eventType) || 'Event'} - ${clean(e?.hostName) || 'Host'}`;
  const eventCity = e => clean(e?.city || e?.metroArea || 'sydney').toLowerCase();
  const opts = document => ({ document, region, retry: true });
  const onEventCreated = onDocumentCreated(opts('events/{eventId}'), event => {
    const value = event.data?.data();
    if (!value || value.status !== 'active' || value.registrationOnly) return;
    return queue(event.id, { type: 'event.created', title: 'New event submitted', body: `${title(value)} has been added. Open Events to review.`,
      eventId: event.params.eventId, city: eventCity(value), channels: ['email'], required: false, policy: 'admin' });
  });
  const onEventDeleted = onDocumentDeleted(opts('events/{eventId}'), async event => {
    const value = event.data?.data(); if (!value || value.registrationOnly) return;
    if ((await db.collection('archivedEvents').doc(event.params.eventId).get()).data()?.archiveReason === 'event_date_expired') return;
    return queue(event.id, { type: 'event.deleted', title: 'Event removed', body: `${title(value)} has been removed.`, eventId: event.params.eventId,
      city: eventCity(value), audience: 'interested', uids: [owner(value)].filter(Boolean) });
  });
  const matrixEventUpdated = onDocumentUpdated(opts('events/{eventId}'), async event => {
    const before = event.data.before.data(), after = event.data.after.data();
    if (after.registrationOnly) return;
    const fields = ['eventDate', 'startTime', 'endTime', 'eventType', 'hostName', 'address', 'notes', 'hidden', 'status'];
    if (fields.some(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))) await queue(`${event.id}:edit`, {
      type: 'event.updated', title: 'Event updated', body: `${title(after)} has changed. Open Events for the latest details.`,
      eventId: event.params.eventId, city: eventCity(after), audience: 'interested', uids: [owner(after)].filter(Boolean) });
    if (before.isLive !== true && after.isLive === true) await queue(`${event.id}:live`, {
      type: 'event.live', title: 'An event is live', body: `${title(after)} is now live. Open Live in the app.`, eventId: event.params.eventId,
      city: eventCity(after), audience: 'all', channels: ['bell'] });
    if (before.isLive !== true && after.isLive === true) await queue(`${event.id}:live-email`, {
      type: 'event.live', title: 'Your event is live', body: `${title(after)} is now live. Open Live in the app.`, eventId: event.params.eventId,
      city: eventCity(after), audience: 'admins', uids: [owner(after)].filter(Boolean), includeUids: true, channels: ['email'] });
  });
  const matrixProfileWritten = onDocumentWritten(opts('users/{uid}'), async event => {
    const uid = event.params.uid, after = event.data.after.data(), before = event.data.before.data() || {};
    if (!active(after, uid)) return;
    // Re-read and compare so delayed trigger retries cannot revert a newer preference.
    if (after.emailNotificationsEnabled !== before.emailNotificationsEnabled || after.reminderEmailEnabled !== before.reminderEmailEnabled) {
      await db.runTransaction(async tx => {
        const ref = event.data.after.ref, current = (await tx.get(ref)).data();
        if (!current || current.emailNotificationsEnabled !== after.emailNotificationsEnabled || current.reminderEmailEnabled !== after.reminderEmailEnabled) return;
        const value = after.emailNotificationsEnabled !== before.emailNotificationsEnabled ? after.emailNotificationsEnabled : after.reminderEmailEnabled;
        if (typeof value === 'boolean' && (current.emailNotificationsEnabled !== value || current.reminderEmailEnabled !== value)) tx.update(ref, { emailNotificationsEnabled: value, reminderEmailEnabled: value });
      });
    }
    for (const eventId of (after.savedEvents || []).filter(id => !(before.savedEvents || []).includes(id))) {
      if (typeof eventId !== 'string' || eventId.includes('/')) continue;
      const value = (await db.collection('events').doc(eventId).get()).data() || (await db.collection('registrationEvents').doc(eventId).get()).data();
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate || value.date || '')) continue;
      const zone = value.timeZone || { perth: 'Australia/Perth', brisbane: 'Australia/Brisbane', adelaide: 'Australia/Adelaide' }[eventCity(value)] || 'Australia/Sydney';
      const date = new Date(`${value.eventDate || value.date}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1);
      const { registrationInstant } = await import('./eventSchedule.mjs');
      const notBefore = Date.parse(registrationInstant(date.toISOString().slice(0, 10), '19:00', zone));
      if (notBefore <= Date.now()) continue;
      await queue(`favourite:${uid}:${eventId}:${notBefore}`, { type: 'event.favourite_reminder', title: 'An event is on tomorrow', body: 'Open Favourites to view your saved event.', audience: 'ids', uids: [uid], eventId, channels: ['bell'], notBefore, requiresFavourite: true });
    }
    if (emailValid(after.email) && clean(after.fullName).length >= 2) {
      // Stable per-account key works even when profile completion arrives after creation.
      if (!event.data.before.exists || !emailValid(before.email) || clean(before.fullName).length < 2) await queue(`welcome:${uid}`,  { type: 'account.welcome', audience: 'ids', uids: [uid], channels: ['email'], title: 'Welcome to Community Connect Australia',
        body: `Welcome ${clean(after.fullName)} to Community Connect Australia.\nDiscover local community events and connect with trusted businesses.\nFind what’s on near you, register and stay connected.\nExplore the app by clicking the button below.` });
      if (!emailValid(before.email)) await queue(`signup-admin:${uid}`, { type: 'account.created', audience: 'admins', city: cityOf(after), required: false, policy: 'admin', channels: ['email'], title: 'New member registered', body: 'A member completed their profile. Open User Management for details.' });
      if (emailValid(before.email) && clean(before.email).toLowerCase() !== clean(after.email).toLowerCase()) {
        await queue(`${event.id}:email`, { type: 'account.email_changed', audience: 'ids', uids: [uid], channels: ['email'], expectedEmail: clean(after.email).toLowerCase(), title: 'Your contact email was changed', body: 'This email confirms that your Community Connect Australia contact email has changed. If you did not make this change, contact support@siza.info.' });
        await queue(`${event.id}:email-admin`, { type: 'account.email_changed', audience: 'admins', city: cityOf(after), channels: ['email'], title: 'Member contact email changed', body: 'A member changed their contact email. Open User Management to review the current profile.' });
      }
    }
  });
  const matrixHostMessage = onDocumentCreated(opts('hostMessageThreads/{threadId}/messages/{messageId}'), async event => {
    const message = event.data?.data(), thread = (await db.collection('hostMessageThreads').doc(event.params.threadId).get()).data();
    if (!thread || message?.kind !== 'text' || ![thread.hostUid, thread.senderUid].includes(message.senderUid)) return;
    const currentEvent = await hostEvent(thread);
    if (!currentEvent || owner(currentEvent) !== thread.hostUid) return;
    const recipient = message.senderUid === thread.hostUid ? thread.senderUid : thread.hostUid;
    if (!recipient || recipient === message.senderUid || !thread.participantUids?.includes(recipient)) return;
    await queue(event.id, { type: 'host.message', audience: 'ids', uids: [recipient], channels: ['push', 'bell'], title: 'New event message',
      body: 'You have a new message. Open Host Inbox to read and reply.', threadId: event.params.threadId, eventId: thread.eventId });
  });
  const matrixRegistrationWritten = onDocumentWritten(opts('registrationEvents/{eventId}'), async event => {
    const before = event.data.before.data() || {}, after = event.data.after.data(); if (!after) return;
    const common = { module: 'registration', eventId: event.params.eventId, city: eventCity(after) };
    const pending = after.status === 'pending' || after.hasPendingChanges;
    if (pending && (!event.data.before.exists || before.revision !== after.revision) && !after.reviewDecision) await queue(`${event.id}:submit`, {
      ...common, type: 'registration.submitted', title: 'Registration event awaiting approval', body: `${title(after)} was submitted for approval.`, channels: ['email', 'push'] });
    if (before.status !== 'approved' && after.status === 'approved' || before.hasPendingChanges && !after.hasPendingChanges && after.status === 'approved') await queue(`${event.id}:approved`, {
      ...common, type: 'registration.approved', title: 'Registration event approved', body: `${title(after)} has been approved.`, audience: 'interested', uids: [after.ownerUid], channels: ['email'] });
    if (after.reviewDecision && before.reviewDecision !== after.reviewDecision) await queue(`${event.id}:decision`, {
      ...common, type: 'registration.reviewed', title: 'Registration event review completed', body: 'An administrator reviewed your event. Open My Events to see the decision and feedback.', audience: 'ids', uids: [after.ownerUid] });
  });
  const matrixRegistrationBooking = onDocumentWritten(opts('registrationEvents/{eventId}/registrations/{uid}'), async event => {
    const before = event.data.before.data(), after = event.data.after.data(); if (!after || before?.revision === after.revision) return;
    const value = (await db.collection('registrationEvents').doc(event.params.eventId).get()).data(); if (!value) return;
    await queue(event.id, { type: 'registration.booking', module: 'registration', audience: 'superadmins', uids: [value.ownerUid], includeUids: true,
      eventId: event.params.eventId, city: eventCity(value), title: after.status === 'cancelled' ? 'Registration cancelled' : 'Registration received',
      body: `A registration for ${title(value)} was ${after.status === 'cancelled' ? 'cancelled' : 'submitted or updated'}. Open Registration responses to review.` });
  });
  const matrixRegistrationChange = onDocumentCreated(opts('registrationChanges/{changeId}'), async event => {
    const change = event.data?.data(); if (!change) return;
    const value = (await db.collection('registrationEvents').doc(change.eventId).get()).data(); if (!value) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: value.timeZone || 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (value.date < today || value.endAt && Date.parse(value.endAt) <= Date.now()) return;
    const { registrationInstant } = await import('./eventSchedule.mjs');
    const expiresAt = value.endAt ? Date.parse(value.endAt) : Date.parse(registrationInstant(value.date, '23:59', value.timeZone || 'Australia/Sydney'));
    const cancelled = change.changes?.includes('cancelled');
    await queue(event.id, { expiresAt, type: 'registration.changed', module: 'registration', audience: 'registration', eventId: change.eventId,
      city: eventCity(value), changeCreatedAt: change.createdAt, title: cancelled ? `Event cancelled: ${title(value)}` : `Registered event updated: ${title(value)}`,
      body: cancelled ? `${title(value)} has been cancelled or removed by the organiser. Your places are no longer reserved. Open My Events to review the event status.`
        : `${title(value)} has changed. Open My Events to review the current event details and registration form.` });
  });
  async function matches(user, uid, job) {
    if (job.expiresAt && job.expiresAt <= Date.now()) return false;
    let match = recipientMatches(user, uid, job) || job.includeUids && active(user, uid) && job.uids?.includes(uid);
    if (job.audience === 'registration' && active(user, uid)) {
      const booking = (await db.collection('registrationEvents').doc(job.eventId).collection('registrations').doc(uid).get()).data();
      match ||= booking?.status === 'registered' && booking.submittedAt <= job.changeCreatedAt;
    }
    if (job.reminderSelection) { const selection = (await db.collection('registrationReminderSelections').doc(hash(`${uid}:${job.eventId}`)).get()).data(); if (selection?.key !== job.reminderSelection) return false; }
    if (job.requiresFavourite && !user.savedEvents?.includes(job.eventId)) return false;
    if (job.expectedStartAt) { const currentEvent = (await db.collection('registrationEvents').doc(job.eventId).get()).data(); if (!currentEvent || currentEvent.status !== 'approved' || currentEvent.startAt !== job.expectedStartAt) return false; }
    if (job.expectedEmail && clean(user.email).toLowerCase() !== job.expectedEmail) return false;
    if (job.threadId) {
      const thread = (await db.collection('hostMessageThreads').doc(job.threadId).get()).data();
      const value = await hostEvent(thread);
      if (!value || owner(value) !== thread.hostUid || !thread.participantUids?.includes(uid)) return false;
    }
    return Boolean(match);
  }
  const { onCall, HttpsError } = deps.https || require('firebase-functions/v2/https');
  const scheduleRegistrationNotice = onCall({ region, enforceAppCheck: false }, async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in before setting a reminder.');
    const eventId = clean(request.data?.eventId), minutes = Number(request.data?.minutesBefore);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId) || ![0, 5, 10, 15, 30, 60, 120, 180, 1440].includes(minutes)) throw new HttpsError('invalid-argument', 'Choose a valid reminder.');
    const value = (await db.collection('registrationEvents').doc(eventId).get()).data();
    if (!value || value.status !== 'approved' || value.hidden || !value.startTime || !value.startAt) throw new HttpsError('failed-precondition', 'This event has no available start time.');
    const notBefore = Date.parse(value.startAt) - minutes * 60000;
    if (notBefore <= Date.now()) throw new HttpsError('failed-precondition', 'This reminder time has passed.');
    const selectionKey = `registration-reminder:${request.auth.uid}:${eventId}:${notBefore}`;
    await db.collection('registrationReminderSelections').doc(hash(`${request.auth.uid}:${eventId}`)).set({ key: selectionKey, minutesBefore: minutes, fireAt: notBefore, status: 'pending' });
    await queue(selectionKey, { type: 'registration.reminder', module: 'registration', audience: 'ids', uids: [request.auth.uid], eventId,
      expectedStartAt: value.startAt, reminderSelection: selectionKey, notBefore, channels: ['push', 'bell'], title: 'Upcoming registered event', body: 'Your selected event reminder is due. Open My Events to view the event.' });
    return { scheduled: true, triggerAt: new Date(notBefore).toISOString() };
  });
  const registrationReminderStatus = onCall({ region, enforceAppCheck: false }, async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in before managing reminders.');
    const eventId = clean(request.data?.eventId);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) throw new HttpsError('invalid-argument', 'Choose a valid event.');
    const ref = db.collection('registrationReminderSelections').doc(hash(`${request.auth.uid}:${eventId}`));
    if (request.data.remove === true) { await ref.set({ status: 'cancelled', key: '' }); return { removed: true }; }
    const value = (await ref.get()).data();
    return { reminder: value?.key ? { minutesBefore: value.minutesBefore, fireAt: value.fireAt, status: value.fireAt <= Date.now() ? 'due' : 'pending' } : null };
  });
  const deliverNotificationMatrix = onSchedule({ schedule: 'every 1 minutes', region, maxInstances: 1, timeoutSeconds: 540, secrets }, async () => {
    if (process.env.NOTIFICATION_MATRIX_ENABLED !== 'true') return;
    const campaigns = await db.collection('notificationCampaigns').where('state', '==', 'pending').limit(8).get();
    for (const campaign of campaigns.docs) {
      const job = campaign.data(); if (job.notBefore && job.notBefore > Date.now()) continue;
      const enqueue = async doc => {
        const user = doc.data(); if (!await matches(user, doc.id, job)) return;
        for (const channel of job.channels) if (channelAllowed(user, job, channel)) await create(db.collection('notificationDeliveries').doc(hash(`${campaign.id}:${doc.id}:${channel}`)), {
          campaignId: campaign.id, uid: doc.id, channel, state: 'pending', createdAt: timestamp(),
        });
      };
      if (job.audience === 'registration') {
        // Registration service notices target bookings and reviewers directly,
        // rather than waiting behind every unrelated account in the database.
        // Keep delivery IDs unchanged, including for campaigns already in progress.
        if (!job.registrationAdminsQueued) {
          for (const role of ['superAdmin','admin']) {
            const reviewers = await db.collection('users').where('role','==',role).get();
            for (const doc of reviewers.docs) await enqueue(doc);
          }
        }
        let query = db.collection('registrationEvents').doc(job.eventId).collection('registrations').where('status','==','registered').orderBy('__name__').limit(50);
        if (job.registrationCursor) query = query.startAfter(job.registrationCursor);
        const bookings = await query.get();
        for (const booking of bookings.docs) await enqueue(await db.collection('users').doc(booking.id).get());
        for (const uid of [...new Set(job.uids || [])].filter(uid=>typeof uid==='string' && uid && !uid.includes('/'))) await enqueue(await db.collection('users').doc(uid).get());
        await campaign.ref.update({registrationAdminsQueued:true,registrationCursor:bookings.docs.at(-1)?.id || job.registrationCursor || '',state:bookings.size<50?'queued':'pending'});
        continue;
      }
      // Direct recipients must not wait behind every unrelated user page.
      if (job.audience === 'ids' || job.includeUids) {
        for (const uid of [...new Set(job.uids || [])].filter(uid => typeof uid === 'string' && uid && !uid.includes('/'))) await enqueue(await db.collection('users').doc(uid).get());
        if (job.audience === 'ids') { await campaign.ref.update({state:'queued'}); continue; }
      }
      let query = db.collection('users');
      if (job.audience === 'superadmins') query = query.where('role', '==', 'superAdmin');
      query = query.orderBy('__name__').limit(50); if (job.cursor) query = query.startAfter(job.cursor);
      const page = await query.get();
      for (const doc of page.docs) await enqueue(doc);
      await campaign.ref.update({ cursor: page.docs.at(-1)?.id || job.cursor, state: page.size < 50 ? 'queued' : 'pending' });
    }
    const config = Object.fromEntries(secrets.map(secret => [secret.name, secret.value()]));
    const port = Number(config.SMTP_PORT || 587);
    const mailer = nodemailer.createTransport({ host: config.SMTP_HOST, port, secure: port === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS }, connectionTimeout: 10000, socketTimeout: 15000 });
    const pending = await db.collection('notificationDeliveries').where('state', '==', 'pending').limit(30).get();
    for (let offset = 0; offset < pending.size; offset += 5) await Promise.all(pending.docs.slice(offset, offset + 5).map(async doc => {
      const claimed = await db.runTransaction(async tx => {
        const value = (await tx.get(doc.ref)).data(); if (value.state !== 'pending') return null;
        tx.update(doc.ref, { state: 'sending', startedAt: Date.now() }); return value;
      });
      if (!claimed) return;
      let providerAccepted = false;
      try {
        const job = (await db.collection('notificationCampaigns').doc(claimed.campaignId).get()).data();
        const user = (await db.collection('users').doc(claimed.uid).get()).data();
        if (!job || !user || !await matches(user, claimed.uid, job) || !channelAllowed(user, job, claimed.channel)) return doc.ref.update({ state: 'skipped', reason: 'recipient-or-preference-changed' });
        const data = { module: job.module, type: job.type, recipientUid: claimed.uid, notificationId: doc.id,
          eventId: job.eventId || '', threadId: job.threadId || '', screen: job.threadId ? 'host-inbox' : job.module === 'registration' ? 'registration' : 'notifications' };
        if (claimed.channel === 'bell') await db.collection('userNotifications').doc(doc.id).set({ ...data, title: job.title, body: job.body, read: false, createdAt: timestamp() });
        else if (claimed.channel === 'email') {
          if (user.emailDisabledByBounce || ['bounced','complained','suppressed'].includes(user.emailStatus)) return doc.ref.update({ state: 'skipped', reason: 'email-suppressed-by-provider-feedback' });
          if (!emailValid(user.email)) return doc.ref.update({ state: 'skipped', reason: 'no-valid-email' });
          const result = await require('./email-layout').sendEventEmail(mailer, { from: { name: 'Community Connect Australia', address: 'support@siza.info' }, replyTo: 'support@siza.info', to: clean(user.email),
            subject: job.title, ...require('./email-layout').registrationEmailContent(job.type === 'account.welcome' ? require('./email-layout').welcomeEmailBody(user.fullName) : job.body), messageId: `<${doc.id}@siza.info>` });
          providerAccepted = Boolean(result.accepted?.length); if (!providerAccepted) throw Object.assign(Error('Recipient rejected'), { responseCode: 550 });
        } else {
          const tokens = [...new Set((Array.isArray(user.fcmTokens) ? user.fcmTokens : Object.keys(user.fcmTokens || {})).filter(Boolean))];
          if (!tokens.length) return doc.ref.update({ state: 'skipped', reason: 'no-device-token' });
          const result = await admin.messaging().sendEachForMulticast({ tokens: tokens.slice(0, 500), notification: { title: job.title, body: job.body }, data,
            android: { priority: 'high', notification: { channelId: 'business-alerts', tag: doc.id, sound: 'default' } }, apns: { headers: { 'apns-collapse-id': doc.id }, payload: { aps: { sound: 'default' } } } });
          for (let index = 0; index < (result.responses || []).length; index++) {
            const response = result.responses[index], token = tokens[index], code = response.error?.code || '';
            await doc.ref.collection('devices').doc(hash(token)).set({ state: response.success ? 'accepted' : 'rejected', code });
            if (['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code)) {
              const userRef = db.collection('users').doc(claimed.uid);
              await db.runTransaction(async tx => { const current = (await tx.get(userRef)).data(); if (!current) return; const value = current.fcmTokens; if (Array.isArray(value)) tx.update(userRef, {fcmTokens:value.filter(item=>item!==token)}); else if (value) { const next={...value}; delete next[token]; tx.update(userRef,{fcmTokens:next}); } });
            }
          }
          providerAccepted = result.successCount > 0;
          if (result.failureCount) return doc.ref.update({ state: 'review-required', reason: 'partial-or-rejected-push', acceptedCount: result.successCount });
        }
        await doc.ref.update({ state: claimed.channel === 'bell' ? 'stored' : 'accepted', completedAt: timestamp() });
      } catch (error) {
        const attempts = Number(claimed.attempts || 0) + 1;
        const definiteRejection = !providerAccepted && [421, 450, 451, 452].includes(error.responseCode);
        await doc.ref.update({ state: definiteRejection && attempts < 5 ? 'pending' : 'review-required', attempts, reason: definiteRejection ? 'temporary-provider-rejection' : 'provider-outcome-uncertain' });
      }
    }));
    const stale = await db.collection('notificationDeliveries').where('state', '==', 'sending').limit(100).get();
    for (const doc of stale.docs) if (doc.data().startedAt < Date.now() - 600000) await doc.ref.update({ state: 'review-required', reason: 'interrupted-delivery' });
  });
  return { registrationReminderStatus, scheduleRegistrationNotice, onEventCreated, onEventDeleted, matrixEventUpdated, matrixProfileWritten, matrixHostMessage, matrixRegistrationWritten, matrixRegistrationBooking, matrixRegistrationChange, deliverNotificationMatrix };
}
module.exports = { register, recipientMatches, channelAllowed, active, optionalEmail, emailValid };
