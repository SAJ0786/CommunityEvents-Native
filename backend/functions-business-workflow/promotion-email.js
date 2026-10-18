'use strict';
const { createHash } = require('node:crypto');
const { isActiveRecipient, fcmTokens } = require('./notification-policy');
const { buildWorkflowEmail } = require('./email-template');
const catalogueModel = import('./cityCatalogue.mjs');
const clean = value => String(value || '').trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const ZONES = { sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne', brisbane: 'Australia/Brisbane',
  canberra: 'Australia/Sydney', adelaide: 'Australia/Adelaide', perth: 'Australia/Perth', hobart: 'Australia/Hobart', 'rest-of-australia': 'Australia/Sydney' };
const cityOf = (value, zones = ZONES) => Object.hasOwn(zones, clean(value).toLowerCase()) ? clean(value).toLowerCase() : '';
const businessCity = (business, zones = ZONES) => cityOf(business?.location?.city || business?.metroArea || business?.city, zones);
const emailOf = user => clean(user?.email).toLowerCase();
const emailKey = user => hash(emailOf(user));
const revision = promotion => {
  const date = promotion?.approvedAt;
  return String(date?.toMillis?.() || (date?.seconds || date?._seconds || 0) * 1000 || '');
};
function localToday(city, now = new Date(), zones = ZONES) {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zones[city], year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function eligiblePromotion(promotion, business, now, zones = ZONES) {
  const city = businessCity(business, zones);
  return Boolean(city && business?.status === 'approved' && business.hidden !== true
    && promotion?.status === 'active' && promotion.hidden !== true && revision(promotion)
    && validDate(promotion.startDate) && validDate(promotion.endDate)
    && promotion.startDate <= promotion.endDate && promotion.endDate >= localToday(city, now, zones));
}
function eligibleRecipient(user, city, zones = ZONES, audience = 'local', channel = 'email') {
  const email = emailOf(user);
  return isActiveRecipient(user) && !user.emailDisabledByBounce && !['bounced','complained','suppressed'].includes(user.emailStatus) && (!user.migratedToUid || user.migratedToUid === user.uid)
    && (channel === 'push' ? fcmTokens(user).length > 0 : email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}
function messageFor(promotion, business, city, audience = 'local') {
  const title = `New ${audience === 'australia' ? 'Australia-wide' : 'local'} offer: ${clean(promotion.title).replace(/[\r\n]/g, ' ').slice(0, 150) || 'Business promotion'}`;
  return { title, body: [
    `${clean(business.name) || 'A local business'} has a newly approved promotion for ${audience === 'australia' ? 'Australia-wide customers' : city}.`,
    clean(promotion.title), clean(promotion.discountText || promotion.briefText),
    `Starts: ${promotion.startDate}\nEnds: ${promotion.endDate}`,
    clean(promotion.fullDetails).slice(0, 4000),
    'An upcoming offer may not be available until its start date. Check the business listing for details and conditions.',
    'Open Community Connect Australia → Business Directory → Promotions. Download/open the app: https://download.communityconnect.siza.info',
    'This approved national community promotion announcement is sent under the Community Connect notification policy. Contact support@siza.info for assistance.',
  ].filter(Boolean).join('\n\n') };
}

function createHandlers({ admin, db, buildTransporter, sender, logger, now = () => new Date(), audienceEnabled = () => process.env.PROMOTION_AUDIENCE_ENABLED === 'true' }) {
  const stamp = () => admin.firestore.FieldValue.serverTimestamp();
  async function approvedAudience(id, promotion, city) {
    return 'australia'; // Approved national announcement policy in reviewed matrix N37/N39.
  }
  async function cityZones() {
    const snapshot = await db.collection('settings').doc('cityCatalogue').get();
    if (!snapshot.exists) return ZONES; // Preserve legacy behaviour until catalogue activation.
    const { validateCityCatalogue } = await catalogueModel;
    const catalogue = validateCityCatalogue(snapshot.data());
    if (!catalogue) throw new Error('Invalid city catalogue; no promotion emails attempted.');
    return Object.fromEntries(catalogue.cities.filter(city => city.enabled).map(city => [city.id, city.timeZone || ZONES['rest-of-australia']]));
  }
  async function queue(event) {
    const before = event.data?.before.data(), after = event.data?.after.data();
    if (!after || before?.status === 'active' || after.status !== 'active') return;
    if (!clean(after.businessId)) return;
    const zones = await cityZones();
    const promotionId = event.params.promotionId;
    const businessSnapshot = await db.collection('businesses').doc(clean(after.businessId)).get();
    const business = businessSnapshot.data();
    if (!eligiblePromotion(after, business, now(), zones)) return;
    const audience = await approvedAudience(promotionId, after, businessCity(business, zones));
    const campaignRef = db.collection('promotionEmailCampaigns').doc(promotionId);
    // One campaign for the lifetime of a promotion, not one per approval event.
    await db.runTransaction(async tx => {
      if ((await tx.get(campaignRef)).exists) return;
      tx.set(campaignRef, { status: 'queueing', city: businessCity(business, zones), audience, pushEnabled: audienceEnabled(), promotionId,
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
          const user = { ...userDoc.data(), uid: userDoc.id };
          for (const channel of campaign.pushEnabled ? ['email', 'push'] : ['email']) {
            if (!eligibleRecipient(user, campaign.city, zones, campaign.audience || 'local', channel)) continue;
            const ref = campaignRef.collection('recipients').doc(channel === 'push' ? `push-${hash(userDoc.id)}` : emailKey(user));
            await db.runTransaction(async tx => {
              if ((await tx.get(ref)).exists) return;
              tx.set(ref, { uid: userDoc.id, channel, emailHash: emailKey(user), status: 'pending', createdAt: stamp() });
            });
          }
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
    const zones = await cityZones();
    const job = event.data.data();
    const campaign = (await db.collection('promotionEmailCampaigns').doc(event.params.promotionId).get()).data();
    if (!campaign) throw new Error('Promotion campaign missing; retry before delivery.');
    const [userDoc, promotionDoc, businessDoc] = await Promise.all([
      db.collection('users').doc(job.uid).get(),
      db.collection('businessPromotions').doc(campaign.promotionId).get(),
      db.collection('businesses').doc(campaign.businessId).get(),
    ]);
    const user = { ...userDoc.data(), uid: userDoc.id }, promotion = promotionDoc.data(), business = businessDoc.data();
    const channel = job.channel || 'email';
    const currentAudience = await approvedAudience(campaign.promotionId, promotion, campaign.city);
    if ((campaign.audience || 'local') !== currentAudience || (channel === 'push' && !audienceEnabled())
      || !eligibleRecipient(user, campaign.city, zones, campaign.audience || 'local', channel) || (channel === 'email' && emailKey(user) !== job.emailHash)
      || !eligiblePromotion(promotion, business, now(), zones) || businessCity(business, zones) !== campaign.city
      || revision(promotion) !== campaign.approvalRevision) {
      await db.runTransaction(async tx => {
        if ((await tx.get(jobRef)).data()?.status === 'pending') {
          tx.update(jobRef, { status: 'skipped', reason: 'eligibility-changed', updatedAt: stamp() });
        }
      });
      return;
    }
    const transporter = channel === 'email' ? buildTransporter() : null;
    if (channel === 'email' && !transporter) throw new Error('SMTP unavailable; no send attempted.');
    const claimed = await db.runTransaction(async tx => {
      if ((await tx.get(jobRef)).data()?.status !== 'pending') return false;
      tx.update(jobRef, { status: 'sending', startedAt: stamp() });
      if (channel === 'push') {
        const notification = messageFor(campaign.promotion, { name: campaign.businessName }, campaign.city, campaign.audience);
        tx.set(db.collection('userNotifications').doc(`promotion-${hash(campaign.promotionId + ':' + job.uid)}`), {
          recipientUid: job.uid, module: 'directory', type: 'promotion.announcement',
          title: notification.title, body: `${campaign.businessName}: ${campaign.promotion.briefText || campaign.promotion.discountText}. Starts ${campaign.promotion.startDate}.`,
          businessId: campaign.businessId, entityId: campaign.promotionId, entityType: 'promotion',
          createdAt: stamp(), read: false,
        });
      }
      return true;
    });
    if (!claimed) return;
    // SMTP is not transactional. Never automatically re-send after entering
    // sending: a crash/timeout may occur after SMTP accepted the first message.
    // sending/review-required jobs need operator reconciliation, not replay.
    try {
      const notification = messageFor(campaign.promotion, { name: campaign.businessName }, campaign.city, campaign.audience);
      if (channel === 'push') {
        const tokens = fcmTokens(user);
        for (let offset = 0; offset < tokens.length; offset += 500) {
          const result = await admin.messaging().sendEachForMulticast({ tokens: tokens.slice(offset, offset + 500),
            notification: { title: notification.title, body: `${campaign.businessName}: ${campaign.promotion.briefText || campaign.promotion.discountText}. Starts ${campaign.promotion.startDate}.`.slice(0, 220) },
            data: { module: 'directory', type: 'promotion.announcement', recipientUid: job.uid, businessId: campaign.businessId,
              notificationId: `promotion-${hash(campaign.promotionId + ':' + job.uid)}`,
              entityId: campaign.promotionId, entityType: 'promotion', screen: 'business-notifications' },
            android: { notification: { channelId: 'business-alerts' } },
            apns: { payload: { aps: { sound: 'default' } } },
          });
          if (result.failureCount > 0) throw new Error('Some push outcomes require review; do not resend successful devices.');
        }
        await jobRef.update({ status: 'accepted', acceptedAt: stamp() });
        return;
      }
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
