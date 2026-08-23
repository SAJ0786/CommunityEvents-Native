import { doc, getDoc, runTransaction, serverTimestamp } from '@react-native-firebase/firestore';
import { auth, db } from '../firebase/firebase';

const OPTIONS_REF = () => doc(db, 'settings', 'eventOptions');
const FIELD_BY_KIND = { eventType: 'eventTypes', reciterType: 'reciterTypes' };

function normalise(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export async function getDynamicEventOptions() {
  const snapshot = await getDoc(OPTIONS_REF());
  const data = snapshot.exists() ? snapshot.data() : {};
  return {
    eventTypes: Array.isArray(data.eventTypes) ? data.eventTypes.map(item => typeof item === 'string' ? item : item.label).filter(Boolean) : [],
    reciterTypes: Array.isArray(data.reciterTypes) ? data.reciterTypes.map(item => typeof item === 'string' ? item : item.label).filter(Boolean) : [],
  };
}

export async function addDynamicEventOption(kind, value) {
  const field = FIELD_BY_KIND[kind];
  if (!field) throw new Error('Unknown option list.');
  const label = normalise(value);
  if (label.length < 2 || label.length > 60) throw new Error('Enter an option between 2 and 60 characters.');
  const actor = auth.currentUser;
  if (!actor || actor.isAnonymous) throw new Error('Sign in as an administrator.');
  await runTransaction(db, async transaction => {
    const reference = OPTIONS_REF();
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() && Array.isArray(snapshot.data()?.[field]) ? snapshot.data()[field] : [];
    const duplicate = current.some(item => normalise(typeof item === 'string' ? item : item.label).toLowerCase() === label.toLowerCase());
    if (duplicate) throw new Error(`${label} already exists.`);
    const next = [...current, { label, normalized: label.toLowerCase(), addedByUid: actor.uid, addedAt: new Date().toISOString() }];
    transaction.set(reference, { [field]: next, updatedAt: serverTimestamp() }, { merge: true });
  });
  return getDynamicEventOptions();
}
