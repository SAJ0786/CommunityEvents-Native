import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  signInAnonymously,
} from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: 'AIzaSyCEBUl1pMkQ__slfHjNMSTg6RSycRhPwmk',
  authDomain: 'community-event-8b639.firebaseapp.com',
  projectId: 'community-event-8b639',
  storageBucket: 'community-event-8b639.firebasestorage.app',
  messagingSenderId: '209723097611',
  appId: '1:209723097611:web:b91b3970bc3ec1a4223d0e',
  measurementId: 'G-54XSP1B3WV',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function getNativeAuth() {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if (error?.code === 'auth/already-initialized') return getAuth(app);
    throw error;
  }
}

export const auth = getNativeAuth();
export const db = getFirestore(app);
export const functions = getFunctions(app, 'australia-southeast1');
export const storage = getStorage(app);

let sessionPromise = null;

export async function ensureFirebaseSession() {
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
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
