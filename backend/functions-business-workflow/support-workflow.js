'use strict';
const { createHash } = require('node:crypto');
const { renderEmail, detailRows, escapeHtml, emailBrand } = require('./email-template');
const { isActiveRecipient } = require('./notification-policy');
const SUPPORT = 'support@siza.info';
const APP_CATEGORIES = ['App feedback / suggestion', 'Technical problem', 'Account / login issue', 'Privacy enquiry', 'Other'];
const BUSINESS_CATEGORIES = ['Incorrect information', 'Misleading or unsafe conduct', 'Suspected fraud or impersonation', 'Inappropriate content', 'Business closed', 'Other'];
const clean = value => String(value || '').trim();
const validEmail = value => /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value) && value.length <= 254;
const digest = value => createHash('sha256').update(value).digest('hex');
const cityOf = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sydney';

function adminEmails(users, city) {
  return [...new Set(users.filter(user => user.active !== false && user.isActive !== false
    && !['archived', 'banned', 'deleted'].includes(user.accountStatus)
    && (user.role === 'superAdmin' || (user.role === 'admin' && cityOf(user.adminCity || user.defaultCity) === city)))
    .map(user => clean(user.email)).filter(validEmail))];
}

function buildEmail(job, reference) {
  const title = job.kind === 'business-report' ? 'Business problem report' : job.kind === 'business-enquiry' ? 'New business enquiry' : job.kind === 'business-reply' ? 'New reply from business' : 'App feedback / problem report';
  const isBusinessConversation = ['business-enquiry', 'business-reply'].includes(job.kind);
  const contactName = clean(job.senderName) || 'Community Connect Australia user';
  const contactedBy = isBusinessConversation && validEmail(clean(job.senderEmail))
    ? `${contactName} (${clean(job.senderEmail)})` : contactName;
  const auditDetails = [
    ['Reference', reference], ['Business', job.businessName], ['Business ID', job.businessId], ['City', job.city],
    ['Reporter / sender', job.senderName], ['Email', job.senderEmail || 'Not supplied'],
    ['Email verification', job.senderEmailVerified ? 'Verified account email' : 'User-provided / profile email'],
    ['Category', job.category], ['Submitted', job.submittedAt],
  ].filter(([, value]) => value);
  const details = isBusinessConversation
    ? [['Contacted by', contactedBy], ['Business', job.businessName]].filter(([, value]) => value)
    : auditDetails;
  const module = ['business-report', 'business-enquiry', 'business-reply'].includes(job.kind) ? 'directory' : undefined;
  const subjectTitle = `${title}${job.businessName ? `: ${clean(job.businessName).replace(/[\r\n]/g, ' ').slice(0, 120)}` : ''}`;
  return {
    from: { name: emailBrand(module), address: SUPPORT }, replyTo: SUPPORT,
    subject: isBusinessConversation ? subjectTitle : `${subjectTitle} [${reference.slice(0, 12)}]`,
    ...renderEmail({ module, title: subjectTitle,
      bodyText: `${details.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nMessage:\n${job.message}`,
      bodyHtml: `${detailRows(details)}<h2 style="margin:20px 0 8px;font-size:18px;line-height:1.4">Message</h2><div style="white-space:pre-wrap;padding:16px;background:#f2f8f7;border-radius:8px;overflow-wrap:anywhere">${escapeHtml(job.message)}</div>`,
    }),
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
    let reportAdmins = [];
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
      reportAdmins = admins.docs.map(doc => ({ ...doc.data(), uid: doc.id })).filter(user => isActiveRecipient(user)
        && (user.role === 'superAdmin' || (user.role === 'admin' && cityOf(user.adminCity || user.defaultCity) === city)));
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
      reportAdmins.forEach(user => tx.create(db.collection('userNotifications').doc(`business-report-${reference}-${user.uid}`), {
        recipientUid: user.uid, type: 'business.reported', module: 'directory',
        title: 'Business problem report', body: `A report about ${businessName || 'a business'} requires administrator review. Check your report email or contact support@siza.info.`,
        businessId, entityId: businessId, entityType: 'business', read: false, createdAt: timestamp(),
      }));
      tx.set(limit, { lastAt: Date.now() });
    });
    if (kind === 'app-feedback') {
      const acknowledgement = db.collection('eventEmailOutbox').doc(`support-ack-${reference}`);
      try { await acknowledgement.create({ uid: '', required: true, category: 'service', state: 'pending', queuedAt: Date.now(), message: { to: senderEmail, subject: 'Your support request was received', text: `Thank you for contacting Community Connect Australia. Your reference is ${reference.slice(0, 12)}. Our support team will review your request. Contact support@siza.info for follow-up.` } }); }
      catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
    }
    return { reference, status: 'queued' };
  });

  const queueBusinessEnquiryEmail = onDocumentCreated({ region: REGION, document: 'businessMessageThreads/{threadId}/messages/{messageId}', retry: true }, async event => {
    const message = event.data?.data();
    if (!message || message.kind !== 'text') return;
    const thread = (await db.collection('businessMessageThreads').doc(event.params.threadId).get()).data();
    const fromCustomer = message.senderUid === thread?.senderUid;
    const fromOwner = message.senderUid === thread?.ownerUid;
    if (!thread || (!fromCustomer && !fromOwner) || thread.senderUid === thread.ownerUid
      || !thread.participantUids?.includes(thread.senderUid) || !thread.participantUids?.includes(thread.ownerUid)) return;
    const business = (await db.collection('businesses').doc(thread.businessId).get()).data() || {};
    const route = (await db.collection('businessContactRoutes').doc(thread.businessId).get()).data() || {};
    const ownerMatches = clean(route.active === true ? route.ownerUid : business.ownerId) === thread.ownerUid;
    const recipientUid = fromCustomer ? thread.ownerUid : thread.senderUid;
    const recipient = (await db.collection('users').doc(recipientUid).get()).data() || {};
    const sender = (await db.collection('users').doc(message.senderUid).get()).data() || {};
    const eligible = ownerMatches && isActiveRecipient(recipient);
    const address = clean(fromCustomer ? business.contact?.email : recipient.email);
    const addresses = [...new Set((fromCustomer ? [address, clean(recipient.email)] : [address]).filter(validEmail).map(value => value.toLowerCase()))];
    const kind = fromCustomer ? 'business-enquiry' : 'business-reply';
    // Keep the existing stable key so redeployment cannot duplicate old enquiries.
    const reference = digest(`enquiry:${event.params.threadId}:${event.params.messageId}`);
    if (eligible) {
      try {
        await db.collection('userNotifications').doc(`business-enquiry-${reference}`).create({
          recipientUid, type: kind, module: 'directory',
          title: fromCustomer ? 'New business enquiry' : 'New reply from business',
          body: fromCustomer
            ? `${clean(sender.fullName || message.senderName) || 'A customer'} sent a message about ${clean(thread.businessName) || 'your business'}. Open Business Inbox to read and reply.`
            : `${clean(thread.businessName) || 'The business'} replied to your enquiry. Open Business Inbox to read and reply.`,
          icon: 'message-text-outline', businessId: thread.businessId, threadId: event.params.threadId,
          read: false, createdAt: timestamp(),
        });
      } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
    }
    try {
      await db.collection('supportEmailOutbox').doc(reference).create({
        kind, category: fromCustomer ? 'Contact Business' : 'Business reply',
        businessId: thread.businessId, businessName: thread.businessName, threadId: event.params.threadId, recipientUid,
        ownerUid: thread.ownerUid, city: cityOf(business.location?.city || business.metroArea),
        senderUid: message.senderUid,
        senderName: fromCustomer ? clean(sender.fullName || message.senderName) : clean(thread.businessName),
        // Do not disclose the owner's private account email to a customer.
        senderEmail: clean(fromCustomer ? sender.email : business.contact?.email),
        message: clean(message.text), submittedAt: event.data.createTime.toDate().toISOString(),
        recipients: eligible ? addresses : [],
        status: eligible && addresses.length ? 'queued' : 'skipped',
        skipReason: !ownerMatches ? 'ownership-changed' : !eligible ? 'inactive-recipient'
          : validEmail(address) ? '' : fromCustomer ? 'no-recorded-business-email' : 'no-customer-email',
        attempts: 0, createdAt: timestamp(),
      });
    } catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
  });

  const deliverSupportEmail = onDocumentCreated({ region: REGION, document: 'supportEmailOutbox/{reference}', secrets: EMAIL_SECRETS, retry: true, timeoutSeconds: 120 }, async event => {
    const ref = event.data?.ref;
    if (!ref) return;
    const job = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref), value = snapshot.data();
      if (!value || ['sent', 'skipped', 'failed', 'review-required'].includes(value.status)) return null;
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
      if (job.threadId && ['business-enquiry', 'business-reply'].includes(job.kind)) {
        const business = (await db.collection('businesses').doc(job.businessId).get()).data() || {};
        const route = (await db.collection('businessContactRoutes').doc(job.businessId).get()).data() || {};
        const recipient = (await db.collection('users').doc(job.recipientUid).get()).data() || {};
        const address = clean(job.kind === 'business-enquiry' ? business.contact?.email : recipient.email);
        if (clean(route.active === true ? route.ownerUid : business.ownerId) !== job.ownerUid
          || !isActiveRecipient(recipient) || !job.recipients.some(value => [address, ...(job.kind === 'business-enquiry' ? [clean(recipient.email)] : [])].map(x => x.toLowerCase()).includes(value.toLowerCase()))) {
          await ref.update({ status: 'skipped', skipReason: 'recipient-or-ownership-changed', leaseUntil: 0 });
          return;
        }
      }
      const transporter = buildTransporter();
      if (!transporter) throw new Error('SMTP unavailable');
      const email = buildEmail(job, event.params.reference);
      let needsReview = false;
      for (const address of job.recipients || []) {
        const key = digest(address.toLowerCase()), receipt = ref.collection('deliveries').doc(key);
        const previous = (await receipt.get()).data();
        if (previous?.status === 'sent') continue;
        if (previous?.status === 'sending' || previous?.status === 'review-required') { await ref.update({ status: 'review-required', leaseUntil: 0 }); return; }
        if (job.recipientUid) {
          const current = (await db.collection('users').doc(job.recipientUid).get()).data();
          const business = (await db.collection('businesses').doc(job.businessId).get()).data() || {};
          const permitted = (job.kind === 'business-enquiry' ? [business.contact?.email, current?.email] : [current?.email]).map(value => clean(value).toLowerCase());
          if (!permitted.includes(address.toLowerCase())) continue;
        }
        await receipt.set({ status: 'sending', startedAt: timestamp() });
        try {
          const result = await transporter.sendMail({ ...email, to: address, messageId: `<${event.params.reference}.${key.slice(0, 16)}@siza.info>` });
          if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept recipient');
          await receipt.set({ status: 'sent', messageId: clean(result.messageId), sentAt: timestamp() });
        } catch {
          needsReview = true;
          await receipt.set({ status: 'review-required', reason: 'provider-outcome-uncertain', updatedAt: timestamp() });
        }
      }
      if (needsReview) { await ref.update({ status: 'review-required', leaseUntil: 0 }); return; }
      await ref.update({ status: 'sent', leaseUntil: 0, sentAt: timestamp() });
      if (job.submissionId) await db.collection('supportSubmissions').doc(job.submissionId).update({ status: 'email-sent', updatedAt: timestamp() });
    } catch (error) {
      await ref.update({ status: 'review-required', leaseUntil: 0, updatedAt: timestamp() });
      logger.error('Support email retry required', { reference: event.params.reference, code: clean(error.code) || 'delivery-error' });
      // SMTP may have accepted before a timeout/writeback failure. Reconcile instead of blind replay.
      return;
    }
  });
  return { submitSupportRequest, queueBusinessEnquiryEmail, deliverSupportEmail };
}
module.exports = { register, adminEmails, buildEmail, APP_CATEGORIES, BUSINESS_CATEGORIES };
