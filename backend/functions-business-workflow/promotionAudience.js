'use strict';
const { isActiveRecipient } = require('./notification-policy');
const model = import('./cityCatalogue.mjs');
const { eligiblePromotion } = require('./promotion-email');
const clean = value => typeof value === 'string' ? value.trim() : '';
function createApproval({ db, admin, HttpsError, enabled = () => process.env.PROMOTION_AUDIENCE_ENABLED === 'true' }) {
  return async request => {
    const fail = (code, message) => { throw new HttpsError(code, message); };
    if (!enabled()) fail('failed-precondition', 'Promotion audience review is not enabled.');
    if (!request.auth?.uid) fail('unauthenticated', 'Sign in as an administrator.');
    const id = clean(request.data?.promotionId), audience = request.data?.audience;
    if (!id || id.includes('/') || !['local', 'australia'].includes(audience)) fail('invalid-argument', 'Choose the promotion and audience.');
    if (request.data?.confirmAudience !== true) fail('invalid-argument', 'Confirm the notification audience.');
    const { BUNDLED_CITY_CATALOGUE, validateCityCatalogue } = await model;
    const ref = db.collection('businessPromotions').doc(id);
    return db.runTransaction(async tx => {
      const [userSnap, promotionSnap, catalogueSnap] = await Promise.all([
        tx.get(db.collection('users').doc(request.auth.uid)), tx.get(ref),
        tx.get(db.collection('settings').doc('cityCatalogue')),
      ]);
      const user = userSnap.data();
      if (!isActiveRecipient(user) || !['admin', 'superAdmin'].includes(user.role)) fail('permission-denied', 'Administrator access required.');
      const promotion = promotionSnap.data();
      if (!promotion || !['pending', 'active', 'rejected'].includes(promotion.status)) fail('failed-precondition', 'This promotion cannot be approved.');
      if (audience === 'australia' && promotion.requestedAudience !== 'australia') fail('failed-precondition', 'The business did not request Australia-wide delivery.');
      const business = (await tx.get(db.collection('businesses').doc(promotion.businessId))).data();
      const catalogue = validateCityCatalogue(catalogueSnap.exists ? catalogueSnap.data() : BUNDLED_CITY_CATALOGUE);
      if (!catalogue) fail('failed-precondition', 'City catalogue is invalid.');
      const zones = Object.fromEntries(catalogue.cities.filter(city => city.enabled).map(city => [city.id, city.timeZone || 'Australia/Sydney']));
      const approvedAt = admin.firestore.Timestamp.now();
      if (!eligiblePromotion({ ...promotion, status: 'active', hidden: false, approvedAt }, business, new Date(), zones)) fail('failed-precondition', 'Check the business, city and promotion dates before approving.');
      const city = business.location?.city || business.metroArea || business.city;
      const proof = { audience, city, approvalRevision: String(approvedAt.toMillis()), approvedBy: request.auth.uid };
      const boosted = request.data?.boosted === true;
      tx.update(ref, { status: 'active', hidden: false, boosted, rejectionReason: '', approvedAudience: audience,
        approvedAt, approvedBy: request.auth.uid, reviewedAt: approvedAt, updatedAt: approvedAt });
      // This server-only document, not owner-writable promotion fields, authorises a broadcast.
      tx.set(db.collection('promotionAudienceApprovals').doc(id), proof);
      tx.set(db.collection('businessAudit').doc(`promotion-audience-${id}-${approvedAt.toMillis()}`), {
        businessId: promotion.businessId, action: 'promotion.approved', actorId: request.auth.uid, actorEmail: clean(user.email),
        details: { promotionId: id, audience, boosted }, createdAt: approvedAt,
      });
      const projection = Object.fromEntries(['businessId','title','briefText','discountText','fullDetails','startDate','endDate','imageUrl'].map(key => [key, clean(promotion[key])]));
      tx.set(db.collection('publicBusinessPromotions').doc(id), { ...projection, status: 'active', hidden: false, boosted,
        approvedAudience: audience, approvedAt, updatedAt: approvedAt });
      return { approved: true, audience };
    });
  };
}
function register(deps) {
  return { approvePromotionAudience: deps.onCall({ region: deps.REGION, enforceAppCheck: true }, createApproval(deps)) };
}
module.exports = { createApproval, register };
