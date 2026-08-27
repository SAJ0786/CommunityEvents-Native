import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { BUSINESS_CATEGORIES } from '../business/businessData';

const CATEGORIES_REF = () => doc(db, 'settings', 'businessCategories');

function normalise(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function slug(value) {
  return normalise(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function duplicateKey(value) {
  return normalise(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function uniqueById(rows = []) {
  return [...new Map(rows.filter(item => item?.id && item?.label).map(item => [item.id, item])).values()];
}

export function mergeBusinessCategories(data = {}) {
  const customCategories = Array.isArray(data.customCategories) ? data.customCategories : [];
  const customSubcategories = Array.isArray(data.customSubcategories) ? data.customSubcategories : [];
  const categories = uniqueById([
    ...BUSINESS_CATEGORIES.map(item => ({ ...item, subcategories: [...item.subcategories] })),
    ...customCategories.map(item => ({
      id: normalise(item.id) || slug(item.label),
      label: normalise(item.label),
      icon: normalise(item.icon) || '\u{1F3F7}\uFE0F',
      subcategories: [],
      custom: true,
    })),
  ]);
  return categories.map(category => ({
    ...category,
    subcategories: uniqueById([
      ...(category.subcategories || []),
      ...customSubcategories
        .filter(item => item.categoryId === category.id)
        .map(item => ({ id: normalise(item.id) || slug(item.label), label: normalise(item.label), custom: true })),
    ]),
  }));
}

export async function getBusinessCategories() {
  const snapshot = await getDoc(CATEGORIES_REF());
  return mergeBusinessCategories(snapshot.exists() ? snapshot.data() : {});
}

export function listenBusinessCategories(onCategories, onError) {
  return onSnapshot(
    CATEGORIES_REF(),
    snapshot => onCategories?.(mergeBusinessCategories(snapshot.exists() ? snapshot.data() : {})),
    onError
  );
}

function requireActor() {
  const actor = auth.currentUser;
  if (!actor || actor.isAnonymous) throw new Error('Sign in as an administrator.');
  return actor;
}

export async function addBusinessCategory(labelValue, iconValue = '') {
  const actor = requireActor();
  const label = normalise(labelValue);
  const icon = normalise(iconValue) || '\u{1F3F7}\uFE0F';
  if (label.length < 2 || label.length > 60) throw new Error('Enter a category name between 2 and 60 characters.');
  const id = slug(label);
  if (!id) throw new Error('Enter a valid category name.');
  await runTransaction(db, async transaction => {
    const reference = CATEGORIES_REF();
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists() ? snapshot.data() : {};
    const categories = mergeBusinessCategories(data);
    if (categories.some(item => item.id === id || duplicateKey(item.label) === duplicateKey(label))) {
      throw new Error(`${label} already exists.`);
    }
    const current = Array.isArray(data.customCategories) ? data.customCategories : [];
    transaction.set(reference, {
      customCategories: [...current, {
        id,
        label,
        icon,
        addedByUid: actor.uid,
        addedAt: new Date().toISOString(),
      }],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
  return getBusinessCategories();
}

export async function addBusinessSubcategory(categoryIdValue, labelValue) {
  const actor = requireActor();
  const categoryId = normalise(categoryIdValue);
  const label = normalise(labelValue);
  if (!categoryId) throw new Error('Choose a parent category.');
  if (label.length < 2 || label.length > 80) throw new Error('Enter a subcategory name between 2 and 80 characters.');
  const id = slug(label);
  if (!id) throw new Error('Enter a valid subcategory name.');
  await runTransaction(db, async transaction => {
    const reference = CATEGORIES_REF();
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists() ? snapshot.data() : {};
    const categories = mergeBusinessCategories(data);
    const category = categories.find(item => item.id === categoryId);
    if (!category) throw new Error('The selected category no longer exists.');
    if (category.subcategories.some(item => item.id === id || duplicateKey(item.label) === duplicateKey(label))) {
      throw new Error(`${label} already exists under ${category.label}.`);
    }
    const current = Array.isArray(data.customSubcategories) ? data.customSubcategories : [];
    transaction.set(reference, {
      customSubcategories: [...current, {
        categoryId,
        id,
        label,
        addedByUid: actor.uid,
        addedAt: new Date().toISOString(),
      }],
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
  return getBusinessCategories();
}
