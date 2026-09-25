'use strict';

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { buildWorkflowEmail, emailBrand } = require('./email-template');
const { isActiveRecipient, allowsNotification } = require('./notification-policy');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'australia-southeast1';
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');
const EMAIL_SECRETS = [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS];
const GOOGLE_PLACES_SERVER_API_KEY = defineSecret('GOOGLE_PLACES_SERVER_API_KEY');
const SUPPORT_EMAIL = 'support@siza.info';
const BUSINESS_FROM_ADDRESS = SUPPORT_EMAIL;
const BUSINESS_FROM_NAME = emailBrand('directory');
const PROFILE_FIELDS = [
  'fullName', 'email', 'phone', 'defaultCity', 'defaultModule',
  'pushNotificationsEnabled', 'smsNotificationsEnabled', 'emailNotificationsEnabled',
  'eventNotificationsEnabled', 'businessNotificationsEnabled', 'prayerRemindersEnabled',
];
const BUSINESS_ANALYTICS_ACTIONS = new Set([
  'page_view', 'contact', 'message_enquiry', 'call', 'whatsapp', 'directions',
  'share', 'website', 'facebook', 'instagram', 'x', 'promotions', 'services',
  'hours', 'favourite',
]);

function clean(value) {
  return String(value || '').trim();
}

function safePlacesSessionToken(value) {
  const token = clean(value);
  return /^[a-zA-Z0-9_-]{8,64}$/.test(token) ? token : '';
}

async function readPlacesResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error('Google Places request failed', {
      status: response.status,
      code: payload?.error?.status || '',
      message: payload?.error?.message || '',
    });
    throw new HttpsError('unavailable', 'Address search is temporarily unavailable. Please try again.');
  }
  return payload;
}

function placeComponent(components, type, short = false) {
  const component = (Array.isArray(components) ? components : [])
    .find(item => Array.isArray(item?.types) && item.types.includes(type));
  return clean(short ? component?.shortText : component?.longText);
}

function normalizeCity(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sydney';
}

function sameValue(left, right) {
  if (left && typeof left.toMillis === 'function') left = left.toMillis();
  if (right && typeof right.toMillis === 'function') right = right.toMillis();
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
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
    connectionTimeout: 15000,
    socketTimeout: 30000,
    auth: { user, pass },
  });
}

function sender() {
  return { name: BUSINESS_FROM_NAME, address: BUSINESS_FROM_ADDRESS };
}

const EMAIL_REPLY_TO = SUPPORT_EMAIL;

Object.assign(exports, require('./support-workflow').register({
  admin, db, onCall, onDocumentCreated, HttpsError, REGION, EMAIL_SECRETS, buildTransporter, logger,
}));

Object.assign(exports, require('./push-delivery').register({ admin, db, onDocumentCreated, REGION, logger }));

async function getAdminRecipients(cities, actorUid = '') {
  const citySet = new Set((Array.isArray(cities) ? cities : [cities]).filter(Boolean).map(normalizeCity));
  const snapshot = await db.collection('users').where('role', 'in', ['admin', 'superAdmin']).get();
  return snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })).filter(user => {
    if (user.uid === actorUid || !isActiveRecipient(user)) return false;
    if (user.role === 'superAdmin') return true;
    return citySet.has(normalizeCity(user.adminCity || user.defaultCity));
  });
}

async function getOwnerRecipient(ownerId, actorUid = '') {
  if (!ownerId || ownerId === actorUid) return [];
  const snapshot = await db.collection('users').doc(ownerId).get();
  if (!snapshot.exists) return [];
  const user = { ...snapshot.data(), uid: snapshot.id };
  return isActiveRecipient(user) ? [user] : [];
}

function uniqueRecipients(recipients) {
  return [...new Map(recipients.filter(Boolean).map(item => [item.uid, item])).values()];
}

async function deliver(recipients, notification) {
  const unique = uniqueRecipients(recipients).filter(user => allowsNotification(user, notification.type));
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

  // Push is sent by deliverBusinessPush from the notification document, for
  // both workflow alerts and private messages. Do not send a second push here.
  const transporter = buildTransporter();
  if (!transporter) {
    logger.warn('Business workflow email skipped because SMTP is not configured.');
    return;
  }
  const from = sender();
  const emailRecipients = unique.filter(recipient => allowsNotification(recipient, notification.type, 'email') && clean(recipient.email));
  const results = await Promise.allSettled(emailRecipients.map(recipient => transporter.sendMail({
    from,
    replyTo: SUPPORT_EMAIL,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
    to: clean(recipient.email),
    subject: notification.title,
    ...buildWorkflowEmail(notification),
  })));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error('Business workflow email failed', { uid: emailRecipients[index]?.uid, error: result.reason?.message });
      return;
    }
    logger.info('Business workflow email accepted by SMTP provider', {
      uid: emailRecipients[index]?.uid,
      messageId: clean(result.value?.messageId),
      acceptedCount: Array.isArray(result.value?.accepted) ? result.value.accepted.length : 0,
      rejectedCount: Array.isArray(result.value?.rejected) ? result.value.rejected.length : 0,
    });
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


async function notifyBusinessClosed(business, businessId) {
  const city = businessCity(business);
  const actorUid = clean(business.status === 'deleted' ? business.deletedBy : business.archivedBy);
  const recipients = [
    ...(await getOwnerRecipient(business.ownerId, actorUid)),
    ...(await getAdminRecipients(city, actorUid)),
  ];
  await deliver(recipients, {
    type: business.status === 'deleted' ? 'business.deleted' : 'business.archived',
    icon: 'store-alert-outline',
    title: business.status === 'deleted' ? 'Business listing removed' : 'Business listing closed by administrator',
    body: `${clean(business.name) || 'Your business'} is no longer publicly listed. Open Notifications for details or contact support@siza.info.`,
    city, entityId: businessId, entityType: 'business',
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
    if (before.status !== after.status && ['archived', 'deleted'].includes(after.status)) return notifyBusinessClosed(after, event.params.businessId);
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

// Non-takedown moderation outcomes also require an owner notification.
// Takedown already changes the listing to archived and uses notifyBusinessClosed.
exports.nativeBusinessModerationNoticeCreated = onDocumentCreated(
  { document: 'businessModerationNotices/{noticeId}', region: REGION, secrets: EMAIL_SECRETS },
  async event => {
    const notice = event.data.data();
    if (notice.decision === 'takedown') return null;
    const recipients = await getOwnerRecipient(notice.ownerUid);
    return deliver(recipients, {
      type: 'business.moderated', title: 'Business moderation update', icon: 'shield-alert-outline',
      body: `There is an administrative decision for ${clean(notice.businessName) || 'your business'}. Open Notifications to review it.`,
      entityId: notice.businessId || '', entityType: 'business',
    });
  }
);

exports.sendBusinessEnquiry = onCall(
  { region: REGION, enforceAppCheck: false },
  async request => {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Sign in is required to contact a business.');
    }
    const businessId = clean(request.data?.businessId);
    const text = clean(request.data?.text);
    const senderName = clean(request.data?.senderName) || 'Community member';
    if (!businessId || businessId.length > 160) throw new HttpsError('invalid-argument', 'Business reference is invalid.');
    if (!text || text.length > 2000) throw new HttpsError('invalid-argument', 'Enter a message of up to 2000 characters.');

    const [businessSnapshot, publicSnapshot, routeSnapshot] = await Promise.all([
      db.collection('businesses').doc(businessId).get(),
      db.collection('publicBusinesses').doc(businessId).get(),
      db.collection('businessContactRoutes').doc(businessId).get(),
    ]);
    if (!businessSnapshot.exists || !publicSnapshot.exists) throw new HttpsError('not-found', 'This public business could not be found.');
    const business = businessSnapshot.data() || {};
    // The route is the published contact target and may be newer than the
    // private business record after an ownership transfer.
    const route = routeSnapshot.data() || {};
    let ownerUid = clean(route.active === true ? route.ownerUid : '') || clean(business.ownerId);
    if (!ownerUid || business.hidden === true || (business.status !== 'approved' && business.hasPublishedVersion !== true)) {
      throw new HttpsError('failed-precondition', 'This business does not have an active in-app contact inbox.');
    }
    if (ownerUid === request.auth.uid) throw new HttpsError('failed-precondition', 'This business listing is already managed by you.');

    const senderUid = request.auth.uid;
    const threadId = `${businessId}_${senderUid}_${ownerUid}`;
    const threadReference = db.collection('businessMessageThreads').doc(threadId);
    const messageReference = threadReference.collection('messages').doc();
    const isNew = await db.runTransaction(async transaction => {
      const threadSnapshot = await transaction.get(threadReference);
      const existingThread = threadSnapshot.data() || {};
      if (existingThread.adminBlocked === true || Object.values(existingThread.blockedBy || {}).some(Boolean)) {
        throw new HttpsError('failed-precondition', 'This conversation is blocked.');
      }
      transaction.set(threadReference, {
        type: 'business',
        businessId,
        businessName: clean(publicSnapshot.data()?.name || business.name) || 'Community Business',
        ownerUid,
        senderUid,
        senderName,
        participantUids: [senderUid, ownerUid],
        ...(threadSnapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: text,
        lastSenderUid: senderUid,
        unreadBy: {
          [ownerUid]: admin.firestore.FieldValue.increment(1),
          [senderUid]: 0,
        },
      }, { merge: true });
      transaction.set(messageReference, {
        senderUid,
        senderName,
        text,
        kind: 'text',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(db.collection('businessContactRoutes').doc(businessId), {
        businessId,
        ownerUid,
        active: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return !threadSnapshot.exists;
    });
    return { threadId, isNew };
  }
);

exports.recordBusinessInteraction = onCall(
  { region: REGION, enforceAppCheck: false },
  async request => {
    const businessId = clean(request.data?.businessId);
    const action = clean(request.data?.action);
    const threadId = clean(request.data?.threadId);
    if (!businessId || businessId.length > 160) throw new HttpsError('invalid-argument', 'Business reference is invalid.');
    if (!BUSINESS_ANALYTICS_ACTIONS.has(action)) throw new HttpsError('invalid-argument', 'Statistics action is invalid.');

    const businessSnapshot = await db.collection('publicBusinesses').doc(businessId).get();
    if (!businessSnapshot.exists) throw new HttpsError('not-found', 'This public business could not be found.');
    const business = businessSnapshot.data() || {};

    let enquiryMarker = null;
    if (action === 'message_enquiry') {
      if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
        throw new HttpsError('unauthenticated', 'Sign in is required to record an enquiry.');
      }
      if (!threadId || threadId.length > 500) throw new HttpsError('invalid-argument', 'Conversation reference is invalid.');
      const threadSnapshot = await db.collection('businessMessageThreads').doc(threadId).get();
      const thread = threadSnapshot.data() || {};
      if (!threadSnapshot.exists || clean(thread.businessId) !== businessId || clean(thread.senderUid) !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'This enquiry could not be verified.');
      }
      enquiryMarker = db.collection('businessStatistics').doc(businessId).collection('enquiries').doc(threadId);
    }

    const statisticsReference = db.collection('businessStatistics').doc(businessId);
    const counted = await db.runTransaction(async transaction => {
      if (enquiryMarker) {
        const markerSnapshot = await transaction.get(enquiryMarker);
        if (markerSnapshot.exists) return false;
      }
      const statisticsSnapshot = await transaction.get(statisticsReference);
      const current = statisticsSnapshot.data() || {};
      const currentActions = current.actions && typeof current.actions === 'object' ? current.actions : {};
      const next = {
        businessId,
        businessName: clean(business.name) || 'Community Business',
        city: businessCity(business),
        categoryIds: Array.isArray(business.categoryIds) ? business.categoryIds.map(clean).filter(Boolean) : [clean(business.categoryId)].filter(Boolean),
        subcategoryIds: Array.isArray(business.subcategoryIds) ? business.subcategoryIds.map(clean).filter(Boolean) : [],
        pageViews: Number(current.pageViews || 0) + (action === 'page_view' ? 1 : 0),
        enquiries: Number(current.enquiries || 0) + (action === 'message_enquiry' ? 1 : 0),
        actions: {
          ...currentActions,
          [action]: Number(currentActions[action] || 0) + 1,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastInteractionAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      transaction.set(statisticsReference, next, { merge: true });
      if (enquiryMarker) transaction.set(enquiryMarker, {
        businessId,
        threadId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    return { counted };
  }
);

exports.autocompleteAustralianAddresses = onCall(
  { region: REGION, enforceAppCheck: false, secrets: [GOOGLE_PLACES_SERVER_API_KEY] },
  async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Open an app session before searching for an address.');
    const input = clean(request.data?.input);
    if (input.length < 3) return { suggestions: [] };
    if (input.length > 180) throw new HttpsError('invalid-argument', 'Address search is too long.');
    const apiKey = clean(GOOGLE_PLACES_SERVER_API_KEY.value());
    if (!apiKey) throw new HttpsError('failed-precondition', 'Address search is not configured.');

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['au'],
        regionCode: 'au',
        languageCode: 'en-AU',
        sessionToken: safePlacesSessionToken(request.data?.sessionToken) || undefined,
      }),
    });
    const payload = await readPlacesResponse(response);
    const suggestions = (payload.suggestions || [])
      .map(item => item?.placePrediction)
      .filter(Boolean)
      .slice(0, 8)
      .map(prediction => ({
        placeId: clean(prediction.placeId),
        fullText: clean(prediction.text?.text),
        primaryText: clean(prediction.structuredFormat?.mainText?.text || prediction.text?.text),
        secondaryText: clean(prediction.structuredFormat?.secondaryText?.text),
      }))
      .filter(item => item.placeId && item.fullText);
    return { suggestions };
  }
);

exports.getAustralianAddressDetails = onCall(
  { region: REGION, enforceAppCheck: false, secrets: [GOOGLE_PLACES_SERVER_API_KEY] },
  async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Open an app session before selecting an address.');
    const placeId = clean(request.data?.placeId);
    if (!placeId || placeId.length > 300) throw new HttpsError('invalid-argument', 'Select an address from the suggestions.');
    const apiKey = clean(GOOGLE_PLACES_SERVER_API_KEY.value());
    if (!apiKey) throw new HttpsError('failed-precondition', 'Address search is not configured.');
    const params = new URLSearchParams({ languageCode: 'en-AU', regionCode: 'au' });
    const sessionToken = safePlacesSessionToken(request.data?.sessionToken);
    if (sessionToken) params.set('sessionToken', sessionToken);
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
      },
    });
    const place = await readPlacesResponse(response);
    const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
    const country = placeComponent(components, 'country', true);
    if (country && country !== 'AU') throw new HttpsError('invalid-argument', 'Please select an Australian address.');
    const streetNumber = placeComponent(components, 'street_number');
    const route = placeComponent(components, 'route');
    return {
      address: {
        placeId: clean(place.id || placeId),
        fullAddress: clean(place.formattedAddress),
        street: [streetNumber, route].filter(Boolean).join(' '),
        suburb: placeComponent(components, 'locality')
          || placeComponent(components, 'postal_town')
          || placeComponent(components, 'administrative_area_level_2'),
        state: placeComponent(components, 'administrative_area_level_1', true),
        postcode: placeComponent(components, 'postal_code'),
        latitude: Number(place.location?.latitude),
        longitude: Number(place.location?.longitude),
      },
    };
  }
);
