'use strict';

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'australia-southeast1';
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const EMAIL_FROM = defineSecret('EMAIL_FROM');
const EMAIL_SECRETS = [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM];
const PROFILE_FIELDS = [
  'fullName', 'email', 'phone', 'defaultCity', 'defaultModule',
  'pushNotificationsEnabled', 'smsNotificationsEnabled', 'emailNotificationsEnabled',
  'eventNotificationsEnabled', 'businessNotificationsEnabled', 'prayerRemindersEnabled',
];

function clean(value) {
  return String(value || '').trim();
}

function normalizeCity(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sydney';
}

function sameValue(left, right) {
  if (left && typeof left.toMillis === 'function') left = left.toMillis();
  if (right && typeof right.toMillis === 'function') right = right.toMillis();
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function html(value) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTransporter() {
  const host = clean(SMTP_HOST.value());
  const port = Number(SMTP_PORT.value() || 587);
  const user = clean(SMTP_USER.value());
  const pass = clean(SMTP_PASS.value());
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function sender() {
  return clean(EMAIL_FROM.value()) || clean(SMTP_USER.value());
}

async function getAdminRecipients(cities, actorUid = '') {
  const citySet = new Set((Array.isArray(cities) ? cities : [cities]).filter(Boolean).map(normalizeCity));
  const snapshot = await db.collection('users').where('role', 'in', ['admin', 'superAdmin']).get();
  return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })).filter(user => {
    if (user.uid === actorUid || user.active === false || user.businessNotificationsEnabled === false) return false;
    if (user.role === 'superAdmin') return true;
    return citySet.has(normalizeCity(user.adminCity || user.defaultCity));
  });
}

async function getOwnerRecipient(ownerId, actorUid = '') {
  if (!ownerId || ownerId === actorUid) return [];
  const snapshot = await db.collection('users').doc(ownerId).get();
  if (!snapshot.exists) return [];
  const user = { uid: snapshot.id, ...snapshot.data() };
  return user.businessNotificationsEnabled === false ? [] : [user];
}

function uniqueRecipients(recipients) {
  return [...new Map(recipients.filter(Boolean).map(item => [item.uid, item])).values()];
}

async function deliver(recipients, notification) {
  const unique = uniqueRecipients(recipients);
  if (!unique.length) return;
  const batch = db.batch();
  unique.forEach(recipient => {
    batch.set(db.collection('userNotifications').doc(), {
      recipientUid: recipient.uid,
      module: 'directory',
      type: notification.type,
      icon: notification.icon || 'bell-outline',
      title: notification.title,
      body: notification.body,
      city: notification.city || '',
      entityId: notification.entityId || '',
      entityType: notification.entityType || '',
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

  const transporter = buildTransporter();
  if (!transporter) {
    logger.warn('Business workflow email skipped because SMTP is not configured.');
    return;
  }
  const from = sender();
  const emailRecipients = unique.filter(recipient => recipient.emailNotificationsEnabled !== false && clean(recipient.email));
  const results = await Promise.allSettled(emailRecipients.map(recipient => transporter.sendMail({
    from,
    to: clean(recipient.email),
    subject: notification.title,
    text: `${notification.title}\n\n${notification.body}\n\nCommunity Connect Australia`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#10172f"><h2>${html(notification.title)}</h2><p>${html(notification.body)}</p><p style="color:#64727c">Community Connect Australia</p></div>`,
  })));
  results.forEach((result, index) => {
    if (result.status === 'rejected') logger.error('Business workflow email failed', { uid: emailRecipients[index]?.uid, error: result.reason?.message });
  });
}

function businessCity(business) {
  return normalizeCity(business?.location?.city || business?.metroArea || business?.city || 'sydney');
}

async function promotionContext(promotion) {
  const snapshot = await db.collection('businesses').doc(clean(promotion.businessId)).get();
  const business = snapshot.exists ? snapshot.data() : {};
  return { business, city: businessCity(business), businessName: clean(business.name) || 'business' };
}

async function notifyBusinessSubmitted(business, businessId, resubmitted = false) {
  const city = businessCity(business);
  const actorUid = clean(business.lastSubmittedBy || business.ownerId);
  const recipients = await getAdminRecipients(city, actorUid);
  await deliver(recipients, {
    type: resubmitted ? 'business.resubmitted' : 'business.submitted',
    icon: 'store-edit-outline',
    title: resubmitted ? 'Business changes submitted' : 'New business submitted',
    body: `${clean(business.name) || 'A business'} has been ${resubmitted ? 'updated and resubmitted' : 'submitted'} for review in ${city}.`,
    city,
    entityId: businessId,
    entityType: 'business',
  });
}

async function notifyBusinessDecision(business, businessId, approved) {
  const city = businessCity(business);
  const actorUid = clean(approved ? business.approvedBy : business.rejectedBy);
  const recipients = [
    ...(await getOwnerRecipient(business.ownerId, actorUid)),
    ...(await getAdminRecipients(city, actorUid)),
  ];
  await deliver(recipients, {
    type: approved ? 'business.approved' : 'business.changes_requested',
    icon: approved ? 'store-check-outline' : 'store-alert-outline',
    title: approved ? 'Business approved' : 'Business changes required',
    body: approved
      ? `${clean(business.name) || 'The business'} has been approved and published.`
      : `${clean(business.name) || 'The business'} requires changes.${business.rejectionReason ? ` ${clean(business.rejectionReason)}` : ''}`,
    city,
    entityId: businessId,
    entityType: 'business',
  });
}

async function notifyPromotionSubmitted(promotion, promotionId, resubmitted = false) {
  const context = await promotionContext(promotion);
  const actorUid = clean(promotion.lastSubmittedBy || promotion.ownerId);
  const recipients = await getAdminRecipients(context.city, actorUid);
  await deliver(recipients, {
    type: resubmitted ? 'promotion.resubmitted' : 'promotion.submitted',
    icon: 'tag-plus-outline',
    title: resubmitted ? 'Promotion changes submitted' : 'New promotion submitted',
    body: `${clean(promotion.title) || 'A promotion'} for ${context.businessName} has been ${resubmitted ? 'updated and resubmitted' : 'submitted'} for review.`,
    city: context.city,
    entityId: promotionId,
    entityType: 'promotion',
  });
}

async function notifyPromotionDecision(promotion, promotionId, approved) {
  const context = await promotionContext(promotion);
  const actorUid = clean(approved ? promotion.approvedBy : promotion.rejectedBy);
  const recipients = [
    ...(await getOwnerRecipient(promotion.ownerId, actorUid)),
    ...(await getAdminRecipients(context.city, actorUid)),
  ];
  await deliver(recipients, {
    type: approved ? 'promotion.approved' : 'promotion.changes_requested',
    icon: approved ? 'tag-check-outline' : 'tag-alert-outline',
    title: approved ? 'Promotion approved' : 'Promotion changes required',
    body: approved
      ? `${clean(promotion.title) || 'The promotion'} for ${context.businessName} has been approved and published.`
      : `${clean(promotion.title) || 'The promotion'} requires changes.${promotion.rejectionReason ? ` ${clean(promotion.rejectionReason)}` : ''}`,
    city: context.city,
    entityId: promotionId,
    entityType: 'promotion',
  });
}

exports.nativeBusinessSubmissionCreated = onDocumentCreated(
  { document: 'businesses/{businessId}', region: REGION, secrets: EMAIL_SECRETS },
  event => notifyBusinessSubmitted(event.data.data(), event.params.businessId, false)
);

exports.nativeBusinessSubmissionUpdated = onDocumentUpdated(
  { document: 'businesses/{businessId}', region: REGION, secrets: EMAIL_SECRETS },
  async event => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== 'approved' && after.status === 'approved') return notifyBusinessDecision(after, event.params.businessId, true);
    if (before.status !== 'rejected' && after.status === 'rejected') return notifyBusinessDecision(after, event.params.businessId, false);
    if (after.status === 'pending' && !sameValue(before.submittedAt, after.submittedAt)) return notifyBusinessSubmitted(after, event.params.businessId, true);
    return null;
  }
);

exports.nativeBusinessPromotionCreated = onDocumentCreated(
  { document: 'businessPromotions/{promotionId}', region: REGION, secrets: EMAIL_SECRETS },
  event => notifyPromotionSubmitted(event.data.data(), event.params.promotionId, false)
);

exports.nativeBusinessPromotionUpdated = onDocumentUpdated(
  { document: 'businessPromotions/{promotionId}', region: REGION, secrets: EMAIL_SECRETS },
  async event => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== 'active' && after.status === 'active') return notifyPromotionDecision(after, event.params.promotionId, true);
    if (before.status !== 'rejected' && after.status === 'rejected') return notifyPromotionDecision(after, event.params.promotionId, false);
    if (after.status === 'pending' && !sameValue(before.submittedAt, after.submittedAt)) return notifyPromotionSubmitted(after, event.params.promotionId, true);
    return null;
  }
);

exports.nativeBusinessPromotionDeleted = onDocumentDeleted(
  { document: 'businessPromotions/{promotionId}', region: REGION, secrets: EMAIL_SECRETS },
  async event => {
    const promotion = event.data.data();
    const context = await promotionContext(promotion);
    const actorUid = clean(promotion.lastSubmittedBy || promotion.ownerId);
    const recipients = await getAdminRecipients(context.city, actorUid);
    return deliver(recipients, {
      type: 'promotion.deleted',
      icon: 'tag-remove-outline',
      title: 'Promotion removed by owner',
      body: `${clean(promotion.title) || 'A promotion'} for ${context.businessName} was removed by its owner.`,
      city: context.city,
      entityId: event.params.promotionId,
      entityType: 'promotion',
    });
  }
);

exports.nativeBusinessProfileUpdated = onDocumentUpdated(
  { document: 'users/{userId}', region: REGION, secrets: EMAIL_SECRETS },
  async event => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    const changedFields = PROFILE_FIELDS.filter(field => !sameValue(before[field], after[field]));
    if (!changedFields.length) return null;
    const actorUid = clean(after.lastProfileUpdatedBy || event.params.userId);
    const cities = [before.adminCity || before.defaultCity, after.adminCity || after.defaultCity].filter(Boolean);
    const recipients = await getAdminRecipients(cities.length ? cities : ['sydney'], actorUid);
    const displayName = clean(after.fullName || after.email || after.phone) || 'A user';
    return deliver(recipients, {
      type: 'profile.updated',
      icon: 'account-edit-outline',
      title: 'User profile updated',
      body: `${displayName} updated: ${changedFields.join(', ')}.`,
      city: normalizeCity(after.adminCity || after.defaultCity || before.adminCity || before.defaultCity),
      entityId: event.params.userId,
      entityType: 'user',
    });
  }
);
