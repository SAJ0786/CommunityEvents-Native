import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// EAS/Codemagic can change native build numbers without changing app.json.
export const appVersion = Application.nativeApplicationVersion || Constants.expoConfig?.version || 'unknown';
export const appBuild = Platform.OS === 'web' ? '' : String(Application.nativeBuildVersion || 'unknown');
