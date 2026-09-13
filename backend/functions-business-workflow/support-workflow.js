'use strict';
const { createHash } = require('node:crypto');
const SUPPORT = 'support@siza.info';
const APP_CATEGORIES = ['App feedback / suggestion', 'Technical problem', 'Account / login issue', 'Privacy enquiry', 'Other'];
const BUSINESS_CATEGORIES = ['Incorrect information', 'Misleading or unsafe conduct', 'Suspected fraud or impersonation', 'Inappropriate content', 'Business closed', 'Other'];
const clean = value => String(value || '').trim();
const validEmail = value => /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value) && value.length <= 254;
const digest = value => createHash('sha256').update(value).digest('hex');
const cityOf = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sydney';
const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function adminEmails(users, city) {
  return [...new Set(users.filter(user => user.active !== false && user.isActive !== false
    && !['archived', 'banned', 'deleted'].includes(user.accountStatus)
    && (user.role === 'superAdmin' || (user.role === 'admin' && cityOf(user.adminCity || user.defaultCity) === city)))
    .map(user => clean(user.email)).filter(validEmail))];
}

function buildEmail(job, reference) {
  const title = job.kind === 'business-report' ? 'Business problem report' : job.kind === 'business-enquiry' ? 'New business enquiry' : 'App feedback / problem report';
  const details = [
    ['Reference', reference], ['Business', job.businessName], ['Business ID', job.businessId], ['City', job.city],
    ['Reporter / sender', job.senderName], ['Email', job.senderEmail || 'Not supplied'],
    ['Email verification', job.senderEmailVerified ? 'Verified account email' : 'User-provided / profile email'],
    ['Category', job.category], ['Submitted', job.submittedAt],
  ].filter(([, value]) => value);
  return {
    from: { name: 'Community Connect Australia', address: SUPPORT }, replyTo: SUPPORT,
    subject: `${title}${job.businessName ? `: ${clean(job.businessName).replace(/[\r\n]/g, ' ').slice(0, 120)}` : ''} [${reference.slice(0, 12)}]`,
    text: `${title}\n\n${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nMessage:\n${job.message}\n\nReplies to this notification go to ${SUPPORT}.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#15233b"><h1 style="background:#138477;color:white;padding:20px">${title}</h1><table style="width:100%">${details.map(([k, v]) => `<tr><th style="text-align:left;padding:8px;vertical-align:top">${escapeHtml(k)}</th><td style="padding:8px">${escapeHtml(v)}</td></tr>`).join('')}</table><h2>Message</h2><div style="white-space:pre-wrap;padding:16px;background:#f2f8f7">${escapeHtml(job.message)}</div><p>Replies go to ${SUPPORT}.</p></div>`,
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
  };
}

function register({ admin, db, onCall, onDocumentCreated, HttpsError, REGION, EMAIL_SECRETS, buildTransporter, logger }) {
  const timestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const submitSupportRequest = onCall({ region: REGION, enforceAppCheck: false }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Open an app session before submitting.');
    const data = request.data || {}, uid = request.auth.uid;
    const kind = data.kind === 'business-report' ? 'business-report' : 'app-feedback';
    const category = clean(data.category), message = clean(data.message), requestId = clean(data.requestId);
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid submission reference.');
    if (!(kind === 'business-report' ? BUSINESS_CATEGORIES : APP_CATEGORIES).includes(category)
      || message.length < 10 || message.length > 2500) throw new HttpsError('invalid-argument', 'Choose a category and enter 10–2500 characters.');
    const profile = request.auth.token?.firebase?.sign_in_provider === 'anonymous' ? {} : (await db.collection('users').doc(uid).get()).data() || {};
    const senderName = clean(data.senderName || profile.fullName), senderEmail = clean(data.senderEmail || profile.email || request.auth.token?.email);
    if (!senderName || senderName.length > 100 || !validEmail(senderEmail)) throw new HttpsError('invalid-argument', 'Please supply your name and a valid email address.');
    const reference = digest(`${uid}:${requestId}`), record = db.collection('supportSubmissions').doc(reference);
    const existing = await record.get();
    if (existing.exists) return { reference, status: existing.data().status || 'queued' };
    let businessId = '', businessName = '', city = cityOf(profile.defaultCity), recipients = [SUPPORT];
    if (kind === 'business-report') {
      businessId = clean(data.businessId);
      if (!businessId || businessId.length > 160 || businessId.includes('/')) throw new HttpsError('invalid-argument', 'Invalid business reference.');
      const business = await db.collection('publicBusinesses').doc(businessId).get();
      if (!business.exists) throw new HttpsError('not-found', 'This business is no longer listed.');
      const value = business.data();
      businessName = clean(value.name);
      city = cityOf(value.location?.city || value.metroArea || value.city);
      const admins = await db.collection('users').where('role', 'in', ['admin', 'superAdmin']).get();
      recipients = adminEmails(admins.docs.map(doc => doc.data()), city);
      // An unstaffed city must not silently lose a safety report.
      if (!recipients.length) recipients = [SUPPORT];
    }
    const payload = { kind, category, message, senderUid: uid, senderName, senderEmail,
      senderEmailVerified: request.auth.token?.email_verified === true && request.auth.token?.email === senderEmail,
      businessId, businessName, city, submittedAt: new Date().toISOString(), createdAt: timestamp(), status: 'queued' };
    await db.runTransaction(async tx => {
      const limit = db.collection('supportSubmissionLimits').doc(uid);
      const [previous, rate] = await Promise.all([tx.get(record), tx.get(limit)]);
      if (previous.exists) return;
      if (Number(rate.data()?.lastAt || 0) > Date.now() - 30000) throw new HttpsError('resource-exhausted', 'Please wait 30 seconds before submitting another report.');
      tx.create(record, payload);
      tx.create(db.collection('supportEmailOutbox').doc(reference), { ...payload, recipients, attempts: 0, submissionId: reference });
      tx.set(limit, { lastAt: Date.now() });
    });
    return { reference, status: 'queued' };
  });

  const queueBusinessEnquiryEmail = onDocumentCreated({ region: REGION, document: 'businessMessageThreads/{threadId}/messages/{messageId}', retry: true }, async event => {
    const message = event.data?.data();
    if (!message || message.kind !== 'text') return;
    const thread = (await db.collection('businessMessageThreads').doc(event.params.threadId).get()).data();
    if (!thread || message.senderUid !== thread.senderUid) return;
    const business = (await db.collection('businesses').doc(thread.businessId).get()).data() || {};
    // Never expose an old private conversation to a replacement business owner.
    const route = (await db.collection('businessContactRoutes').doc(thread.businessId).get()).data() || {};
    const address = clean(business.contact?.email);
    const ownerMatches = clean(route.active === true ? route.ownerUid : business.ownerId) === thread.ownerUid;
    const sender = (await db.collection('users').doc(message.senderUid).get()).data() || {};
    const reference = digest(`enquiry:${event.params.threadId}:${event.params.messageId}`);
    // A notification is independent of email availability. Use the message's
    // stable reference so trigger retries do not duplicate or reset read state.
    // Never copy enquiries to admins or a replacement business owner.
    if (ownerMatches && clean(thread.ownerUid) && thread.ownerUid !== message.senderUid
      && thread.participantUids?.includes(thread.ownerUid)
      && thread.participantUids?.includes(message.senderUid)) {
      try {
        await db.collection('userNotifications').doc(`business-enquiry-${reference}`).create({
          recipientUid: thread.ownerUid,
          type: 'business-enquiry', module: 'directory',
          title: 'New business enquiry',
          body: `${clean(sender.fullName || message.senderName) || 'A customer'} sent an enquiry about ${clean(thread.businessName) || 'your business'}. Open Business messaging → Inbox to read and reply.`,
          icon: 'message-text-outline',
          businessId: thread.businessId, threadId: event.params.threadId,
          read: false, createdAt: timestamp(),
        });
      } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
    }
    try {
      await db.collection('supportEmailOutbox').doc(reference).create({
        kind: 'business-enquiry', category: 'Contact Business', businessId: thread.businessId, businessName: thread.businessName,
        city: cityOf(business.location?.city || business.metroArea), senderUid: message.senderUid,
        senderName: clean(sender.fullName || message.senderName), senderEmail: clean(sender.email),
        message: clean(message.text), submittedAt: event.data.createTime.toDate().toISOString(),
        recipients: ownerMatches && validEmail(address) ? [address] : [],
        status: ownerMatches && validEmail(address) ? 'queued' : 'skipped',
        skipReason: !ownerMatches ? 'ownership-changed' : validEmail(address) ? '' : 'no-recorded-business-email',
        attempts: 0, createdAt: timestamp(),
      });
    } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
  });

  const deliverSupportEmail = onDocumentCreated({ region: REGION, document: 'supportEmailOutbox/{reference}', secrets: EMAIL_SECRETS, retry: true, timeoutSeconds: 120 }, async event => {
    const ref = event.data?.ref;
    if (!ref) return;
    const job = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), value = snapshot.data();
      if (!value || ['sent', 'skipped', 'failed'].includes(value.status)) return null;
      if (value.leaseUntil > Date.now()) throw new Error('Email delivery already leased; retry later.');
      if (Number(value.attempts || 0) >= 5) {
        tx.update(ref, { status: 'failed', leaseUntil: 0, updatedAt: timestamp() });
        if (value.submissionId) tx.update(db.collection('supportSubmissions').doc(value.submissionId), { status: 'email-failed', updatedAt: timestamp() });
        return null;
      }
      tx.update(ref, { status: 'sending', attempts: Number(value.attempts || 0) + 1, leaseUntil: Date.now() + 180000 });
      return value;
    });
    if (!job) return;
    try {
      const transporter = buildTransporter();
      if (!transporter) throw new Error('SMTP unavailable');
      const email = buildEmail(job, event.params.reference);
      for (const address of job.recipients || []) {
        const key = digest(address.toLowerCase()), receipt = ref.collection('deliveries').doc(key);
        if ((await receipt.get()).data()?.status === 'sent') continue;
        const result = await transporter.sendMail({ ...email, to: address, messageId: `<${event.params.reference}.${key.slice(0, 16)}@siza.info>` });
        if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept recipient');
        await receipt.set({ status: 'sent', messageId: clean(result.messageId), sentAt: timestamp() });
      }
      await ref.update({ status: 'sent', leaseUntil: 0, sentAt: timestamp() });
      if (job.submissionId) await db.collection('supportSubmissions').doc(job.submissionId).update({ status: 'email-sent', updatedAt: timestamp() });
    } catch (error) {
      await ref.update({ status: 'retrying', leaseUntil: 0, updatedAt: timestamp() });
      logger.error('Support email retry required', { reference: event.params.reference, code: clean(error.code) || 'delivery-error' });
      throw new Error('Support email delivery failed; retry required.');
    }
  });
  return { submitSupportRequest, queueBusinessEnquiryEmail, deliverSupportEmail };
}
module.exports = { register, adminEmails, buildEmail, APP_CATEGORIES, BUSINESS_CATEGORIES };
