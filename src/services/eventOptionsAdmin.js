import { doc, getDoc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { EVENT_TYPES, EVENT_TYPE_GROUPS, RECITER_TYPES, getEventTypeCategory } from '../utils/eventOptions';

const OPTIONS_REF = () => doc(db, 'settings', 'eventOptions');
const FIELD_BY_KIND = { eventType: 'eventTypes', reciterType: 'reciterTypes' };
const BUILT_IN_BY_KIND = { eventType: EVENT_TYPES, reciterType: RECITER_TYPES };

function normalise(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function duplicateKey(value) {
  return normalise(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function parseDynamicEventOptions(data = {}) {
  const eventEntries = Array.isArray(data.eventTypes) ? data.eventTypes.filter(Boolean) : [];
  return {
    legacyEventTypes: eventEntries.filter(item => typeof item === 'string' || !EVENT_TYPE_GROUPS.some(group => group.key === item.category))
      .map(item => typeof item === 'string' ? item : item.label).filter(label => label && !EVENT_TYPES.includes(label)),
    eventTypeCategories: Object.fromEntries(eventEntries.map(item => {
      const label = typeof item === 'string' ? item : item.label;
      return [label, getEventTypeCategory(label, { [label]: item.category })];
    }).filter(([label]) => label)),
    eventTypes: Array.isArray(data.eventTypes) ? eventEntries.map(item => typeof item === 'string' ? item : item.label).filter(Boolean) : [],
    reciterTypes: Array.isArray(data.reciterTypes) ? data.reciterTypes.map(item => typeof item === 'string' ? item : item.label).filter(Boolean) : [],
  };
}

export async function getDynamicEventOptions() {
  const snapshot = await getDoc(OPTIONS_REF());
  return parseDynamicEventOptions(snapshot.exists() ? snapshot.data() : {});
}

// Only remove admin-added choices, never events or the built-in catalogue.
export async function deleteDynamicEventType(value) {
  const label = normalise(value);
  const key = duplicateKey(label);
  if (!key) throw new Error('Choose an event type to delete.');
  if (EVENT_TYPES.some(item => duplicateKey(item) === key)) throw new Error('Built-in event types cannot be deleted.');
  const actor = auth.currentUser;
  if (!actor || actor.isAnonymous) throw new Error('Sign in as an administrator.');
  const result = await runTransaction(db, async transaction => {
    const actorSnapshot = await transaction.get(doc(db, 'users', actor.uid));
    const role = actorSnapshot.exists() ? actorSnapshot.data()?.role : '';
    if (role !== 'admin' && role !== 'superAdmin') throw new Error('Administrator access is required.');
    const reference = OPTIONS_REF();
    const snapshot = await transaction.get(reference);
    const data = snapshot.exists() ? snapshot.data() : {};
    const current = Array.isArray(data.eventTypes) ? data.eventTypes : [];
    const next = current.filter(item => duplicateKey(typeof item === 'string' ? item : item?.label) !== key);
    if (next.length === current.length) throw new Error('This event type has already been removed. Refresh the list.');
    transaction.set(reference, {
      eventTypes: next,
      lastEventTypeDeletion: { label, deletedByUid: actor.uid, deletedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { ...data, eventTypes: next };
  });
  return parseDynamicEventOptions(result);
}

export async function addDynamicEventOption(kind, value, category) {
  const field = FIELD_BY_KIND[kind];
  if (!field) throw new Error('Unknown option list.');
  if (kind === 'eventType' && !EVENT_TYPE_GROUPS.some(group => group.key === category)) {
    throw new Error('Choose an event category.');
  }
  const label = normalise(value);
  if (label.length < 2 || label.length > 60) throw new Error('Enter an option between 2 and 60 characters.');
  const actor = auth.currentUser;
  if (!actor || actor.isAnonymous) throw new Error('Sign in as an administrator.');
  await runTransaction(db, async transaction => {
    const reference = OPTIONS_REF();
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() && Array.isArray(snapshot.data()?.[field]) ? snapshot.data()[field] : [];
    const allOptions = [...(BUILT_IN_BY_KIND[kind] || []), ...current];
    const duplicate = allOptions.some(item => duplicateKey(typeof item === 'string' ? item : item.label) === duplicateKey(label));
    if (duplicate) throw new Error(`${label} already exists.`);
    const next = [...current, { label, ...(kind === 'eventType' ? { category } : {}), normalized: label.toLowerCase(), addedByUid: actor.uid, addedAt: new Date().toISOString() }];
    transaction.set(reference, { [field]: next, updatedAt: serverTimestamp() }, { merge: true });
  });
  return getDynamicEventOptions();
}
