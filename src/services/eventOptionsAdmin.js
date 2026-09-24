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

export async function getDynamicEventOptions() {
  const snapshot = await getDoc(OPTIONS_REF());
  const data = snapshot.exists() ? snapshot.data() : {};
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
