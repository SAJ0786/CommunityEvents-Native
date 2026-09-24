import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import crashlytics from '@react-native-firebase/crashlytics';
import { appVersion, appBuild } from '../appVersion';
import { appCheckProviderName, requestFirebaseAppCheckToken } from '../../firebase/appCheck';
import { getAuthFailureDetails } from './authFailureDetails';

const STORAGE_KEY = '@cca/diagnostics/auth-failures-v1';
const LIMIT = 20;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const OPERATIONS = ['send_phone_code', 'verify_phone_code', 'guest_sign_in', 'app_check'];
let records = [];
let queue = Promise.resolve();
let loaded = false;
let appCheckProbePending = false;
let lastAppCheckProbeAt = 0;

function storedFailure(item) {
  if (!OPERATIONS.includes(item?.operation) || !Number.isFinite(Date.parse(item?.at))) return null;
  const reasons = Array.isArray(item.reasons) ? item.reasons.filter(value => typeof value === 'string') : [];
  const services = Array.isArray(item.services) ? item.services.filter(value => typeof value === 'string') : [];
  return {
    at: new Date(item.at).toISOString(),
    operation: item.operation,
    ...getAuthFailureDetails({ message: `${typeof item.code === 'string' ? item.code : ''} ${reasons.join(' ')} ${services.join(' ')} HTTP status code: ${item.httpStatus || ''}` }),
  };
}

function runtimeDetails() {
  let options = {};
  try { options = getApp().options || {}; } catch { /* Firebase may not be ready. */ }
  return {
    platform: Platform.OS,
    appVersion,
    buildNumber: appBuild || 'unknown',
    bundleId: Application.applicationId || 'unknown',
    firebaseProject: options.projectId || 'unknown',
    firebaseAppId: options.appId || 'unknown',
    appCheckProvider: appCheckProviderName,
  };
}

async function loadRecords() {
  if (loaded) return;
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || '[]');
    records = Array.isArray(parsed) ? parsed.map(storedFailure).filter(item =>
      item && Date.parse(item.at) > Date.now() - RETENTION_MS).slice(-LIMIT) : [];
  } catch { records = []; }
  loaded = true;
}

async function reportNonFatal(record) {
  // This reporter does not depend on a successful anonymous Firebase sign-in.
  // A failed upload must never replace the original authentication error.
  if (__DEV__) return;
  try {
    const reporter = crashlytics();
    await reporter.setCrashlyticsCollectionEnabled(true);
    await reporter.setAttributes({
      feature: 'authentication',
      operation: record.operation,
      auth_error_code: record.code,
      auth_error_reasons: record.reasons.join(','),
      ...Object.fromEntries(Object.entries(record.runtime).map(([key, value]) => [key, String(value)])),
    });
    reporter.recordError(new Error(`Authentication ${record.operation}: ${record.code}; ${record.reasons.join(',')}`));
  } catch { /* Local support report remains available without cloud access. */ }
}

function appendFailure(error, operation) {
  const record = {
    at: new Date().toISOString(),
    operation: OPERATIONS.includes(operation) ? operation : 'guest_sign_in',
    ...getAuthFailureDetails(error),
    runtime: runtimeDetails(),
  };
  queue = queue.then(async () => {
    await loadRecords();
    records = [...records.filter(item => Date.parse(item.at) > Date.now() - RETENTION_MS), record].slice(-LIMIT);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch { /* Retain in memory. */ }
  }).catch(() => {});
  void reportNonFatal(record);
}

export function recordAuthenticationFailure(error, operation) {
  try {
    appendFailure(error, operation);
    // Firebase Auth may replace an App Check error with auth/internal-error.
    // Probe once per minute after failure, without delaying login or logging
    // successful token values. Keep the underlying reason in the local report.
    const canBeAppCheckFailure = ['auth/internal-error', 'auth/app-not-authorized', 'auth/invalid-app-credential', 'unknown']
      .includes(getAuthFailureDetails(error).code);
    if (canBeAppCheckFailure && !appCheckProbePending && Date.now() - lastAppCheckProbeAt > 60000) {
      appCheckProbePending = true;
      lastAppCheckProbeAt = Date.now();
      Promise.resolve().then(() => requestFirebaseAppCheckToken(false))
        .catch(appCheckError => appendFailure(appCheckError, 'app_check'))
        .finally(() => { appCheckProbePending = false; });
    }
  } catch { /* Diagnostic failures must not interrupt authentication. */ }
}

export async function getAuthenticationDiagnosticReport() {
  await queue;
  await loadRecords();
  return JSON.stringify({
    report: 'Community Connect Australia sign-in diagnostics',
    generatedAt: new Date().toISOString(),
    runtime: runtimeDetails(),
    // Reconstruct stored entries rather than exporting arbitrary storage data.
    recentFailures: records.filter(item => Date.parse(item.at) > Date.now() - RETENTION_MS).map(storedFailure),
  }, null, 2);
}
