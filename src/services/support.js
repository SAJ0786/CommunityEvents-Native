import { httpsCallable } from '@react-native-firebase/functions';
import { ensureFirebaseSession, functions } from '../firebase/firebase';

export const APP_SUPPORT_CATEGORIES = ['App feedback / suggestion', 'Technical problem', 'Account / login issue', 'Privacy enquiry', 'Other'];
export const BUSINESS_REPORT_CATEGORIES = ['Incorrect information', 'Misleading or unsafe conduct', 'Suspected fraud or impersonation', 'Inappropriate content', 'Business closed', 'Other'];
export const newSupportReference = () => `support_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

export async function submitSupportRequest(data) {
  await ensureFirebaseSession();
  const result = await httpsCallable(functions, 'submitSupportRequest')(data);
  return result.data;
}
