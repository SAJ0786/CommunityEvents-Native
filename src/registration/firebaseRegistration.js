import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';
import { createRegistrationClient } from './registrationClient';
import Constants from 'expo-constants';

export const REGISTRATION_ENABLED = Constants.expoConfig?.extra?.eventRegistrationEnabled === true;

// Disabled until backend/security/device acceptance is complete. No default production calls.
export function firebaseRegistration({ enabled = false, functionsInstance = functions } = {}) {
  return createRegistrationClient((name, data) => httpsCallable(functionsInstance, name)(data), { enabled });
}
