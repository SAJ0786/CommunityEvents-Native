import Constants from 'expo-constants';
import crashlytics from '@react-native-firebase/crashlytics';
import { sanitizeDiagnosticError, sanitizeDiagnosticMetadata } from './sanitizeError';

const startedAt = new Date();
const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
const sessionId = `CCA-${startedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${randomPart}`;
let currentContext = {};

function nativeReporter() {
  try {
    return crashlytics();
  } catch {
    return null;
  }
}

function stringAttributes(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 40)
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 250) : JSON.stringify(value).slice(0, 250)]));
}

export async function initializeDiagnostics() {
  const reporter = nativeReporter();
  if (!reporter) return;
  const version = Constants.expoConfig?.version || 'unknown';
  const buildNumber = String(Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber || 'unknown');
  currentContext = {
    app_version: version,
    build_number: buildNumber,
    environment: __DEV__ ? 'development' : 'production',
    session_id: sessionId,
  };
  await reporter.setCrashlyticsCollectionEnabled(!__DEV__);
  await reporter.setAttributes(stringAttributes(currentContext));
  reporter.log('APP_BOOT_STARTED');
}

export function logDiagnostic(message, metadata = {}) {
  const safe = sanitizeDiagnosticMetadata(metadata);
  const reporter = nativeReporter();
  reporter?.log(`${String(message).slice(0, 180)} ${Object.keys(safe).length ? JSON.stringify(safe).slice(0, 700) : ''}`.trim());
}

export function setDiagnosticContext(context = {}) {
  const safe = sanitizeDiagnosticMetadata(context);
  currentContext = { ...currentContext, ...safe };
  nativeReporter()?.setAttributes(stringAttributes(safe));
}

export function setDiagnosticUser(userId) {
  nativeReporter()?.setUserId(String(userId || sessionId));
}

export function clearDiagnosticUser() {
  nativeReporter()?.setUserId(sessionId);
}

export function recordNonFatalError(error, context = {}) {
  const safeError = sanitizeDiagnosticError(error);
  const safeContext = sanitizeDiagnosticMetadata(context);
  const report = error instanceof Error
    ? new Error(safeError.message || 'Application error')
    : new Error(safeError?.message || String(error || 'Application error'));
  report.name = safeError.name || 'ApplicationError';
  nativeReporter()?.setAttributes(stringAttributes({ ...currentContext, ...safeContext }));
  nativeReporter()?.recordError(report);
}

export function getDiagnosticSessionId() {
  return sessionId;
}
