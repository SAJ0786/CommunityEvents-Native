import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { db, ensureFirebaseSession, functions } from '../firebase/firebase';

const COLLECTION_NAME = 'businesses';
const PUBLIC_COLLECTION_NAME = 'publicBusinesses';
const CONTACT_ROUTES_COLLECTION = 'businessContactRoutes';
const PROMOTIONS_COLLECTION = 'businessPromotions';
const PUBLIC_PROMOTIONS_COLLECTION = 'publicBusinessPromotions';
const AUDIT_COLLECTION = 'businessAudit';
const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export const BUSINESS_STATUSES = {
  pending: { label: 'Pending review', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Changes required', tone: 'red' },
};

export function normalizeAbn(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

export function formatAbn(value) {
  const digits = normalizeAbn(value);
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 11)]
    .filter(Boolean)
    .join(' ');
}

export function isValidAbn(value) {
  const digits = normalizeAbn(value);
  if (digits.length !== 11) return false;
  const values = digits.split('').map(Number);
  values[0] -= 1;
  return values.reduce((sum, digit, index) => sum + digit * ABN_WEIGHTS[index], 0) % 89 === 0;
}

function clean(value) {
  return String(value || '').trim();
}

function cleanUrl(value) {
  const url = clean(value);
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function cleanHours(hours = {}) {
  return Object.fromEntries(Object.entries(hours).map(([day, value]) => [day, {
    closed: Boolean(value?.closed),
    open: clean(value?.open),
    close: clean(value?.close),
  }]));
}

export function validateBusinessPayload(payload = {}) {
  const errors = {};
  const contact = payload.contact || {};
  const location = payload.location || {};
  if (clean(payload.name).length < 2) errors.name = 'Enter the registered or trading business name.';
  const abnStatus = clean(payload.abnStatus) || (normalizeAbn(payload.abn) ? 'has' : 'none');
  if (abnStatus === 'has' && !isValidAbn(payload.abn)) errors.abn = 'Enter a valid 11-digit Australian Business Number.';
  if (!clean(payload.categoryId)) errors.categoryId = 'Choose a business category.';
  if (!Array.isArray(payload.subcategoryIds) || !payload.subcategoryIds.length) errors.subcategoryIds = 'Choose at least one service subcategory.';
  if (clean(payload.description).length < 40) errors.description = 'Add at least 40 characters describing the business.';
  if (clean(contact.phone).replace(/\D/g, '').length < 8) errors.phone = 'Enter a valid business phone number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(contact.email))) errors.email = 'Enter a valid business email address.';
  if (!clean(location.fullAddress) || !clean(location.suburb) || !clean(location.state)
    || !clean(location.postcode) || !Number.isFinite(Number(location.latitude))
    || !Number.isFinite(Number(location.longitude))) {
    errors.location = 'Select the full Australian address from Google suggestions.';
  }
  if (payload.listingDeclarationAccepted !== true) errors.declaration = 'Accept the business listing declaration.';
  return errors;
}

function submissionFields(payload = {}) {
  const contact = payload.contact || {};
  const location = payload.location || {};
  const social = payload.social || {};
  return {
    name: clean(payload.name),
    nameLower: clean(payload.name).toLowerCase(),
    description: clean(payload.description),
    categoryId: clean(payload.categoryId),
    category: clean(payload.category),
    subcategoryIds: Array.isArray(payload.subcategoryIds) ? payload.subcategoryIds.map(clean).filter(Boolean) : [],
    subcategories: Array.isArray(payload.subcategories) ? payload.subcategories.map(clean).filter(Boolean) : [],
    abnStatus: clean(payload.abnStatus) || (normalizeAbn(payload.abn) ? 'has' : 'none'),
    abn: normalizeAbn(payload.abn),
    logoUrl: clean(payload.logoUrl),
    logoPath: clean(payload.logoPath),
    coverUrl: clean(payload.coverUrl),
    coverPath: clean(payload.coverPath),
    contact: {
      phone: clean(contact.phone),
      whatsapp: clean(contact.whatsapp),
      email: clean(contact.email).toLowerCase(),
      website: cleanUrl(contact.website),
    },
    social: {
      facebook: cleanUrl(social.facebook),
      instagram: cleanUrl(social.instagram),
      twitter: cleanUrl(social.twitter || social.x),
    },
    location: {
      placeId: clean(location.placeId),
      fullAddress: clean(location.fullAddress),
      street: clean(location.street),
      suburb: clean(location.suburb),
      state: clean(location.state),
      postcode: clean(location.postcode),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      city: clean(location.city),
      publicDisplay: location.publicDisplay === 'full' ? 'full' : 'suburb',
    },
    hours: cleanHours(payload.hours),
    hoursSummary: clean(payload.hoursSummary),
  };
}

function roundedCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function publicLocation(location = {}) {
  const showFullAddress = location.publicDisplay === 'full';
  const suburbLine = [clean(location.suburb), clean(location.state), clean(location.postcode)].filter(Boolean).join(' ');
  return {
    fullAddress: showFullAddress ? clean(location.fullAddress) : suburbLine,
    suburb: clean(location.suburb),
    state: clean(location.state),
    postcode: clean(location.postcode),
    city: clean(location.city),
    publicDisplay: showFullAddress ? 'full' : 'suburb',
    latitude: showFullAddress ? Number(location.latitude) : roundedCoordinate(location.latitude),
    longitude: showFullAddress ? Number(location.longitude) : roundedCoordinate(location.longitude),
  };
}

function publicBusinessFields(business = {}, approval = {}) {
  const hasVerifiedAbn = Boolean(normalizeAbn(business.abn)) && approval.abnVerified === true;
  return {
    name: clean(business.name),
    nameLower: clean(business.nameLower || business.name).toLowerCase(),
    description: clean(business.description),
    categoryId: clean(business.categoryId),
    category: clean(business.category),
    subcategoryIds: Array.isArray(business.subcategoryIds) ? business.subcategoryIds : [],
    subcategories: Array.isArray(business.subcategories) ? business.subcategories : [],
    logoUrl: clean(business.logoUrl),
    coverUrl: clean(business.coverUrl),
    contact: {
      phone: clean(business.contact?.phone),
      whatsapp: clean(business.contact?.whatsapp),
      email: clean(business.contact?.email).toLowerCase(),
      website: cleanUrl(business.contact?.website),
    },
    social: {
      facebook: cleanUrl(business.social?.facebook),
      instagram: cleanUrl(business.social?.instagram),
      twitter: cleanUrl(business.social?.twitter || business.social?.x),
    },
    location: publicLocation(business.location),
    hours: cleanHours(business.hours),
    hoursSummary: clean(business.hoursSummary),
    status: 'approved',
    hidden: false,
    tier: ['free', 'standard', 'featured'].includes(approval.tier) ? approval.tier : 'free',
    abnVerified: hasVerifiedAbn,
    verificationBadge: hasVerifiedAbn ? 'ABN Verified' : '',
    abnCheckedAt: hasVerifiedAbn ? business.abnCheckedAt || null : null,
    foundingMember: Boolean(approval.foundingMember),
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function mapBusiness(item) {
  return { id: item.id, ...item.data() };
}

function sortOwnerBusinesses(rows = []) {
  return [...rows].sort((left, right) => {
    const leftTime = left.updatedAt?.toMillis?.() || left.createdAt?.toMillis?.() || 0;
    const rightTime = right.updatedAt?.toMillis?.() || right.createdAt?.toMillis?.() || 0;
    return rightTime - leftTime;
  });
}

function sortNewest(rows = []) {
  return [...rows].sort((left, right) => {
    const leftTime = left.updatedAt?.toMillis?.() || left.createdAt?.toMillis?.() || 0;
    const rightTime = right.updatedAt?.toMillis?.() || right.createdAt?.toMillis?.() || 0;
    return rightTime - leftTime;
  });
}

function auditRecord(actor, businessId, action, details = {}) {
  return {
    actorId: actor.uid,
    actorEmail: actor.email || '',
    businessId,
    action,
    details,
    createdAt: serverTimestamp(),
  };
}

async function requireRegisteredUser() {
  const user = await ensureFirebaseSession();
  if (!user || user.isAnonymous) throw new Error('Sign in or create an account to manage a business listing.');
  return user;
}

export async function assertBusinessSubmissionConnectivity(timeoutMs = 8000) {
  let timeoutId;
  try {
    await Promise.race([
      fetch('https://firestore.googleapis.com/', {
        method: 'HEAD',
        cache: 'no-store',
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Connection check timed out.')), timeoutMs);
      }),
    ]);
  } catch {
    throw new Error('No internet connection. Your business has not been submitted and the completed form is still available. Reconnect, then tap Submit Business for Review again.');
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function createBusinessSubmission(payload = {}) {
  const user = await requireRegisteredUser();
  const errors = validateBusinessPayload(payload);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const reference = await addDoc(collection(db, COLLECTION_NAME), {
    ...submissionFields(payload),
    ownerId: user.uid,
    ownerEmail: user.email || payload.contact?.email || '',
    ownerPhone: user.phoneNumber || '',
    lastSubmittedBy: user.uid,
    status: 'pending',
    tier: 'free',
    abnVerified: false,
    identityVerified: false,
    verificationBadge: normalizeAbn(payload.abn) ? 'Pending ABN verification' : '',
    listingDeclarationAccepted: true,
    listingTermsVersion: clean(payload.listingTermsVersion),
    listingConsentAtClient: clean(payload.listingConsentAtClient),
    listingConsentAt: serverTimestamp(),
    foundingMember: false,
    foundingMemberCandidate: true,
    hidden: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function updateBusinessSubmission(businessId, payload = {}) {
  const user = await requireRegisteredUser();
  if (!businessId) throw new Error('Business reference is missing.');
  const errors = validateBusinessPayload(payload);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const reference = doc(db, COLLECTION_NAME, businessId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('This business listing could not be found.');
  const current = snapshot.data() || {};
  if (current.ownerId !== user.uid) throw new Error('Only the listing owner can edit this business.');
  const batch = writeBatch(db);
  batch.update(reference, {
    ...submissionFields(payload),
    previousStatus: current.status || 'pending',
    status: 'pending',
    abnVerified: false,
    identityVerified: false,
    verificationBadge: normalizeAbn(payload.abn) ? 'Pending ABN verification' : '',
    abrVerification: null,
    abnCheckedAt: null,
    listingDeclarationAccepted: true,
    listingTermsVersion: clean(payload.listingTermsVersion),
    listingConsentAtClient: clean(payload.listingConsentAtClient),
    listingConsentAt: serverTimestamp(),
    rejectionReason: '',
    lastSubmittedBy: user.uid,
    updatedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
  });
  batch.delete(doc(db, PUBLIC_COLLECTION_NAME, businessId));
  batch.delete(doc(db, CONTACT_ROUTES_COLLECTION, businessId));
  await batch.commit();
  return businessId;
}

export async function getOwnerBusinesses(ownerId) {
  if (!ownerId) return [];
  const snapshot = await getDocs(query(collection(db, COLLECTION_NAME), where('ownerId', '==', ownerId)));
  return sortOwnerBusinesses(snapshot.docs.map(mapBusiness));
}

export function listenOwnerBusinesses(ownerId, onBusinesses, onError) {
  if (!ownerId) {
    onBusinesses?.([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, COLLECTION_NAME), where('ownerId', '==', ownerId)),
    snapshot => onBusinesses?.(sortOwnerBusinesses(snapshot.docs.map(mapBusiness))),
    error => onError?.(error)
  );
}

export function listenApprovedBusinesses(onBusinesses, onError) {
  return onSnapshot(
    collection(db, PUBLIC_COLLECTION_NAME),
    snapshot => onBusinesses?.(sortOwnerBusinesses(snapshot.docs.map(mapBusiness))),
    error => onError?.(error)
  );
}

export function listenBusinessesForAdmin(onBusinesses, onError) {
  return onSnapshot(
    collection(db, COLLECTION_NAME),
    snapshot => onBusinesses?.(sortOwnerBusinesses(snapshot.docs.map(mapBusiness))),
    error => onError?.(error)
  );
}

export async function syncApprovedBusinessProjections() {
  const user = await requireAdminSession();
  const businessSnapshot = await getDocs(query(collection(db, COLLECTION_NAME), where('status', '==', 'approved')));
  const approvedBusinesses = businessSnapshot.docs.filter(item => item.data()?.hidden !== true);
  let syncedBusinesses = 0;
  for (let start = 0; start < approvedBusinesses.length; start += 150) {
    const batch = writeBatch(db);
    approvedBusinesses.slice(start, start + 150).forEach(item => {
      const business = item.data() || {};
      batch.set(doc(db, PUBLIC_COLLECTION_NAME, item.id), publicBusinessFields(business, {
        tier: business.tier,
        abnVerified: business.abnVerified,
        foundingMember: business.foundingMember,
      }));
      batch.set(doc(db, CONTACT_ROUTES_COLLECTION, item.id), {
        businessId: item.id,
        ownerUid: business.ownerId,
        active: true,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, AUDIT_COLLECTION)), auditRecord(user, item.id, 'business.public_projection_synced'));
    });
    await batch.commit();
    syncedBusinesses += Math.min(150, approvedBusinesses.length - start);
  }

  const promotionSnapshot = await getDocs(query(collection(db, PROMOTIONS_COLLECTION), where('status', '==', 'active')));
  const activePromotions = promotionSnapshot.docs.filter(item => item.data()?.hidden !== true);
  let syncedPromotions = 0;
  for (let start = 0; start < activePromotions.length; start += 400) {
    const batch = writeBatch(db);
    activePromotions.slice(start, start + 400).forEach(item => {
      const promotion = item.data() || {};
      batch.set(doc(db, PUBLIC_PROMOTIONS_COLLECTION, item.id), publicPromotionFields(promotion, promotion.boosted));
    });
    await batch.commit();
    syncedPromotions += Math.min(400, activePromotions.length - start);
  }
  return { businesses: syncedBusinesses, promotions: syncedPromotions };
}

async function requireAdminSession() {
  const user = await requireRegisteredUser();
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  const role = snapshot.data()?.role;
  if (role !== 'admin' && role !== 'superAdmin') {
    throw new Error('Administrator access is required for this action.');
  }
  return user;
}

export async function verifyBusinessAbn(businessId) {
  await requireAdminSession();
  if (!businessId) throw new Error('Business reference is missing.');
  const callable = httpsCallable(functions, 'verifyBusinessAbn');
  const result = await callable({ businessId });
  return result.data || {};
}

export async function approveBusinessListing(businessId, options = {}) {
  const user = await requireAdminSession();
  if (!businessId) throw new Error('Business reference is missing.');
  const snapshot = await getDoc(doc(db, COLLECTION_NAME, businessId));
  if (!snapshot.exists()) throw new Error('This business listing could not be found.');
  const business = snapshot.data() || {};
  const hasAbn = Boolean(normalizeAbn(business.abn));
  if (hasAbn) {
    const verification = await verifyBusinessAbn(businessId);
    if (verification.verified !== true) {
      const officialNames = [verification.entityName, ...(verification.businessNames || [])].filter(Boolean).join(', ');
      throw new Error(verification.status === 'name_review_required'
        ? `The submitted business name does not match the ABR record${officialNames ? ` (${officialNames})` : ''}. Keep the listing private and request a correction.`
        : 'The ABR service did not confirm an active matching ABN. The listing remains private.');
    }
  }
  if (!hasAbn && options.publishWithoutAbn !== true) throw new Error('Confirm that this basic listing may be published without an ABN or verification badge.');
  const verifiedSnapshot = hasAbn ? await getDoc(doc(db, COLLECTION_NAME, businessId)) : snapshot;
  const verifiedBusiness = verifiedSnapshot.data() || business;
  if (hasAbn && !(
    verifiedBusiness.abnVerified === true
    && verifiedBusiness.abrVerification?.status === 'verified'
    && normalizeAbn(verifiedBusiness.abrVerification?.abn) === normalizeAbn(verifiedBusiness.abn)
  )) {
    throw new Error('ABR verification was not recorded. The listing remains private.');
  }
  const requestedTier = ['free', 'standard', 'featured'].includes(options.tier) ? options.tier : 'free';
  const tier = hasAbn ? requestedTier : 'free';
  const verificationBadge = hasAbn ? 'ABN Verified' : '';
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION_NAME, businessId), {
    status: 'approved',
    hidden: false,
    tier,
    abnVerified: hasAbn,
    identityVerified: false,
    verificationBadge,
    foundingMember: Boolean(options.foundingMember),
    rejectionReason: '',
    approvedBy: user.uid,
    approvedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, PUBLIC_COLLECTION_NAME, businessId), publicBusinessFields(verifiedBusiness, {
    tier,
    abnVerified: hasAbn,
    foundingMember: Boolean(options.foundingMember),
  }));
  batch.set(doc(db, CONTACT_ROUTES_COLLECTION, businessId), {
    businessId,
    ownerUid: business.ownerId,
    active: true,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, AUDIT_COLLECTION)), auditRecord(user, businessId, 'business.approved', {
    tier,
    abnVerified: hasAbn,
    identityVerified: false,
    publishedWithoutAbn: !hasAbn,
    foundingMember: Boolean(options.foundingMember),
  }));
  await batch.commit();
}

export async function rejectBusinessListing(businessId, reason) {
  const user = await requireAdminSession();
  const cleanReason = clean(reason);
  if (!businessId) throw new Error('Business reference is missing.');
  if (cleanReason.length < 10) throw new Error('Add a clear rejection reason of at least 10 characters.');
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTION_NAME, businessId), {
    status: 'rejected',
    hidden: true,
    rejectionReason: cleanReason,
    rejectedBy: user.uid,
    rejectedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.delete(doc(db, PUBLIC_COLLECTION_NAME, businessId));
  batch.delete(doc(db, CONTACT_ROUTES_COLLECTION, businessId));
  batch.set(doc(collection(db, AUDIT_COLLECTION)), auditRecord(user, businessId, 'business.changes_requested', { reason: cleanReason }));
  await batch.commit();
}

export async function setBusinessVisibility(businessId, hidden) {
  const user = await requireAdminSession();
  if (!businessId) throw new Error('Business reference is missing.');
  const reference = doc(db, COLLECTION_NAME, businessId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('This business listing could not be found.');
  const business = snapshot.data() || {};
  const batch = writeBatch(db);
  batch.update(reference, {
    hidden: Boolean(hidden),
    updatedAt: serverTimestamp(),
  });
  if (hidden) {
    batch.delete(doc(db, PUBLIC_COLLECTION_NAME, businessId));
    batch.delete(doc(db, CONTACT_ROUTES_COLLECTION, businessId));
  } else if (business.status === 'approved') {
    batch.set(doc(db, PUBLIC_COLLECTION_NAME, businessId), publicBusinessFields(business, {
      tier: business.tier,
      abnVerified: business.abnVerified,
      foundingMember: business.foundingMember,
    }));
    batch.set(doc(db, CONTACT_ROUTES_COLLECTION, businessId), {
      businessId,
      ownerUid: business.ownerId,
      active: true,
      updatedAt: serverTimestamp(),
    });
  }
  batch.set(doc(collection(db, AUDIT_COLLECTION)), auditRecord(user, businessId, hidden ? 'business.hidden' : 'business.restored'));
  await batch.commit();
}

function cleanPromotion(payload = {}) {
  return {
    title: clean(payload.title),
    briefText: clean(payload.briefText),
    discountText: clean(payload.discountText),
    fullDetails: clean(payload.fullDetails),
    startDate: clean(payload.startDate),
    endDate: clean(payload.endDate),
    imageUrl: clean(payload.imageUrl),
    imagePath: clean(payload.imagePath),
  };
}

function publicPromotionFields(promotion = {}, boosted = false) {
  return {
    businessId: clean(promotion.businessId),
    title: clean(promotion.title),
    briefText: clean(promotion.briefText),
    discountText: clean(promotion.discountText),
    fullDetails: clean(promotion.fullDetails),
    startDate: clean(promotion.startDate),
    endDate: clean(promotion.endDate),
    imageUrl: clean(promotion.imageUrl),
    status: 'active',
    boosted: Boolean(boosted),
    hidden: false,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export function validateBusinessPromotion(payload = {}) {
  const promotion = cleanPromotion(payload);
  const errors = {};
  if (promotion.title.length < 3) errors.title = 'Enter a promotion title.';
  if (promotion.briefText.length < 10) errors.briefText = 'Add a short promotion summary.';
  if (promotion.fullDetails.length < 20) errors.fullDetails = 'Add complete promotion terms and details.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promotion.startDate)) errors.startDate = 'Enter a valid start date.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(promotion.endDate)) errors.endDate = 'Enter a valid end date.';
  if (!errors.startDate && !errors.endDate && promotion.endDate < promotion.startDate) {
    errors.endDate = 'End date must be on or after the start date.';
  }
  return errors;
}

async function requireOwnedApprovedBusiness(user, businessId) {
  if (!businessId) throw new Error('Choose an approved business for this promotion.');
  const snapshot = await getDoc(doc(db, COLLECTION_NAME, businessId));
  if (!snapshot.exists()) throw new Error('This business listing could not be found.');
  const business = snapshot.data() || {};
  if (business.ownerId !== user.uid) throw new Error('Only the business owner can manage its promotions.');
  if (business.status !== 'approved' || business.hidden === true) {
    throw new Error('The business must be approved and public before adding promotions.');
  }
  return business;
}

export async function createBusinessPromotion(businessId, payload = {}) {
  const user = await requireRegisteredUser();
  await requireOwnedApprovedBusiness(user, businessId);
  const errors = validateBusinessPromotion(payload);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const reference = await addDoc(collection(db, PROMOTIONS_COLLECTION), {
    ...cleanPromotion(payload),
    businessId,
    ownerId: user.uid,
    lastSubmittedBy: user.uid,
    status: 'pending',
    boosted: false,
    hidden: false,
    rejectionReason: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function updateBusinessPromotion(promotionId, payload = {}) {
  const user = await requireRegisteredUser();
  if (!promotionId) throw new Error('Promotion reference is missing.');
  const reference = doc(db, PROMOTIONS_COLLECTION, promotionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('This promotion could not be found.');
  const current = snapshot.data() || {};
  if (current.ownerId !== user.uid) throw new Error('Only the promotion owner can edit it.');
  await requireOwnedApprovedBusiness(user, current.businessId);
  const errors = validateBusinessPromotion(payload);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const batch = writeBatch(db);
  batch.update(reference, {
    ...cleanPromotion(payload),
    status: 'pending',
    hidden: false,
    rejectionReason: '',
    lastSubmittedBy: user.uid,
    updatedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
  });
  batch.delete(doc(db, PUBLIC_PROMOTIONS_COLLECTION, promotionId));
  await batch.commit();
}

export async function deleteBusinessPromotion(promotionId) {
  const user = await requireRegisteredUser();
  if (!promotionId) throw new Error('Promotion reference is missing.');
  const reference = doc(db, PROMOTIONS_COLLECTION, promotionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return;
  const current = snapshot.data() || {};
  if (current.ownerId !== user.uid) throw new Error('Only the promotion owner can delete it.');
  const batch = writeBatch(db);
  batch.delete(reference);
  batch.delete(doc(db, PUBLIC_PROMOTIONS_COLLECTION, promotionId));
  await batch.commit();
}

function promotionIsActive(promotion, today = new Date().toISOString().slice(0, 10)) {
  return promotion.status === 'active'
    && promotion.hidden !== true
    && (!promotion.startDate || promotion.startDate <= today)
    && (!promotion.endDate || promotion.endDate >= today);
}

export function listenActiveBusinessPromotions(onPromotions, onError) {
  return onSnapshot(
    collection(db, PUBLIC_PROMOTIONS_COLLECTION),
    // Use a wrapper so Array.filter does not pass its numeric index into
    // promotionIsActive's optional `today` argument.
    snapshot => onPromotions?.(sortNewest(snapshot.docs.map(mapBusiness).filter(item => promotionIsActive(item)))),
    error => onError?.(error)
  );
}

export function listenOwnerBusinessPromotions(ownerId, onPromotions, onError) {
  if (!ownerId) {
    onPromotions?.([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, PROMOTIONS_COLLECTION), where('ownerId', '==', ownerId)),
    snapshot => onPromotions?.(sortNewest(snapshot.docs.map(mapBusiness))),
    error => onError?.(error)
  );
}

export function listenBusinessPromotionsForAdmin(onPromotions, onError) {
  return onSnapshot(
    collection(db, PROMOTIONS_COLLECTION),
    snapshot => onPromotions?.(sortNewest(snapshot.docs.map(mapBusiness))),
    error => onError?.(error)
  );
}

export async function approveBusinessPromotion(promotionId, options = {}) {
  const user = await requireAdminSession();
  const reference = doc(db, PROMOTIONS_COLLECTION, promotionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('This promotion could not be found.');
  const promotion = snapshot.data() || {};
  const businessSnapshot = await getDoc(doc(db, COLLECTION_NAME, promotion.businessId));
  const business = businessSnapshot.data() || {};
  if (business.status !== 'approved' || business.hidden === true) {
    throw new Error('Approve and publish the linked business before approving its promotion.');
  }
  const batch = writeBatch(db);
  batch.update(reference, {
    status: 'active',
    boosted: Boolean(options.boosted),
    hidden: false,
    rejectionReason: '',
    approvedBy: user.uid,
    approvedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, PUBLIC_PROMOTIONS_COLLECTION, promotionId), publicPromotionFields(promotion, Boolean(options.boosted)));
  batch.set(doc(collection(db, AUDIT_COLLECTION)), auditRecord(user, promotion.businessId, 'promotion.approved', {
    promotionId,
    boosted: Boolean(options.boosted),
  }));
  await batch.commit();
}

export async function rejectBusinessPromotion(promotionId, reason) {
  const user = await requireAdminSession();
  const cleanReason = clean(reason);
  if (cleanReason.length < 10) throw new Error('Add a clear rejection reason of at least 10 characters.');
  const reference = doc(db, PROMOTIONS_COLLECTION, promotionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error('This promotion could not be found.');
  const promotion = snapshot.data() || {};
  const batch = writeBatch(db);
  batch.update(reference, {
    status: 'rejected',
    hidden: true,
    rejectionReason: cleanReason,
    rejectedBy: user.uid,
    rejectedAt: serverTimestamp(),
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.delete(doc(db, PUBLIC_PROMOTIONS_COLLECTION, promotionId));
  batch.set(doc(collection(db, AUDIT_COLLECTION)), auditRecord(user, promotion.businessId, 'promotion.changes_requested', {
    promotionId,
    reason: cleanReason,
  }));
  await batch.commit();
}
