import { deleteObject, getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import { storage } from '../firebase/firebase';

export async function uploadEventPoster(localUri, userId, eventId, contentType = 'image/jpeg') {
  if (!localUri || !userId) throw new Error('A selected image and signed-in user are required.');
  const safeType = String(contentType || 'image/jpeg').startsWith('image/')
    ? String(contentType || 'image/jpeg')
    : 'image/jpeg';
  const extension = safeType.includes('png') ? 'png' : safeType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `${eventId || Date.now()}-${Date.now()}.${extension}`;
  const imagePath = `event-images/${userId}/${fileName}`;
  const imageRef = ref(storage, imagePath);
  await putFile(imageRef, localUri, { contentType: safeType });
  const imageUrl = await getDownloadURL(imageRef);
  return { imagePath, imageUrl };
}

export async function uploadBusinessImage(localUri, userId, businessId, kind = 'cover', contentType = 'image/jpeg') {
  if (!localUri || !userId) throw new Error('A selected image and signed-in user are required.');
  const safeKind = ['logo', 'cover', 'promotion'].includes(kind) ? kind : 'cover';
  const safeType = String(contentType || 'image/jpeg').startsWith('image/')
    ? String(contentType || 'image/jpeg')
    : 'image/jpeg';
  const extension = safeType.includes('png') ? 'png' : safeType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `${safeKind}-${businessId || Date.now()}-${Date.now()}.${extension}`;
  const imagePath = `business-images/${userId}/${fileName}`;
  const imageRef = ref(storage, imagePath);
  await putFile(imageRef, localUri, { contentType: safeType });
  const imageUrl = await getDownloadURL(imageRef);
  return { imagePath, imageUrl };
}

export async function deleteBusinessImage(imagePath) {
  const safePath = String(imagePath || '').trim();
  if (!safePath || !safePath.startsWith('business-images/')) return;
  await deleteObject(ref(storage, safePath));
}

const posterUrlCache = new Map();

function cacheKey(event = {}) {
  if (!event || typeof event !== 'object') return '';
  return String(event.id || event.imagePath || event.imageUrl || event.posterUrl || '');
}

export function getImmediatePosterSource(event = {}) {
  if (!event || typeof event !== 'object') return '';
  return event.imageUrl
    || event.posterUrl
    || event.poster
    || event.image
    || event.flyerUrl
    || event.flyer
    || event.organisationLogo
    || event.orgLogo
    || event.logoBase64
    || '';
}

export async function resolvePosterSource(event = {}) {
  if (!event || typeof event !== 'object') return '';
  const immediate = getImmediatePosterSource(event);
  if (immediate) return immediate;

  const path = String(event.imagePath || event.posterPath || '').trim();
  if (!path) return '';

  const key = cacheKey(event);
  if (key && posterUrlCache.has(key)) return posterUrlCache.get(key);

  const url = await getDownloadURL(ref(storage, path));
  if (key) posterUrlCache.set(key, url);
  return url;
}
