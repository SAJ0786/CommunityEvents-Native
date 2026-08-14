import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getEventSuburb, getEventTitle } from './events';

const REMINDER_STORAGE_KEY = '@community-events/event-reminders';
const REMINDER_CHANNEL_ID = 'event-reminders';

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
      description: 'Reminders you choose for Community Events Australia events.',
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
  const notificationId = await Notifications.scheduleNotificationAsync({
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
  };
  const reminders = await readReminderMap();
  reminders[event.id] = reminder;
  await writeReminderMap(reminders);
  return reminder;
}

export function formatReminderLeadTime(minutes) {
  if (minutes === 24 * 60) return '1 day before';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  return `${minutes} minutes before`;
}
