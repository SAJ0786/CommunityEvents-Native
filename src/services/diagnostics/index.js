import { appVersion, appBuild } from '../appVersion';
import crashlytics from '@react-native-firebase/crashlytics';
import { sanitizeDiagnosticError, sanitizeDiagnosticMetadata } from './sanitizeError';
import {
  appendDiagnosticRegistryEvent,
  diagnosticSessionId,
  getDiagnosticIdentity as getRegistryDiagnosticIdentity,
  getDiagnosticInstallationId as getRegistryDiagnosticInstallationId,
  initializeDiagnosticRegistry,
  listenDiagnosticSessions,
  recordDiagnosticRegistryError,
  updateDiagnosticAdminReview,
  updateDiagnosticRegistryContext,
  updateDiagnosticRegistryUser,
} from './registry';

const sessionId = diagnosticSessionId;
let currentContext = {};
let diagnosticsInitializePromise = null;

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
  if (diagnosticsInitializePromise) return diagnosticsInitializePromise;
  diagnosticsInitializePromise = (async () => {
    const reporter = nativeReporter();
    let previousCrashDetected = false;
    if (reporter) {
      await reporter.setCrashlyticsCollectionEnabled(!__DEV__);
      previousCrashDetected = await reporter.didCrashOnPreviousExecution().catch(() => false);
    }
    const identity = await initializeDiagnosticRegistry(previousCrashDetected);
    const version = appVersion;
    const buildNumber = appBuild || 'unknown';
    currentContext = {
      app_version: version,
      build_number: buildNumber,
      environment: __DEV__ ? 'development' : 'production',
      session_id: sessionId,
      installation_id: identity.installationId,
    };
    updateDiagnosticRegistryContext(currentContext);
    if (reporter) {
      await reporter.setAttributes(stringAttributes(currentContext));
      reporter.log('APP_BOOT_STARTED');
    }
    return identity;
  })();
  return diagnosticsInitializePromise;
}

export function logDiagnostic(message, metadata = {}) {
  const safe = sanitizeDiagnosticMetadata(metadata);
  const reporter = nativeReporter();
  reporter?.log(`${String(message).slice(0, 180)} ${Object.keys(safe).length ? JSON.stringify(safe).slice(0, 700) : ''}`.trim());
  appendDiagnosticRegistryEvent(message, metadata);
}

export function setDiagnosticContext(context = {}) {
  const safe = sanitizeDiagnosticMetadata(context);
  currentContext = { ...currentContext, ...safe };
  nativeReporter()?.setAttributes(stringAttributes(safe));
  updateDiagnosticRegistryContext(safe);
}

export function setDiagnosticUser(userId) {
  nativeReporter()?.setUserId(String(userId || sessionId));
  updateDiagnosticRegistryContext({ authentication_state: 'authenticated' });
  updateDiagnosticRegistryUser();
}

export function clearDiagnosticUser() {
  nativeReporter()?.setUserId(sessionId);
  updateDiagnosticRegistryContext({ authentication_state: 'guest' });
  updateDiagnosticRegistryUser();
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
  recordDiagnosticRegistryError(safeError, safeContext);
}

export function getDiagnosticSessionId() {
  return sessionId;
}

export function getDiagnosticInstallationId() {
  return getRegistryDiagnosticInstallationId();
}

export async function getDiagnosticIdentity() {
  await initializeDiagnostics();
  return getRegistryDiagnosticIdentity();
}

export {
  listenDiagnosticSessions,
  updateDiagnosticAdminReview,
};
