import { collection, onSnapshot } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { db, ensureFirebaseSession, functions } from '../firebase/firebase';

const STATISTICS_COLLECTION = 'businessStatistics';

export const BUSINESS_ACTION_LABELS = {
  page_view: 'Business page accesses',
  contact: 'Contact button',
  message_enquiry: 'In-app enquiries',
  call: 'Call button',
  whatsapp: 'WhatsApp button',
  directions: 'Directions / address',
  share: 'Share button',
  website: 'Website',
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  promotions: 'Promotions',
  services: 'Services & products',
  hours: 'Opening hours',
  favourite: 'Favourite button',
};

export async function trackBusinessInteraction(businessId, action, options = {}) {
  if (!businessId || !BUSINESS_ACTION_LABELS[action]) return false;
  try {
    await ensureFirebaseSession();
    const callable = httpsCallable(functions, 'recordBusinessInteraction');
    await callable({ businessId, action, threadId: options.threadId || '' });
    return true;
  } catch {
    // Analytics must never prevent the user-requested action from completing.
    return false;
  }
}

export function listenBusinessStatistics(onStatistics, onError) {
  return onSnapshot(
    collection(db, STATISTICS_COLLECTION),
    snapshot => onStatistics?.(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
    error => onError?.(error)
  );
}
