'use strict';
const { createHash } = require('node:crypto');
const { isActiveRecipient } = require('./notification-policy');
const { buildWorkflowEmail } = require('./email-template');
const clean = value => String(value || '').trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const ZONES = { sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', brisbane: 'Australia/Brisbane',
  canberra: 'Australia/Sydney', adelaide: 'Australia/Adelaide', perth: 'Australia/Perth', hobart: 'Australia/Hobart', 'rest-of-australia': 'Australia/Sydney' };
const cityOf = value => Object.hasOwn(ZONES, clean(value).toLowerCase()) ? clean(value).toLowerCase() : '';
const businessCity = business => cityOf(business?.location?.city || business?.metroArea || business?.city);
const emailOf = user => clean(user?.email).toLowerCase();
const emailKey = user => hash(emailOf(user));
const revision = promotion => {
  const date = promotion?.approvedAt;
  return String(date?.toMillis?.() || (date?.seconds || date?._seconds || 0) * 1000 || '');
};
function localToday(city, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: ZONES[city] || ZONES.sydney, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function eligiblePromotion(promotion, business, now) {
  const city = businessCity(business);
  return Boolean(city && business?.status === 'approved' && business.hidden !== true
    && promotion?.status === 'active' && promotion.hidden !== true && revision(promotion)
    && validDate(promotion.startDate) && validDate(promotion.endDate)
    && promotion.startDate <= promotion.endDate && promotion.endDate >= localToday(city, now));
}
function eligibleRecipient(user, city) {
  const email = emailOf(user);
  // Explicit enabled preferences: legacy/missing preferences do not imply consent.
  return isActiveRecipient(user) && !user.migratedToUid && cityOf(user.defaultCity) === city
    && user.emailNotificationsEnabled === true && user.businessNotificationsEnabled === true
    && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function messageFor(promotion, business, city) {
  const title = `New local offer: ${clean(promotion.title).replace(/[\r\n]/g, ' ').slice(0, 150) || 'Business promotion'}`;
  return { title, body: [
    `${clean(business.name) || 'A local business'} has a newly approved promotion for ${city}.`,
    clean(promotion.title), clean(promotion.discountText || promotion.briefText),
    `Starts: ${promotion.startDate}\nEnds: ${promotion.endDate}`,
    clean(promotion.fullDetails).slice(0, 4000),
    'An upcoming offer may not be available until its start date. Check the business listing for details and conditions.',
    'Open Community Connect Australia → Business Directory → Promotions. Download/open the app: https://download.communityconnect.siza.info',
    'You are receiving this local-city announcement because business and email notifications are enabled in your profile. To stop these emails, turn off either preference in the app, or reply to support@siza.info with “Unsubscribe from promotion emails”.',
  ].filter(Boolean).join('\n\n') };
}

function createHandlers({ admin, db, buildTransporter, sender, logger, now = () => new Date() }) {
  const stamp = () => admin.firestore.FieldValue.serverTimestamp();
  async function queue(event) {
    const before = event.data?.before.data(), after = event.data?.after.data();
    if (!after || before?.status === 'active' || after.status !== 'active') return;
    if (!clean(after.businessId)) return;
    const promotionId = event.params.promotionId;
    const businessSnapshot = await db.collection('businesses').doc(clean(after.businessId)).get();
    const business = businessSnapshot.data();
    if (!eligiblePromotion(after, business, now())) return;
    const campaignRef = db.collection('promotionEmailCampaigns').doc(promotionId);
    // One campaign for the lifetime of a promotion, not one per approval event.
    await db.runTransaction(async tx => {
      if ((await tx.get(campaignRef)).exists) return;
      tx.set(campaignRef, { status: 'queueing', city: businessCity(business), promotionId,
        businessId: after.businessId, approvalRevision: revision(after), promotion: {
          title: clean(after.title), discountText: clean(after.discountText), briefText: clean(after.briefText),
          fullDetails: clean(after.fullDetails).slice(0, 4000), startDate: after.startDate, endDate: after.endDate,
        },
        businessName: clean(business.name), createdAt: stamp(), cursor: null });
    });
    let campaign = (await campaignRef.get()).data();
    if (campaign.status !== 'queueing' || campaign.approvalRevision !== revision(after)) return;
    // Resume paginated enumeration after a timeout. Deterministic recipient IDs
    // mean concurrent triggers or repeated pages cannot enqueue duplicate emails.
    while (true) {
      let query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(100);
      if (campaign.cursor) query = query.startAfter(campaign.cursor);
      const page = await query.get();
      for (let offset = 0; offset < page.docs.length; offset += 10) {
        await Promise.all(page.docs.slice(offset, offset + 10).map(async userDoc => {
          const user = userDoc.data();
          if (!eligibleRecipient(user, campaign.city)) return;
          const ref = campaignRef.collection('recipients').doc(emailKey(user));
          await db.runTransaction(async tx => {
            if ((await tx.get(ref)).exists) return;
            tx.set(ref, { uid: userDoc.id, emailHash: emailKey(user), status: 'pending', createdAt: stamp() });
          });
        }));
      }
      if (page.docs.length < 100) {
        await campaignRef.update({ status: 'queued', queuedAt: stamp() });
        return;
      }
      campaign.cursor = page.docs[page.docs.length - 1].id;
      await campaignRef.update({ cursor: campaign.cursor });
    }
  }

  async function deliver(event) {
    if (!event.data) return;
    const jobRef = event.data.ref;
    if ((await jobRef.get()).data()?.status !== 'pending') return;
    const job = event.data.data();
    const campaign = (await db.collection('promotionEmailCampaigns').doc(event.params.promotionId).get()).data();
    if (!campaign) throw new Error('Promotion campaign missing; retry before delivery.');
    const [userDoc, promotionDoc, businessDoc] = await Promise.all([
      db.collection('users').doc(job.uid).get(),
      db.collection('businessPromotions').doc(campaign.promotionId).get(),
      db.collection('businesses').doc(campaign.businessId).get(),
    ]);
    const user = userDoc.data(), promotion = promotionDoc.data(), business = businessDoc.data();
    if (!eligibleRecipient(user, campaign.city) || emailKey(user) !== job.emailHash
      || !eligiblePromotion(promotion, business, now()) || businessCity(business) !== campaign.city
      || revision(promotion) !== campaign.approvalRevision) {
      await db.runTransaction(async tx => {
        if ((await tx.get(jobRef)).data()?.status === 'pending') {
          tx.update(jobRef, { status: 'skipped', reason: 'eligibility-changed', updatedAt: stamp() });
        }
      });
      return;
    }
    const transporter = buildTransporter();
    if (!transporter) throw new Error('SMTP unavailable; no send attempted.');
    const claimed = await db.runTransaction(async tx => {
      if ((await tx.get(jobRef)).data()?.status !== 'pending') return false;
      tx.update(jobRef, { status: 'sending', startedAt: stamp() });
      return true;
    });
    if (!claimed) return;
    // SMTP is not transactional. Never automatically re-send after entering
    // sending: a crash/timeout may occur after SMTP accepted the first message.
    // sending/review-required jobs need operator reconciliation, not replay.
    try {
      const notification = messageFor(campaign.promotion, { name: campaign.businessName }, campaign.city);
      const result = await transporter.sendMail({ from: sender(), replyTo: 'support@siza.info',
        to: emailOf(user), subject: notification.title,
        headers: { 'List-Unsubscribe': '<mailto:support@siza.info?subject=Unsubscribe%20from%20promotion%20emails>' },
        ...buildWorkflowEmail(notification) });
      if (!Array.isArray(result.accepted) || !result.accepted.length) throw new Error('SMTP did not confirm acceptance.');
      await jobRef.update({ status: 'accepted', acceptedAt: stamp(), messageId: clean(result.messageId) });
    } catch (error) {
      await jobRef.update({ status: 'review-required', updatedAt: stamp() });
      logger.error('Promotion email requires delivery review; not automatically resent.', { promotionId: campaign.promotionId, recipientId: event.params.recipientId });
    }
  }
  return { queue, deliver };
}
function register(deps) {
  const handlers = createHandlers(deps);
  return {
    queueApprovedPromotionEmails: deps.onDocumentUpdated({ document: 'businessPromotions/{promotionId}', region: deps.REGION, retry: true, timeoutSeconds: 540 }, handlers.queue),
    deliverApprovedPromotionEmail: deps.onDocumentCreated({ document: 'promotionEmailCampaigns/{promotionId}/recipients/{recipientId}', region: deps.REGION, secrets: deps.EMAIL_SECRETS, retry: true, timeoutSeconds: 120, maxInstances: 5, concurrency: 1 }, handlers.deliver),
  };
}
module.exports = { register, createHandlers, eligibleRecipient, eligiblePromotion, messageFor, businessCity, revision, emailKey };
