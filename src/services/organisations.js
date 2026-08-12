import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';

const COLLECTION_NAME = 'organisations';
let organisationsCache = null;
let organisationsCacheLoadedAt = 0;
let organisationsCachePromise = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const ORGANISATION_TYPES = [
  { value: 'centre', label: 'Centre' },
  { value: 'org', label: 'Org' },
];

export function normalizeOrganisationType(value) {
  return String(value || '').trim().toLowerCase() === 'org' ? 'org' : 'centre';
}

export function organisationTypeLabel(value) {
  return normalizeOrganisationType(value) === 'org' ? 'Org' : 'Centre';
}

export function invalidateOrganisationCache() {
  organisationsCache = null;
  organisationsCacheLoadedAt = 0;
  organisationsCachePromise = null;
}

function mapOrganisationDocument(item) {
  const data = item.data() || {};
  return {
    id: item.id,
    ...data,
    type: normalizeOrganisationType(data.type),
  };
}

export async function getOrganisations(options = {}) {
  const force = Boolean(options?.force);
  const now = Date.now();
  if (!force && organisationsCache && (now - organisationsCacheLoadedAt) < CACHE_TTL_MS) {
    return organisationsCache;
  }
  if (!force && organisationsCachePromise) return organisationsCachePromise;

  try {
    const loadPromise = getDocs(collection(db, COLLECTION_NAME))
      .then(snapshot => {
        organisationsCache = snapshot.docs.map(mapOrganisationDocument);
        organisationsCacheLoadedAt = Date.now();
        return organisationsCache;
      })
      .finally(() => {
        organisationsCachePromise = null;
      });
    organisationsCachePromise = loadPromise;
    return await loadPromise;
  } catch {
    return organisationsCache || [];
  }
}

export async function addOrganisation({ name, slug, location, type = 'centre', logoBase64 = '', builtIn = false }) {
  if (!name || !slug) throw new Error('Organisation name and ID are required.');
  const cleanSlug = String(slug).trim().toLowerCase();
  const existing = await getDocs(query(collection(db, COLLECTION_NAME), where('slug', '==', cleanSlug)));
  if (!existing.empty) throw new Error(`Organisation ID "${cleanSlug}" is already used.`);
  const ref = await addDoc(collection(db, COLLECTION_NAME), {
    name: String(name).trim(),
    slug: cleanSlug,
    location: String(location || '').trim(),
    type: normalizeOrganisationType(type),
    logoBase64: logoBase64 || '',
    builtIn: Boolean(builtIn),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  invalidateOrganisationCache();
  return ref;
}

export async function updateOrganisation(id, fields = {}) {
  if (!id) throw new Error('Organisation ID is required.');
  const nextFields = { ...fields };
  if (nextFields.slug) {
    const cleanSlug = String(nextFields.slug).trim().toLowerCase();
    const existing = await getDocs(query(collection(db, COLLECTION_NAME), where('slug', '==', cleanSlug)));
    const duplicate = existing.docs.find(item => item.id !== id);
    if (duplicate) throw new Error(`Organisation ID "${cleanSlug}" is already used.`);
    nextFields.slug = cleanSlug;
  }
  if (nextFields.type) nextFields.type = normalizeOrganisationType(nextFields.type);
  await updateDoc(doc(db, COLLECTION_NAME, id), {
    ...nextFields,
    updatedAt: serverTimestamp(),
  });
  invalidateOrganisationCache();
}

export async function deleteOrganisation(id) {
  if (!id) throw new Error('Organisation ID is required.');
  await deleteDoc(doc(db, COLLECTION_NAME, id));
  invalidateOrganisationCache();
}

function normalizeOrgText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function resolveOrganisationLogo(event = {}, organisations = []) {
  const list = Array.isArray(organisations) ? organisations : [];
  if (!list.length) return '';

  const withLogos = list.filter(item => String(item.logoBase64 || '').trim());
  const orgId = String(event.organiserId || '').trim();
  const organiserType = String(event.organiserType || event.organisationType || '').trim().toLowerCase();
  const hostName = normalizeOrgText(event.hostName || event.organiserName || event.organizationName || '');

  const communityOrg = withLogos.find(org =>
    String(org.slug || '').trim().toLowerCase() === 'community'
    || normalizeOrgText(org.name) === 'community events australia'
  );

  if (organiserType === 'private' && communityOrg?.logoBase64) return communityOrg.logoBase64;

  const exactId = orgId ? withLogos.find(org => org.id === orgId) : null;
  if (exactId?.logoBase64) return exactId.logoBase64;

  const exactSlug = organiserType
    ? withLogos.find(org => String(org.slug || '').trim().toLowerCase() === organiserType)
    : null;
  if (exactSlug?.logoBase64) return exactSlug.logoBase64;

  const exactName = hostName
    ? withLogos.find(org => normalizeOrgText(org.name) === hostName)
    : null;
  if (exactName?.logoBase64) return exactName.logoBase64;

  const fuzzyMatches = withLogos
    .map(org => {
      const orgName = normalizeOrgText(org.name);
      if (!hostName || orgName.length < 6) return null;
      if (hostName.includes(orgName)) return { org, score: orgName.length + 100 };
      if (hostName.length >= 8 && orgName.includes(hostName)) return { org, score: hostName.length };
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  if (fuzzyMatches.length) return fuzzyMatches[0].org.logoBase64 || '';

  return communityOrg?.logoBase64 || '';
}
