import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { getEventSuburb, getEventTitle } from './events';
import { calculatePrayerTimes, prayerLabel, prayerDateAt, prayerTimeInstant } from './prayerTimes';
import { registrationInstant, registrationSchedule } from '../registration/eventSchedule';

const REMINDER_STORAGE_KEY = '@community-events/event-reminders';
const REMINDER_CHANNEL_ID = 'event-reminders';
const PRAYER_REMINDER_CHANNEL_ID = 'prayer-reminders';
const PRAYER_REMINDER_STORAGE_KEY = '@community-events/prayer-reminders';
const PRAYER_CALCULATION_VERSION = 'location-instant-2026-10-15';
const AZAAN_ALARM_CHANNEL_ID = 'azaan-alarms-v2';
const AZAAN_ALARM_STORAGE_KEY = '@community-events/azaan-alarms-v1';
const AZAAN_SOUND_FILE = Platform.OS === 'ios' ? 'azan_mashad.wav' : 'azan_mashad.mp3';
export const DEFAULT_PRAYER_REMINDER_KEYS = ['fajr', 'zohrain', 'maghreb'];
export const AZAAN_ALARM_KEYS = ['fajr', 'zohrain', 'maghreb'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function readReminderMap() {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(REMINDER_STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

async function writeReminderMap(value) {
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(value));
}

function eventStartDate(event = {}) {
  if (event.registrationOnly) {
    if (event.status !== 'approved') throw new Error('Reminders are unavailable for events that are not approved or have been deleted.');
    const schedule = registrationSchedule({ ...event, date: event.eventDate || event.date });
    if (!schedule.startAt) throw new Error('The organiser has not supplied a start time. Timed reminders are unavailable.');
    return new Date(schedule.startAt);
  }
  const date = String(event.eventDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = String(event.startTime || '09:00').match(/^(\d{1,2}):(\d{2})/);
  const hour = time ? Number(time[1]) : 9;
  const minute = time ? Number(time[2]) : 0;
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(hour, minute, 0, 0);
  return start;
}

async function ensureNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Event reminders',
      description: 'Reminders you choose for Community Connect Australia events.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#129182',
      sound: 'default',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync(
    Platform.OS === 'ios'
      ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } }
      : undefined,
  );
  return requested.status === 'granted';
}

export async function getDeviceNotificationPermission() {
  const permission = await Notifications.getPermissionsAsync();
  return permission.status === 'granted';
}

export async function ensureDeviceNotificationsEnabled() {
  return ensureNotificationPermission();
}

export async function openDeviceNotificationSettings({ exactAlarm = false } = {}) {
  if (Platform.OS !== 'android') {
    await Linking.openSettings();
    return;
  }

  const applicationId = Constants.expoConfig?.android?.package || 'info.siza.communityevents.app';
  try {
    await IntentLauncher.startActivityAsync(
      exactAlarm
        ? IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM
        : IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      { data: `package:${applicationId}` },
    );
  } catch {
    await Linking.openSettings();
  }
}

function notificationScheduleError(error) {
  const message = String(error?.message || '');
  const exactAlarm = Platform.OS === 'android'
    && /exact|alarm|securityexception|schedule_exact_alarm/i.test(message);
  const nextError = new Error(exactAlarm
    ? 'Exact alarms are blocked for this app. Allow Alarms & reminders, then set the event reminder again.'
    : 'The phone did not retain this reminder. Check Community Connect Australia notification settings and try again.');
  nextError.code = exactAlarm ? 'EXACT_ALARM_BLOCKED' : 'REMINDER_NOT_SCHEDULED';
  return nextError;
}

async function scheduleVerifiedNotification(request) {
  let notificationId = '';
  try {
    notificationId = await Notifications.scheduleNotificationAsync(request);
    // On iOS, scheduleNotificationAsync resolving with an identifier is the
    // native confirmation. An immediate getAllScheduledNotificationsAsync
    // read can lag behind the write and previously caused a valid reminder to
    // be cancelled as "not retained".
    if (Platform.OS === 'ios') return notificationId;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!scheduled.some(item => item.identifier === notificationId)) {
      throw new Error('Scheduled notification was not retained by this device.');
    }
    return notificationId;
  } catch (error) {
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
    }
    throw notificationScheduleError(error);
  }
}

async function ensurePrayerNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PRAYER_REMINDER_CHANNEL_ID, {
      name: 'Prayer-time reminders',
      description: 'Prayer-time reminders selected in Community Connect Australia.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#5b3fb5',
      sound: 'default',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync(
    Platform.OS === 'ios'
      ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } }
      : undefined,
  );
  return requested.status === 'granted';
}

async function readPrayerReminderSettings() {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(PRAYER_REMINDER_STORAGE_KEY) || '{}');
    return {
      enabledKeys: Array.isArray(value.enabledKeys) ? value.enabledKeys : [],
      notificationIds: Array.isArray(value.notificationIds) ? value.notificationIds : [],
      location: value.location || null,
      initialized: value.initialized === true,
      refreshedAt: value.refreshedAt || '',
      calculationVersion: value.calculationVersion || '',
    };
  } catch {
    return { enabledKeys: [], notificationIds: [], location: null, initialized: false, refreshedAt: '' };
  }
}

async function cancelPrayerNotificationIds(ids = []) {
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

async function readAzaanAlarmSettings() {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(AZAAN_ALARM_STORAGE_KEY) || '{}');
    return {
      enabledKeys: Array.isArray(value.enabledKeys) ? value.enabledKeys.filter(key => AZAAN_ALARM_KEYS.includes(key)) : [],
      notificationIds: Array.isArray(value.notificationIds) ? value.notificationIds : [],
      location: value.location || null,
      refreshedAt: value.refreshedAt || '',
    };
  } catch {
    return { enabledKeys: [], notificationIds: [], location: null, refreshedAt: '' };
  }
}

async function ensureAzaanNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(AZAAN_ALARM_CHANNEL_ID, {
      name: 'Azaan alarms',
      description: 'Azaan alarms selected in the Community Connect Australia Hijri Calendar.',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 180, 300, 180, 500],
      lightColor: '#129182',
      sound: AZAAN_SOUND_FILE,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync(
    Platform.OS === 'ios'
      ? { ios: { allowAlert: true, allowBadge: true, allowSound: true } }
      : undefined,
  );
  return requested.status === 'granted';
}

export async function getAzaanAlarmSettings() {
  return readAzaanAlarmSettings();
}

async function scheduleAzaanAlarmKeys(keys, location, currentSettings) {
  const current = currentSettings || await readAzaanAlarmSettings();
  const enabledKeys = [...new Set(keys)].filter(key => AZAAN_ALARM_KEYS.includes(key));
  const scheduleLocation = location || current.location;
  await cancelPrayerNotificationIds(current.notificationIds);

  if (!enabledKeys.length) {
    const cleared = { enabledKeys: [], notificationIds: [], location: scheduleLocation || null, refreshedAt: new Date().toISOString() };
    await AsyncStorage.setItem(AZAAN_ALARM_STORAGE_KEY, JSON.stringify(cleared));
    return cleared;
  }
  if (!calculatePrayerTimes(prayerDateAt(scheduleLocation), scheduleLocation)) {
    await AsyncStorage.setItem(AZAAN_ALARM_STORAGE_KEY, JSON.stringify({ ...current, notificationIds: [], location: scheduleLocation, refreshedAt: null }));
    throw new Error('Choose a supported Australian city before setting Azaan alarms.');
  }
  if (!(await ensureAzaanNotificationPermission())) {
    throw new Error('Notifications are disabled. Enable them in your phone settings to use Azaan alarms.');
  }

  const notificationIds = [];
  // iOS retains at most 64 pending local notifications per app. A seven-day
  // horizon leaves room for event reminders while still covering every prayer.
  const scheduleDays = Platform.OS === 'ios' ? 7 : 21;
  const scheduleNow = new Date();
  for (let dayOffset = 0; dayOffset < scheduleDays; dayOffset += 1) {
    const isoDate = prayerDateAt(scheduleLocation, scheduleNow, dayOffset);
    const times = calculatePrayerTimes(isoDate, scheduleLocation);
    if (!times) continue;
    for (const key of enabledKeys) {
      const match = String(times[key] || '').match(/^(\d{2}):(\d{2})$/);
      if (!match) continue;
      const triggerDate = prayerTimeInstant(isoDate, times[key], times.timeZone);
      if (!triggerDate) continue;
      if (triggerDate.getTime() <= Date.now()) continue;
      const notificationId = await scheduleVerifiedNotification({
        content: {
          title: `${prayerLabel(key)} Azaan`,
          body: `${scheduleLocation?.suburb || 'Your city'} · ${times[key]}`,
          sound: AZAAN_SOUND_FILE,
          data: { screen: 'hijri-calendar', prayer: key, kind: 'azaan-alarm' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          ...(Platform.OS === 'android' ? { channelId: AZAAN_ALARM_CHANNEL_ID } : {}),
        },
      });
      notificationIds.push(notificationId);
    }
  }

  const next = { enabledKeys, notificationIds, location: scheduleLocation, refreshedAt: new Date().toISOString() };
  await AsyncStorage.setItem(AZAAN_ALARM_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function setAzaanAlarm(prayerKey, enabled, location) {
  const current = await readAzaanAlarmSettings();
  const enabledKeys = enabled
    ? [...new Set([...current.enabledKeys, prayerKey])]
    : current.enabledKeys.filter(key => key !== prayerKey);
  return scheduleAzaanAlarmKeys(enabledKeys, location, current);
}

export async function refreshAzaanAlarms(location) {
  const current = await readAzaanAlarmSettings();
  if (!current.enabledKeys.length) return current;
  return scheduleAzaanAlarmKeys(current.enabledKeys, location || current.location, current);
}

export async function getPrayerReminderSettings() {
  return readPrayerReminderSettings();
}

async function schedulePrayerReminderKeys(keys, location, currentSettings) {
  const current = currentSettings || await readPrayerReminderSettings();
  const enabledKeys = [...new Set(keys)].filter(Boolean);
  const scheduleLocation = location || current.location;
  if (enabledKeys.length && !calculatePrayerTimes(prayerDateAt(scheduleLocation), scheduleLocation)) {
    // Do not leave the previous city's alarms running after a city is unavailable.
    await cancelPrayerNotificationIds(current.notificationIds);
    await AsyncStorage.setItem(PRAYER_REMINDER_STORAGE_KEY, JSON.stringify({ ...current, notificationIds: [], location: scheduleLocation, refreshedAt: null }));
    throw new Error('Choose a supported Australian city before setting prayer-time reminders.');
  }
  await cancelPrayerNotificationIds(current.notificationIds);

  if (!enabledKeys.length) {
    const cleared = { enabledKeys: [], notificationIds: [], location: scheduleLocation || null, initialized: true, refreshedAt: new Date().toISOString() };
    await AsyncStorage.setItem(PRAYER_REMINDER_STORAGE_KEY, JSON.stringify(cleared));
    return cleared;
  }
  if (!(await ensurePrayerNotificationPermission())) {
    throw new Error('Notifications are disabled. Enable them in your phone settings to use prayer-time reminders.');
  }

  const notificationIds = [];
  // Leave room within iOS's pending-local-notification limit for event
  // reminders and optional Azaan alarms.
  const scheduleDays = Platform.OS === 'ios' ? 7 : 21;
  const scheduleNow = new Date();
  for (let dayOffset = 0; dayOffset < scheduleDays; dayOffset += 1) {
    const isoDate = prayerDateAt(scheduleLocation, scheduleNow, dayOffset);
    const times = calculatePrayerTimes(isoDate, scheduleLocation);
    if (!times) continue;
    for (const key of enabledKeys) {
      const match = String(times[key] || '').match(/^(\d{2}):(\d{2})$/);
      if (!match) continue;
      const triggerDate = prayerTimeInstant(isoDate, times[key], times.timeZone);
      if (!triggerDate) continue;
      if (triggerDate.getTime() <= Date.now()) continue;
      const id = await scheduleVerifiedNotification({
        content: {
          title: `${prayerLabel(key)} prayer time`,
          body: `${scheduleLocation?.suburb || 'Your city'} · ${times[key]}`,
          sound: 'default',
          data: { screen: 'hijri-calendar', prayer: key, kind: 'prayer-reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          ...(Platform.OS === 'android' ? { channelId: PRAYER_REMINDER_CHANNEL_ID } : {}),
        },
      });
      notificationIds.push(id);
    }
  }

  const next = { enabledKeys, notificationIds, location: scheduleLocation, initialized: true, refreshedAt: new Date().toISOString(), calculationVersion: PRAYER_CALCULATION_VERSION };
  await AsyncStorage.setItem(PRAYER_REMINDER_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function initializeDefaultPrayerReminders(location) {
  const current = await readPrayerReminderSettings();
  const savedLocation = current.location || {};
  const nextLocation = location || {};
  const locationChanged = String(savedLocation.city || savedLocation.suburb || '')
    !== String(nextLocation.city || nextLocation.suburb || '')
    || savedLocation.latitude !== nextLocation.latitude
    || savedLocation.longitude !== nextLocation.longitude
    || savedLocation.timeZone !== nextLocation.timeZone;
  const refreshedAt = new Date(current.refreshedAt || 0).getTime();
  const scheduleIsStale = !Number.isFinite(refreshedAt)
    || refreshedAt < Date.now() - (12 * 60 * 60 * 1000);

  if (!current.initialized) {
    return schedulePrayerReminderKeys(DEFAULT_PRAYER_REMINDER_KEYS, location, current);
  }

  // Older builds could record reminders as initialized without leaving any
  // alarms on the phone. When the main Prayer Reminders preference is on,
  // restore the default reminders rather than silently returning an empty set.
  const enabledKeys = current.enabledKeys.length
    ? current.enabledKeys
    : DEFAULT_PRAYER_REMINDER_KEYS;
  if (locationChanged || scheduleIsStale || current.calculationVersion !== PRAYER_CALCULATION_VERSION || !current.notificationIds.length || !current.enabledKeys.length) {
    return schedulePrayerReminderKeys(enabledKeys, location, current);
  }
  return current;
}

export async function setPrayerRemindersEnabled(enabled, location) {
  const current = await readPrayerReminderSettings();
  return schedulePrayerReminderKeys(enabled ? DEFAULT_PRAYER_REMINDER_KEYS : [], location, current);
}

export async function setPrayerReminder(prayerKey, enabled, location) {
  const current = await readPrayerReminderSettings();
  const enabledKeys = enabled
    ? [...new Set([...current.enabledKeys, prayerKey])]
    : current.enabledKeys.filter(key => key !== prayerKey);
  return schedulePrayerReminderKeys(enabledKeys, location, current);
}

export async function getEventReminder(eventId, event = null) {
  if (!eventId) return null;
  const reminders = await readReminderMap();
  const reminder = reminders[eventId] || null;
  if (reminder && event?.registrationOnly) {
    const schedule = registrationSchedule({ ...event, date: event.eventDate || event.date });
    if (event.status !== 'approved' || !schedule.startAt || reminder.eventStartAt !== schedule.startAt) {
      await cancelEventReminder(eventId);
      return null;
    }
  }
  return reminder;
}

export async function cancelEventReminder(eventId) {
  if (!eventId) return;
  const reminders = await readReminderMap();
  const existing = reminders[eventId];
  if (existing?.notificationId) {
    await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => {});
  }
  delete reminders[eventId];
  await writeReminderMap(reminders);
}

export async function scheduleEventReminder(event, minutesBefore) {
  if (!event?.id) throw new Error('This event cannot be identified.');
  const start = eventStartDate(event);
  if (!start) throw new Error('This event does not have a valid date and time.');

  const minutes = Number(minutesBefore);
  const triggerDate = new Date(start.getTime() - minutes * 60 * 1000);
  if (triggerDate.getTime() <= Date.now()) {
    throw new Error('That reminder time has already passed. Choose a later option.');
  }

  const permitted = await ensureNotificationPermission();
  if (!permitted) {
    const permissionError = new Error('Notifications are disabled. Enable them in your phone settings to set a reminder.');
    permissionError.code = 'NOTIFICATION_PERMISSION_DENIED';
    throw permissionError;
  }

  await cancelEventReminder(event.id);
  const title = getEventTitle(event);
  const location = getEventSuburb(event);
  const notificationId = await scheduleVerifiedNotification({
    content: {
      title: `Upcoming event: ${title}`,
      body: location ? `${location} • Starts ${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : `Starts ${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`,
      sound: 'default',
      data: { eventId: event.id, screen: 'home', ...(event.registrationOnly ? { eventKind: 'registration' } : {}) },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });

  const reminder = {
    notificationId,
    eventId: event.id,
    minutesBefore: minutes,
    triggerAt: triggerDate.toISOString(),
    eventStartAt: start.toISOString(),
    source: 'custom',
  };
  const reminders = await readReminderMap();
  reminders[event.id] = reminder;
  await writeReminderMap(reminders);
  return reminder;
}

export async function scheduleFavouriteReminder(event) {
  if (!event?.id) return null;
  if (event.registrationOnly) await getEventReminder(event.id, event);
  if (event.registrationOnly && (event.status !== 'approved' || !event.startTime)) return null;
  const reminders = await readReminderMap();
  const existing = reminders[event.id];
  if (existing) return existing;
  const date = String(event.eventDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let triggerDate;
  if (event.registrationOnly) {
    eventStartDate(event);
    const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() - 1);
    triggerDate = new Date(registrationInstant(day.toISOString().slice(0, 10), '19:00', event.timeZone));
  } else {
    triggerDate = new Date(`${date}T19:00:00`);
    triggerDate.setDate(triggerDate.getDate() - 1);
  }
  if (triggerDate.getTime() <= Date.now()) return null;
  if (!(await ensureNotificationPermission())) return null;
  const notificationId = await scheduleVerifiedNotification({
    content: {
      title: `Tomorrow: ${getEventTitle(event)}`,
      body: `${getEventSuburb(event) || 'Community event'} \u2022 Tap to view details`,
      sound: 'default',
      data: { eventId: event.id, screen: 'favourites', ...(event.registrationOnly ? { eventKind: 'registration' } : {}) },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
  const reminder = { notificationId, eventId: event.id, triggerAt: triggerDate.toISOString(), source: 'favourite-auto',
    ...(event.registrationOnly ? { eventStartAt: eventStartDate(event).toISOString() } : {}) };
  reminders[event.id] = reminder;
  await writeReminderMap(reminders);
  return reminder;
}

export async function cancelFavouriteReminder(eventId) {
  const reminder = await getEventReminder(eventId);
  if (reminder?.source === 'favourite-auto') await cancelEventReminder(eventId);
}

export function formatReminderLeadTime(minutes) {
  if (minutes === 24 * 60) return '1 day before';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} minutes before`;
}
