import Constants from 'expo-constants';
import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

const runtimeConfig = Constants.expoConfig?.extra || {};
const useDebugProvider = __DEV__ || runtimeConfig.appCheckProvider === 'debug';
const configuredDebugToken = useDebugProvider
  ? String(runtimeConfig.appCheckDebugToken || '').trim()
  : '';

const provider = new ReactNativeFirebaseAppCheckProvider();
provider.configure({
  android: {
    provider: useDebugProvider ? 'debug' : 'playIntegrity',
    ...(configuredDebugToken ? { debugToken: configuredDebugToken } : {}),
  },
  apple: {
    provider: useDebugProvider ? 'debug' : 'appAttestWithDeviceCheckFallback',
    ...(configuredDebugToken ? { debugToken: configuredDebugToken } : {}),
  },
});

// This module is imported before Auth, Firestore, Functions or Storage are used.
// React Native Firebase configures the native provider immediately and then
// attaches automatically refreshed App Check tokens to backend requests.
export const appCheck = initializeAppCheck(getApp(), {
  provider,
  isTokenAutoRefreshEnabled: true,
});

export const appCheckProviderName = useDebugProvider
  ? 'debug'
  : 'device-attestation';

export async function requestFirebaseAppCheckToken(forceRefresh = false) {
  return getToken(appCheck, forceRefresh);
}
