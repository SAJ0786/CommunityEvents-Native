import { Linking, Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Clipboard from 'expo-clipboard';
import { getEventTitle } from './events';

const APP_DOMAIN = 'https://communityevents.siza.info';

export function buildFeedUrl(uid) {
  return `${APP_DOMAIN}/cal?t=${encodeURIComponent(uid || '')}`;
}

export function calendarInstructions() {
  return {
    iphone: [
      'Open the Settings app on your iPhone',
      'Tap Calendar → Accounts → Add Account',
      'Choose “Other” → “Add Subscribed Calendar”',
      'Paste your personal feed URL and tap Next',
      'Tap Save — events will appear in your Calendar app',
    ],
    android: [
      'Copy your personal feed URL',
      'Open Google Calendar in a browser: calendar.google.com',
      'Tap the “+” next to “Other calendars”',
      'Choose “From URL” and paste your feed URL',
      'Tap Add Calendar — it syncs to your Android automatically',
    ],
  };
}

export async function copyCalendarFeed(uid) {
  const url = buildFeedUrl(uid);
  await Clipboard.setStringAsync(url);
  return url;
}

export async function openLiveCalendarSubscription(uid, alternate = false) {
  const feedUrl = buildFeedUrl(uid);
  if (Platform.OS === 'ios') {
    return Linking.openURL(`webcal://${feedUrl.replace(/^https?:\/\//, '')}`);
  }
  const calendarFeed = alternate ? feedUrl : feedUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarFeed)}`;
  return Linking.openURL(googleUrl);
}

function eventDateTime(dateValue, timeValue, fallbackHour = 10) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  const [hour, minute] = String(timeValue || '').split(':').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, Number.isFinite(hour) ? hour : fallbackHour, Number.isFinite(minute) ? minute : 0);
}

export async function openEventInDeviceCalendar(event = {}) {
  const startDate = eventDateTime(event.eventDate, event.startTime);
  if (!startDate) throw new Error('This event does not have a valid date.');
  const endDate = eventDateTime(event.eventDate, event.endTime) || new Date(startDate.getTime() + 60 * 60 * 1000);
  if (endDate <= startDate) endDate.setTime(startDate.getTime() + 60 * 60 * 1000);
  const address = event.address?.fullAddress || [
    event.address?.street,
    event.address?.suburb,
    event.address?.state,
    event.address?.postcode,
  ].filter(Boolean).join(', ');
  const notes = [
    event.hijriDate,
    event.audienceType,
    event.speakerName ? `Speaker: ${event.speakerName}` : '',
    event.notes,
    'Community Events Australia',
  ].filter(Boolean).join('\n');
  return Calendar.createEventInCalendarAsync({
    title: getEventTitle(event),
    startDate,
    endDate,
    location: address,
    notes,
    timeZone: event.prayerTimeZone || undefined,
  });
}
