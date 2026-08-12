import { getApp } from '@react-native-firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithPhoneNumber,
  updateProfile,
} from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getFunctions } from '@react-native-firebase/functions';
import { getStorage } from '@react-native-firebase/storage';

export const app = getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'australia-southeast1');
export const storage = getStorage(app);

let sessionPromise = null;

export async function ensureFirebaseSession() {
  if (auth.currentUser) return auth.currentUser;
  if (!sessionPromise) {
    sessionPromise = signInAnonymously(auth)
      .then(credential => credential.user)
      .finally(() => {
        sessionPromise = null;
      });
  }
  return sessionPromise;
}

export function formatAustralianMobile(raw) {
  let value = String(raw || '').replace(/[\s\-().]/g, '');
  if (value.startsWith('0')) value = `+61${value.slice(1)}`;
  if (value.startsWith('61') && !value.startsWith('+')) value = `+${value}`;
  return value;
}

export function isValidAustralianMobile(raw) {
  return /^\+614\d{8}$/.test(formatAustralianMobile(raw));
}

export async function sendPhoneVerification(phoneNumber) {
  const formatted = formatAustralianMobile(phoneNumber);
  if (!isValidAustralianMobile(formatted)) {
    throw new Error('Please enter a valid Australian mobile (04XX XXX XXX).');
  }
  return signInWithPhoneNumber(auth, formatted);
}

export async function confirmPhoneVerification(confirmation, code) {
  if (!confirmation) throw new Error('Verification session expired. Please request a new code.');
  const result = await confirmation.confirm(String(code || '').trim());
  return result.user;
}

export async function setNativeDisplayName(user, displayName) {
  if (!user) return;
  await updateProfile(user, { displayName: String(displayName || '').trim() });
}
