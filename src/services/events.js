import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { auth, db, ensureFirebaseSession, functions } from '../firebase/firebase';
import { getEventMetroArea } from '../utils/cities';
import { applyPrayerOffset, calculatePrayerTimes, prayerLabel } from './prayerTimes';
import { getHijriDisplay, getHijriParts, hijriDisplayFromParts, hijriToGregorian } from './hijri';
import { getOrganisations, resolveOrganisationLogo } from './organisations';

function toComparableTime(time = '') {
  const value = String(time || '').trim();
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '99:99';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function compareEventsByDateTime(a, b) {
  const dateA = String(a?.eventDate || '9999-99-99');
  const dateB = String(b?.eventDate || '9999-99-99');
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  return toComparableTime(a?.startTime).localeCompare(toComparableTime(b?.startTime));
}

export async function getPublicEvents() {
  const user = await ensureFirebaseSession();
  if (!user || user.isAnonymous) {
    const fn = httpsCallable(functions, 'getPublicEvents');
    const result = await fn();
    const events = Array.isArray(result.data?.events) ? result.data.events : [];
    return attachOrganisationLogosToEvents(events);
  }

  const yesterdayDate = new Date();
  yesterdayDate.setHours(12, 0, 0, 0);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = [
    yesterdayDate.getFullYear(),
    String(yesterdayDate.getMonth() + 1).padStart(2, '0'),
    String(yesterdayDate.getDate()).padStart(2, '0'),
  ].join('-');

  const eventCollection = collection(db, 'events');
  const [upcomingSnapshot, liveSnapshot] = await Promise.all([
    getDocs(query(
      eventCollection,
      where('status', '==', 'active'),
      where('eventDate', '>=', yesterday),
      orderBy('eventDate', 'asc'),
      limit(750)
    )),
    getDocs(query(eventCollection, where('isLive', '==', true))),
  ]);

  const eventsById = new Map();
  [...upcomingSnapshot.docs, ...liveSnapshot.docs].forEach(item => {
    const event = { id: item.id, ...item.data() };
    if (event.status === 'active' && !event.hidden) eventsById.set(item.id, event);
  });

  return attachOrganisationLogosToEvents(
    [...eventsById.values()].sort(compareEventsByDateTime)
  );
}

export function listenActiveEvents(onEvents, onError) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return () => {};

  const yesterdayDate = new Date();
  yesterdayDate.setHours(12, 0, 0, 0);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = [
    yesterdayDate.getFullYear(),
    String(yesterdayDate.getMonth() + 1).padStart(2, '0'),
    String(yesterdayDate.getDate()).padStart(2, '0'),
  ].join('-');
  const eventCollection = collection(db, 'events');
  const upcomingQuery = query(
    eventCollection,
    where('status', '==', 'active'),
    where('eventDate', '>=', yesterday),
    orderBy('eventDate', 'asc'),
    limit(750)
  );
  const liveQuery = query(eventCollection, where('isLive', '==', true));
  let upcomingEvents = [];
  let liveEvents = [];
  let active = true;
  let emission = 0;

  const emit = async () => {
    const currentEmission = ++emission;
    const eventsById = new Map();
    [...upcomingEvents, ...liveEvents].forEach(event => {
      if (event.status === 'active' && !event.hidden) eventsById.set(event.id, event);
    });
    try {
      const enriched = await attachOrganisationLogosToEvents(
        [...eventsById.values()].sort(compareEventsByDateTime)
      );
      if (active && currentEmission === emission) onEvents?.(enriched);
    } catch (error) {
      if (active) onError?.(error);
    }
  };

  const snapshotRows = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const handleError = error => {
    if (active) onError?.(error);
  };
  const unsubscribeUpcoming = onSnapshot(upcomingQuery, snapshot => {
    upcomingEvents = snapshotRows(snapshot);
    emit();
  }, handleError);
  const unsubscribeLive = onSnapshot(liveQuery, snapshot => {
    liveEvents = snapshotRows(snapshot);
    emit();
  }, handleError);

  return () => {
    active = false;
    unsubscribeUpcoming();
    unsubscribeLive();
  };
}

export async function importBulkEvents(events = []) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in with an admin account to import events.');
  if (!Array.isArray(events) || !events.length) throw new Error('No events were provided for import.');
  const fn = httpsCallable(functions, 'bulkImportEvents');
  const result = await fn({ events });
  return result.data || { created: 0, errors: [], message: 'Import finished.' };
}

export function filterEventsByCity(events, city) {
  if (!city) return events;
  return events.filter(event => getEventMetroArea(event) === city);
}

export function prepareHomeEvents(events, city) {
  return filterEventsByCity(events, city)
    .filter(event => event?.status !== 'inactive' && !event?.hidden)
    .sort(compareEventsByDateTime);
}

export function getEventTitle(event = {}) {
  const type = event.eventTypeDisplay || event.customEventType || event.eventType || event.type || 'Event';
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const subject = event.eventSubject || event.subject || event.eventName || '';
  return [type, host, subject].filter(Boolean).join(' - ') || 'Community Event';
}

export function getEventSuburb(event = {}) {
  if (event.suburb) return event.suburb;
  const address = event.address || {};
  if (typeof address === 'string') return address.split(',')[0]?.trim() || '';
  return address.suburb || address.city || '';
}

export function getEventPoster(event = {}) {
  return event.imageUrl || event.posterUrl || event.poster || event.organisationLogo || event.orgLogo || null;
}

export async function attachOrganisationLogosToEvents(events = []) {
  if (!Array.isArray(events) || !events.length) return [];
  const organisations = await getOrganisations();
  return events.map(event => ({
    ...event,
    organisationLogo: event.organisationLogo || event.orgLogo || resolveOrganisationLogo(event, organisations) || '',
  }));
}

export async function createEventSubmission(payload = {}) {
  const user = await ensureFirebaseSession();
  if (!user || user.isAnonymous) throw new Error('Sign in or create an account to add events.');
  const ref = await addDoc(collection(db, 'events'), {
    ...payload,
    createdByUserId: user.uid,
    createdByUserEmail: payload.createdByUserEmail || user.email || '',
    createdByUserPhone: payload.createdByUserPhone || user.phoneNumber || '',
    status: 'active',
    hidden: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function createRecurringEventSeries({ payload = {}, occurrences = [], recurrence = {}, profile = {} }) {
  const user = await ensureFirebaseSession();
  if (!user || user.isAnonymous) throw new Error('Sign in or create an account to add events.');
  if (!occurrences.length) throw new Error('Please set a valid recurrence schedule.');

  const seriesId = `recurring_${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const startDate = occurrences[0].eventDate;
  const endDate = occurrences[occurrences.length - 1].eventDate;
  const recurrenceRuleSnapshot = {
    calendarType: recurrence.calendarType,
    frequency: recurrence.frequency,
    repeatEvery: Number(recurrence.repeatEvery),
    endMode: recurrence.endMode,
    endDate: recurrence.endMode === 'date' && recurrence.calendarType === 'gregorian'
      ? recurrence.endDate
      : null,
    endHijri: recurrence.endMode === 'date' && recurrence.calendarType === 'hijri'
      ? recurrence.endHijri
      : null,
    occurrenceCount: recurrence.endMode === 'count' ? Number(recurrence.occurrenceCount) : null,
  };
  const sharedPayload = {
    ...payload,
    createdByUserId: user.uid,
    createdByUserEmail: payload.createdByUserEmail || user.email || '',
    createdByUserPhone: payload.createdByUserPhone || user.phoneNumber || '',
    status: 'active',
    hidden: false,
    isSeries: true,
    isRecurring: true,
    seriesId,
    recurringSeriesId: seriesId,
    seriesStartDate: startDate,
    seriesEndDate: endDate,
    recurrenceRuleSnapshot,
  };

  for (let offset = 0; offset < occurrences.length; offset += 450) {
    const batch = writeBatch(db);
    occurrences.slice(offset, offset + 450).forEach((occurrence, indexInChunk) => {
      const index = offset + indexInChunk;
      const prayerTimes = payload.timeMode === 'prayer'
        ? calculatePrayerTimes(occurrence.eventDate, payload.address)
        : null;
      const prayerName = payload.prayerName || '';
      const prayerOffsetMinutes = Number(payload.prayerOffsetMinutes || 0);
      const occurrenceStartTime = prayerTimes?.[prayerName]
        ? applyPrayerOffset(prayerTimes[prayerName], prayerOffsetMinutes)
        : payload.startTime;
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        ...sharedPayload,
        eventDate: occurrence.eventDate,
        startTime: occurrenceStartTime,
        prayerLabel: prayerName ? prayerLabel(prayerName) : '',
        prayerOffsetMinutes,
        prayerTimeZone: prayerTimes?.timeZone || payload.prayerTimeZone || '',
        hijriDate: occurrence.hijriDate,
        hijriDay: occurrence.hijriDay || null,
        hijriMonth: occurrence.hijriMonth || null,
        hijriYear: occurrence.hijriYear || null,
        enteredAsHijri: occurrence.enteredAsHijri,
        recurrenceIndex: index + 1,
        recurrenceTotal: occurrences.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  try {
    await setDoc(doc(db, 'recurringEventSeries', seriesId), {
      id: seriesId,
      ownerUid: user.uid,
      ownerName: profile?.fullName || '',
      ownerEmail: user.email || profile?.email || '',
      title: `${payload.eventTypeDisplay || payload.eventType || 'Event'} - ${payload.hostName || ''}`.trim(),
      status: 'active',
      startDate,
      endDate,
      totalEvents: occurrences.length,
      rule: recurrenceRuleSnapshot,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (metadataError) {
    // Every event already contains the complete recurrence snapshot. Some
    // deployed rulesets intentionally reserve this optional summary collection.
    if (!String(metadataError?.code || '').includes('permission-denied')) throw metadataError;
  }

  return { seriesId, totalEvents: occurrences.length };
}

export async function getUserEventSubmissions(uid) {
  if (!uid) return [];
  const ref = collection(db, 'events');
  const q = query(ref, where('createdByUserId', '==', uid));
  const snapshot = await getDocs(q);
  const events = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(event => !event.status || event.status === 'active')
    .sort(compareEventsByDateTime);
  return attachOrganisationLogosToEvents(events);
}

export async function updateEventSubmission(eventId, payload = {}) {
  if (!eventId) return null;
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to update this event.');
  await updateDoc(doc(db, 'events', eventId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  return eventId;
}

export async function deleteEventSubmission(eventId) {
  if (!eventId) return null;
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to delete this event.');
  await deleteDoc(doc(db, 'events', eventId));
  return eventId;
}

export async function setEventVisibility(eventId, hidden) {
  if (!eventId) return null;
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to change event visibility.');
  await updateDoc(doc(db, 'events', eventId), {
    hidden: Boolean(hidden),
    hiddenAt: hidden ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
  return eventId;
}

function seriesQueryForEvent(event = {}) {
  const seriesId = event.seriesId || event.recurringSeriesId || '';
  if (!seriesId) throw new Error('This recurring series does not have a series ID yet.');
  const field = event.seriesId ? 'seriesId' : 'recurringSeriesId';
  return {
    field,
    seriesId,
    ref: query(collection(db, 'events'), where(field, '==', seriesId)),
  };
}

export async function updateEventSeries(sourceEvent, payload = {}) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to update this recurring series.');

  const { seriesId, ref } = seriesQueryForEvent(sourceEvent);
  const protectedFields = new Set([
    'id',
    '__editSeries',
    'eventDate',
    'hijriDate',
    'hijriDay',
    'hijriMonth',
    'hijriYear',
    'enteredAsHijri',
    'seriesId',
    'recurringSeriesId',
    'isRecurring',
    'recurrenceIndex',
    'recurrenceTotal',
    'recurrenceRuleSnapshot',
    'seriesStartDate',
    'seriesEndDate',
    'createdAt',
    'createdByUserId',
    'createdByUserEmail',
    'createdByUserPhone',
    'isLive',
    'liveUrl',
    'liveWatchUrl',
    'liveRoomCode',
    'liveStartedAt',
    'liveEndedAt',
  ]);
  const updates = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !protectedFields.has(key))
  );
  const snapshot = await getDocs(ref);
  if (snapshot.empty) throw new Error('No matching series events were found.');

  for (let offset = 0; offset < snapshot.docs.length; offset += 450) {
    const batch = writeBatch(db);
    snapshot.docs.slice(offset, offset + 450).forEach(item => {
      batch.update(item.ref, { ...updates, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }

  try {
    await setDoc(doc(db, 'recurringEventSeries', seriesId), {
      title: `${payload.eventTypeDisplay || payload.eventType || 'Event'} - ${payload.hostName || ''}`.trim(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (metadataError) {
    if (!String(metadataError?.code || '').includes('permission-denied')) throw metadataError;
  }

  return snapshot.docs.length;
}

export async function deleteEventSeries(sourceEvent) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to delete this recurring series.');

  const { seriesId, ref } = seriesQueryForEvent(sourceEvent);
  const snapshot = await getDocs(ref);
  if (snapshot.empty) throw new Error('No matching series events were found.');

  for (let offset = 0; offset < snapshot.docs.length; offset += 450) {
    const batch = writeBatch(db);
    snapshot.docs.slice(offset, offset + 450).forEach(item => {
      batch.delete(item.ref);
    });
    await batch.commit();
  }

  try {
    await deleteDoc(doc(db, 'recurringEventSeries', seriesId));
  } catch (metadataError) {
    if (!String(metadataError?.code || '').includes('permission-denied')) throw metadataError;
  }

  return snapshot.docs.length;
}

function buildRecalculatedEventData(event = {}, overrides = []) {
  const updates = {};
  let changed = false;

  if (event.enteredAsHijri && event.hijriDay && event.hijriMonth && event.hijriYear) {
    const nextEventDate = hijriToGregorian(event.hijriDay, event.hijriMonth, event.hijriYear, overrides);
    const nextHijriDate = hijriDisplayFromParts(event.hijriDay, event.hijriMonth, event.hijriYear);
    if (nextEventDate && nextEventDate !== event.eventDate) {
      updates.eventDate = nextEventDate;
      changed = true;
    }
    if (nextHijriDate && nextHijriDate !== event.hijriDate) {
      updates.hijriDate = nextHijriDate;
      changed = true;
    }
  } else if (event.eventDate) {
    const nextHijriDate = getHijriDisplay(event.eventDate, overrides);
    const nextHijriParts = getHijriParts(event.eventDate, overrides);
    if (nextHijriDate && nextHijriDate !== event.hijriDate) {
      updates.hijriDate = nextHijriDate;
      changed = true;
    }
    if (nextHijriParts?.day && nextHijriParts.day !== event.hijriDay) {
      updates.hijriDay = nextHijriParts.day;
      changed = true;
    }
    if (nextHijriParts?.month && nextHijriParts.month !== event.hijriMonth) {
      updates.hijriMonth = nextHijriParts.month;
      changed = true;
    }
    if (nextHijriParts?.year && nextHijriParts.year !== event.hijriYear) {
      updates.hijriYear = nextHijriParts.year;
      changed = true;
    }
  }

  if (event.timeMode === 'prayer' && event.prayerName && event.eventDate && event.address) {
    const prayerTimes = calculatePrayerTimes(event.eventDate, event.address);
    if (prayerTimes?.[event.prayerName]) {
      const nextStartTime = applyPrayerOffset(prayerTimes[event.prayerName], event.prayerOffsetMinutes || 0);
      const nextPrayerLabel = prayerLabel(event.prayerName);
      if (nextStartTime && nextStartTime !== event.startTime) {
        updates.startTime = nextStartTime;
        changed = true;
      }
      if (nextPrayerLabel && nextPrayerLabel !== event.prayerLabel) {
        updates.prayerLabel = nextPrayerLabel;
        changed = true;
      }
      if (prayerTimes.timeZone && prayerTimes.timeZone !== event.prayerTimeZone) {
        updates.prayerTimeZone = prayerTimes.timeZone;
        changed = true;
      }
    }
  }

  return changed ? updates : null;
}

export async function recalculateHijriEventMetadata(overrides = []) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to recalculate Hijri event dates.');

  const snapshot = await getDocs(collection(db, 'events'));
  const updates = [];
  let hijriEvents = 0;
  let gregEvents = 0;

  snapshot.docs.forEach(item => {
    const event = { id: item.id, ...item.data() };
    const nextUpdates = buildRecalculatedEventData(event, overrides);
    if (!nextUpdates) return;
    if (event.enteredAsHijri) hijriEvents += 1;
    else gregEvents += 1;
    updates.push({ ref: item.ref, updates: { ...nextUpdates, updatedAt: serverTimestamp() } });
  });

  for (let offset = 0; offset < updates.length; offset += 450) {
    const batch = writeBatch(db);
    updates.slice(offset, offset + 450).forEach(item => {
      batch.update(item.ref, item.updates);
    });
    await batch.commit();
  }

  return {
    updated: updates.length,
    hijriEvents,
    gregEvents,
  };
}
