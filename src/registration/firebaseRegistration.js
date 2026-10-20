import { httpsCallable } from '@react-native-firebase/functions';
import { auth, functions } from '../firebase/firebase';
import { requestFirebaseAppCheckToken } from '../firebase/appCheck';
import { recordNonFatalError } from '../services/diagnostics';
import { isCallableTokenTaskError } from '../utils/errors';
import { createRegistrationClient } from './registrationClient';
import Constants from 'expo-constants';

export const REGISTRATION_ENABLED = Constants.expoConfig?.extra?.eventRegistrationEnabled === true;
let tokenRefreshPromise = null;
let lastTokenFailureReportAt = 0;

function refreshCallableTokens() {
  if (tokenRefreshPromise) return tokenRefreshPromise;
  tokenRefreshPromise = (async () => {
    const checks = [
      auth.currentUser?.getIdToken ? auth.currentUser.getIdToken(true) : Promise.resolve(null),
      requestFirebaseAppCheckToken(true),
    ];
    const [authResult, appCheckResult] = await Promise.allSettled(checks);
    if (authResult.status === 'rejected') {
      recordNonFatalError(authResult.reason, { feature: 'registration', operation: 'refresh_auth_token' });
    }
    if (appCheckResult.status === 'rejected') {
      recordNonFatalError(appCheckResult.reason, { feature: 'registration', operation: 'refresh_app_check_token' });
    }
    return authResult.status === 'fulfilled' && appCheckResult.status === 'fulfilled';
  })().finally(() => { tokenRefreshPromise = null; });
  return tokenRefreshPromise;
}

async function invokeWithTokenRecovery(functionsInstance, name, data) {
  const invoke = () => httpsCallable(functionsInstance, name)(data);
  try {
    return await invoke();
  } catch (error) {
    if (!isCallableTokenTaskError(error)) throw error;
    if (Date.now() - lastTokenFailureReportAt > 60000) {
      lastTokenFailureReportAt = Date.now();
      recordNonFatalError(error, { feature: 'registration', operation: 'callable_token_tasks', callable: name });
    }
    if (!await refreshCallableTokens()) throw error;
    return invoke();
  }
}

// Disabled until backend/security/device acceptance is complete. No default production calls.
export function firebaseRegistration({ enabled = false, functionsInstance = functions } = {}) {
  return createRegistrationClient((name, data) => invokeWithTokenRecovery(functionsInstance, name, data), { enabled });
}
