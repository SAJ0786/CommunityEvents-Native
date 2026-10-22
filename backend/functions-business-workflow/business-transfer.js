'use strict';

const clean = value => typeof value === 'string' ? value.trim() : '';
const city = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sydney';
const active = (user,uid) => user && user.active !== false && user.isActive !== false && (!user.migratedToUid || user.migratedToUid === uid) && !user.bannedAt && !user.archivedAt && !user.accountDeletedAt && !['inactive','banned','deleted','archived','suspended'].includes(user.accountStatus);

function createTransfer({ db, admin, HttpsError }) {
  return async request => {
    const fail = (code,message) => { throw new HttpsError(code,message); };
    if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('unauthenticated','Sign in as an administrator.');
    const businessId=clean(request.data?.businessId), toUid=clean(request.data?.toUid), expectedOwnerId=clean(request.data?.expectedOwnerId);
    if (![businessId,toUid,expectedOwnerId].every(id=>id && id.length<=160 && !id.includes('/'))) fail('invalid-argument','Choose a business and a new owner.');
    if (request.data.confirmation !== 'TRANSFER BUSINESS') fail('invalid-argument','Confirm the business transfer.');
    return db.runTransaction(async tx => {
      const ref=db.collection('businesses').doc(businessId);
      const [actorSnap,businessSnap,targetSnap]=await Promise.all([
        tx.get(db.collection('users').doc(request.auth.uid)),tx.get(ref),tx.get(db.collection('users').doc(toUid)),
      ]);
      const actor=actorSnap.data(), business=businessSnap.data(), target=targetSnap.data();
      if (!active(actor,request.auth.uid) || !['admin','superAdmin'].includes(actor.role)) fail('permission-denied','Administrator access required.');
      if (!businessSnap.exists) fail('not-found','This business could not be found.');
      if (['archived','deleted'].includes(business.status)) fail('failed-precondition','Restore this historical listing before transferring it.');
      if (actor.role !== 'superAdmin' && city(business.location?.city) !== city(actor.adminCity || actor.defaultCity)) fail('permission-denied','You can only transfer businesses in your city.');
      if (business.ownerId !== expectedOwnerId) fail('aborted','The business owner has changed. Reload before transferring.');
      if (business.ownerId === toUid) fail('invalid-argument','Choose a different owner.');
      if (!targetSnap.exists || !active(target,toUid)) fail('failed-precondition','Choose an active member account.');
      if (actor.role !== 'superAdmin' && city(target.adminCity || target.defaultCity) !== city(actor.adminCity || actor.defaultCity)) fail('permission-denied','Choose a member in your city.');
      const promotions=await tx.get(db.collection('businessPromotions').where('businessId','==',businessId).limit(401));
      if (promotions.size>400) fail('resource-exhausted','This business has too many promotions for an atomic transfer. Contact support.');
      const timestamp=admin.firestore.FieldValue.serverTimestamp();
      const owner={ownerId:toUid,ownerEmail:clean(target.email),ownerName:clean(target.fullName || target.displayName || target.name),updatedAt:timestamp};
      tx.update(ref,{...owner,originalOwnerId:business.originalOwnerId || business.ownerId,ownershipTransferredBy:request.auth.uid,ownershipTransferredAt:timestamp});
      promotions.docs.forEach(promotion=>tx.update(promotion.ref,{...owner,ownershipTransferredBy:request.auth.uid,ownershipTransferredAt:timestamp}));
      // Ownership does not publish or unhide a listing or alter its public content.
      tx.set(db.collection('businessContactRoutes').doc(businessId),{businessId,ownerUid:toUid,active:business.hidden !== true && (business.status === 'approved' || business.hasPublishedVersion === true),updatedAt:timestamp});
      tx.set(db.collection('businessAudit').doc(),{actorId:request.auth.uid,businessId,action:'business.ownership_transferred',fromUid:business.ownerId,toUid,promotionsTransferred:promotions.size,createdAt:timestamp});
      return {businessId,ownerId:toUid,promotionsTransferred:promotions.size};
    });
  };
}

function register(deps) {
  return {transferBusinessOwnership:deps.onCall({region:deps.REGION,enforceAppCheck:false},createTransfer(deps))};
}
module.exports={createTransfer,register};
