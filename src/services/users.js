import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export async function getUserProfile(uid) {
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
