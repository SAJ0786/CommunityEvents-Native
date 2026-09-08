import AsyncStorage from '@react-native-async-storage/async-storage';
import { appVersion, appBuild } from '../appVersion';
import { AppState, Platform } from 'react-native';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';
import { auth, db, ensureFirebaseSession } from '../../firebase/firebase';
import { sanitizeDiagnosticMetadata } from './sanitizeError';

const DIAGNOSTIC_COLLECTION = 'diagnosticSessions';
const INSTALLATION_ID_KEY = '@cca/diagnostics/installation-id-v1';
const LAST_SESSION_KEY = '@cca/diagnostics/last-session-v1';
const RECENT_EVENTS_KEY = '@cca/diagnostics/recent-events-v1';
const EVENT_LIMIT = 40;
const FLUSH_DELAY_MS = 1800;
const startedAt = new Date();

function randomCode(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length).toUpperCase().padEnd(length, '0');
}

export const diagnosticSessionId = `CCA-${startedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${randomCode(6)}`;
let installationId = '';
let currentContext = {};
let recentEvents = [];
let errorCount = 0;
let severity = 'info';
let diagnosticStatus = 'active';
let initializePromise = null;
let flushTimer = null;
let flushPromise = Promise.resolve();
let appStateSubscription = null;
const createdSegmentIds = new Set();

function safeDeviceModel() {
  const constants = Platform.constants || {};
  return String(constants.Model || constants.model || constants.systemName || constants.interfaceIdiom || 'Unknown device').slice(0, 80);
}

function installationCode() {
  return `CCI-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
}

function diagnosticDocumentId(uid) {
  const safeUid = String(uid || 'guest').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'guest';
  return `${diagnosticSessionId}-${safeUid}`;
}

function registryMetadata(metadata = {}) {
  const safe = sanitizeDiagnosticMetadata(metadata);
  const allowed = new Set([
    'platform', 'orientation', 'module', 'screen', 'feature', 'operation', 'code',
    'hadConnection', 'connected', 'started', 'resume', 'protocol', 'authentication_state', 'reason',
    'current_screen', 'state', 'entered', 'permission',
  ]);
  return Object.fromEntries(Object.entries(safe)
    .filter(([key, value]) => allowed.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 16)
    .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 180) : value]));
}

function persistRecentEvents() {
  AsyncStorage.setItem(RECENT_EVENTS_KEY, JSON.stringify({
    sessionId: diagnosticSessionId,
    events: recentEvents.slice(-EVENT_LIMIT),
  })).catch(() => {});
}

export function appendDiagnosticRegistryEvent(message, metadata = {}) {
  const { code: nativeCode, ...details } = registryMetadata(metadata);
  const event = {
    at: new Date().toISOString(),
    code: String(message || 'DIAGNOSTIC_EVENT').replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 90),
    ...details,
    ...(nativeCode !== undefined ? { nativeCode } : {}),
  };
  recentEvents = [...recentEvents, event].slice(-EVENT_LIMIT);
  persistRecentEvents();
  scheduleRegistryFlush();
}

function sessionSnapshot(firebaseUser, previous = null, previousCrashDetected = false) {
  const version = appVersion;
  const buildNumber = appBuild || 'unknown';
  return {
    sessionId: diagnosticSessionId,
    installationId,
    reporterUid: firebaseUser.uid,
    userUid: firebaseUser.isAnonymous ? null : firebaseUser.uid,
    isAnonymous: firebaseUser.isAnonymous === true,
    platform: Platform.OS,
    osVersion: String(Platform.Version || 'unknown').slice(0, 40),
    deviceModel: safeDeviceModel(),
    appVersion: String(version).slice(0, 30),
    buildNumber: buildNumber.slice(0, 30),
    environment: __DEV__ ? 'development' : 'production',
    startedAt: serverTimestamp(),
    startedAtClient: startedAt.toISOString(),
    lastSeenAt: serverTimestamp(),
    lastSeenAtClient: new Date().toISOString(),
    previousSessionId: previous?.sessionId || null,
    previousCrashDetected,
    crashDetected: false,
    diagnosticStatus,
    severity,
    errorCount,
    currentScreen: String(currentContext.current_screen || '').slice(0, 120),
    feature: String(currentContext.feature || '').slice(0, 80),
    authenticationState: String(currentContext.authentication_state || (firebaseUser.isAnonymous ? 'guest' : 'authenticated')).slice(0, 30),
    appState: AppState.currentState || 'unknown',
    recentEvents: recentEvents.slice(-EVENT_LIMIT),
    adminStatus: 'new',
    adminNote: '',
    archived: false,
  };
}

async function ensureRegistrySegment(firebaseUser, previous = null, previousCrashDetected = false) {
  const documentId = diagnosticDocumentId(firebaseUser.uid);
  const reference = doc(db, DIAGNOSTIC_COLLECTION, documentId);
  if (!createdSegmentIds.has(documentId)) {
    await setDoc(reference, sessionSnapshot(firebaseUser, previous, previousCrashDetected));
    createdSegmentIds.add(documentId);
  }
  await AsyncStorage.setItem(LAST_SESSION_KEY, JSON.stringify({
    sessionId: diagnosticSessionId,
    installationId,
    documentId,
    reporterUid: firebaseUser.uid,
  }));
  return { reference };
}

async function writeRegistrySnapshot() {
  if (!installationId) return;
  const firebaseUser = auth.currentUser || await ensureFirebaseSession();
  const { reference } = await ensureRegistrySegment(firebaseUser);
  await updateDoc(reference, {
    userUid: firebaseUser.isAnonymous ? null : firebaseUser.uid,
    isAnonymous: firebaseUser.isAnonymous === true,
    lastSeenAt: serverTimestamp(),
    lastSeenAtClient: new Date().toISOString(),
    diagnosticStatus,
    severity,
    errorCount,
    currentScreen: String(currentContext.current_screen || '').slice(0, 120),
    feature: String(currentContext.feature || '').slice(0, 80),
    authenticationState: String(currentContext.authentication_state || (firebaseUser.isAnonymous ? 'guest' : 'authenticated')).slice(0, 30),
    appState: AppState.currentState || 'unknown',
    recentEvents: recentEvents.slice(-EVENT_LIMIT),
  });
}

function scheduleRegistryFlush(delay = FLUSH_DELAY_MS) {
  if (!initializePromise || !installationId) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPromise = flushPromise.then(writeRegistrySnapshot).catch(() => {});
  }, delay);
}

async function markPreviousCrash(previous, previousEvents) {
  if (!previous?.documentId || !previous?.reporterUid || auth.currentUser?.uid !== previous.reporterUid) return;
  try {
    await updateDoc(doc(db, DIAGNOSTIC_COLLECTION, previous.documentId), {
      crashDetected: true,
      crashDetectedAt: serverTimestamp(),
      crashDetectedAtClient: new Date().toISOString(),
      diagnosticStatus: 'crashed',
      severity: 'fatal',
      recentEvents: Array.isArray(previousEvents) ? previousEvents.slice(-EVENT_LIMIT) : [],
      lastSeenAt: serverTimestamp(),
      lastSeenAtClient: new Date().toISOString(),
    });
  } catch {
    // A pre-login anonymous session can have a different Firebase UID. The new
    // session still records previousCrashDetected so the incident remains visible.
  }
}

export async function initializeDiagnosticRegistry(previousCrashDetected = false) {
  if (initializePromise) return initializePromise;
  initializePromise = (async () => {
    const [storedInstallationId, previousRaw, previousEventsRaw] = await Promise.all([
      AsyncStorage.getItem(INSTALLATION_ID_KEY),
      AsyncStorage.getItem(LAST_SESSION_KEY),
      AsyncStorage.getItem(RECENT_EVENTS_KEY),
    ]);
    installationId = storedInstallationId || installationCode();
    if (!storedInstallationId) await AsyncStorage.setItem(INSTALLATION_ID_KEY, installationId);

    let previous = null;
    let previousEvents = [];
    try { previous = previousRaw ? JSON.parse(previousRaw) : null; } catch { previous = null; }
    try {
      const parsed = previousEventsRaw ? JSON.parse(previousEventsRaw) : null;
      if (parsed?.sessionId === previous?.sessionId && Array.isArray(parsed.events)) previousEvents = parsed.events;
    } catch { previousEvents = []; }

    const firebaseUser = auth.currentUser || await ensureFirebaseSession();
    recentEvents = [{ at: startedAt.toISOString(), code: 'APP_BOOT_STARTED', previousCrashDetected }];
    await ensureRegistrySegment(firebaseUser, previous, previousCrashDetected);
    if (previousCrashDetected) await markPreviousCrash(previous, previousEvents);
    persistRecentEvents();

    if (!appStateSubscription) {
      appStateSubscription = AppState.addEventListener('change', state => {
        appendDiagnosticRegistryEvent('APP_STATE_CHANGED', { state });
        scheduleRegistryFlush(state === 'active' ? FLUSH_DELAY_MS : 0);
      });
    }
    scheduleRegistryFlush(0);
    return { sessionId: diagnosticSessionId, installationId };
  })();
  return initializePromise;
}

export function updateDiagnosticRegistryContext(context = {}) {
  currentContext = { ...currentContext, ...sanitizeDiagnosticMetadata(context) };
  scheduleRegistryFlush();
}

export function updateDiagnosticRegistryUser() {
  scheduleRegistryFlush(0);
}

export function recordDiagnosticRegistryError(error, context = {}) {
  errorCount += 1;
  severity = 'error';
  diagnosticStatus = 'issue-recorded';
  appendDiagnosticRegistryEvent('NON_FATAL_ERROR', {
    ...registryMetadata(context),
    code: error?.code || error?.name || 'ApplicationError',
  });
  scheduleRegistryFlush(0);
}

export function getDiagnosticInstallationId() {
  return installationId || 'Initialising…';
}

export async function getDiagnosticIdentity() {
  await initializeDiagnosticRegistry(false);
  return { sessionId: diagnosticSessionId, installationId };
}

export async function flushDiagnosticRegistry() {
  if (!initializePromise) return;
  await initializePromise;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushPromise = flushPromise.then(writeRegistrySnapshot).catch(() => {});
  await flushPromise;
}

export function listenDiagnosticSessions(onData, onError) {
  const source = query(collection(db, DIAGNOSTIC_COLLECTION), orderBy('lastSeenAt', 'desc'), limit(200));
  return onSnapshot(source, snapshot => {
    onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function updateDiagnosticAdminReview(documentId, adminUid, updates = {}) {
  const allowedStatuses = ['new', 'investigating', 'resolved', 'archived'];
  const nextStatus = allowedStatuses.includes(updates.adminStatus) ? updates.adminStatus : 'investigating';
  const archived = updates.archived === true;
  await updateDoc(doc(db, DIAGNOSTIC_COLLECTION, documentId), {
    adminStatus: archived ? 'archived' : nextStatus,
    adminNote: String(updates.adminNote || '').trim().slice(0, 1000),
    archived,
    reviewedBy: String(adminUid || '').slice(0, 128),
    reviewedAt: serverTimestamp(),
    ...(archived ? {
      archivedBy: String(adminUid || '').slice(0, 128),
      archivedAt: serverTimestamp(),
    } : {}),
  });
}
