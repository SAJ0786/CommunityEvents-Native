import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { getEventSuburb, getEventTitle } from './events';
import { calculatePrayerTimes, prayerLabel } from './prayerTimes';

const REMINDER_STORAGE_KEY = '@community-events/event-reminders';
const REMINDER_CHANNEL_ID = 'event-reminders';
const PRAYER_REMINDER_CHANNEL_ID = 'prayer-reminders';
const PRAYER_REMINDER_STORAGE_KEY = '@community-events/prayer-reminders';
const AZAAN_ALARM_CHANNEL_ID = 'azaan-alarms-v1';
const AZAAN_ALARM_STORAGE_KEY = '@community-events/azaan-alarms-v1';
const AZAAN_SOUND_FILE = 'azan_mashad.mp3';
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
  const requested = await Notifications.requestPermissionsAsync();
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
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (!scheduled.some(item => item.identifier === notificationId)) {
      throw new Error('Scheduled notification was not retained by Android.');
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
  const requested = await Notifications.requestPermissionsAsync();
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
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
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
  if (!calculatePrayerTimes(localIsoDate(new Date()), scheduleLocation)) {
    throw new Error('Choose a supported Australian city before setting Azaan alarms.');
  }
  if (!(await ensureAzaanNotificationPermission())) {
    throw new Error('Notifications are disabled. Enable them in your phone settings to use Azaan alarms.');
  }

  const notificationIds = [];
  for (let dayOffset = 0; dayOffset < 21; dayOffset += 1) {
    const day = new Date();
    day.setDate(day.getDate() + dayOffset);
    const times = calculatePrayerTimes(localIsoDate(day), scheduleLocation);
    if (!times) continue;
    for (const key of enabledKeys) {
      const match = String(times[key] || '').match(/^(\d{2}):(\d{2})$/);
      if (!match) continue;
      const triggerDate = new Date(day);
      triggerDate.setHours(Number(match[1]), Number(match[2]), 0, 0);
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

function localIsoDate(date) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

export async function getPrayerReminderSettings() {
  return readPrayerReminderSettings();
}

async function schedulePrayerReminderKeys(keys, location, currentSettings) {
  const current = currentSettings || await readPrayerReminderSettings();
  const enabledKeys = [...new Set(keys)].filter(Boolean);
  const scheduleLocation = location || current.location;
  if (enabledKeys.length && !calculatePrayerTimes(localIsoDate(new Date()), scheduleLocation)) {
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
  for (let dayOffset = 0; dayOffset < 21; dayOffset += 1) {
    const day = new Date();
    day.setDate(day.getDate() + dayOffset);
    const isoDate = localIsoDate(day);
    const times = calculatePrayerTimes(isoDate, scheduleLocation);
    if (!times) continue;
    for (const key of enabledKeys) {
      const match = String(times[key] || '').match(/^(\d{2}):(\d{2})$/);
      if (!match) continue;
      const triggerDate = new Date(day);
      triggerDate.setHours(Number(match[1]), Number(match[2]), 0, 0);
      if (triggerDate.getTime() <= Date.now()) continue;
      const id = await scheduleVerifiedNotification({
        content: {
          title: `${prayerLabel(key)} prayer time`,
          body: `${scheduleLocation?.suburb || 'Your city'} · ${times[key]}`,
          sound: 'default',
          data: { screen: 'hijri-calendar', prayer: key },
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

  const next = { enabledKeys, notificationIds, location: scheduleLocation, initialized: true, refreshedAt: new Date().toISOString() };
  await AsyncStorage.setItem(PRAYER_REMINDER_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function initializeDefaultPrayerReminders(location) {
  const current = await readPrayerReminderSettings();
  const savedLocation = current.location || {};
  const nextLocation = location || {};
  const locationChanged = String(savedLocation.city || savedLocation.suburb || '')
    !== String(nextLocation.city || nextLocation.suburb || '');
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
  if (locationChanged || scheduleIsStale || !current.notificationIds.length || !current.enabledKeys.length) {
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

export async function getEventReminder(eventId) {
  if (!eventId) return null;
  const reminders = await readReminderMap();
  return reminders[eventId] || null;
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
    throw new Error('Notifications are disabled. Enable them in your phone settings to set a reminder.');
  }

  await cancelEventReminder(event.id);
  const title = getEventTitle(event);
  const location = getEventSuburb(event);
  const notificationId = await scheduleVerifiedNotification({
    content: {
      title: `Upcoming event: ${title}`,
      body: location ? `${location} • Starts ${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : `Starts ${start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`,
      sound: 'default',
      data: { eventId: event.id, screen: 'home' },
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
  const reminders = await readReminderMap();
  const existing = reminders[event.id];
  if (existing) return existing;
  const date = String(event.eventDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const triggerDate = new Date(`${date}T19:00:00`);
  triggerDate.setDate(triggerDate.getDate() - 1);
  if (triggerDate.getTime() <= Date.now()) return null;
  if (!(await ensureNotificationPermission())) return null;
  const notificationId = await scheduleVerifiedNotification({
    content: {
      title: `Tomorrow: ${getEventTitle(event)}`,
      body: `${getEventSuburb(event) || 'Community event'} \u2022 Tap to view details`,
      sound: 'default',
      data: { eventId: event.id, screen: 'favourites' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
  const reminder = { notificationId, eventId: event.id, triggerAt: triggerDate.toISOString(), source: 'favourite-auto' };
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
