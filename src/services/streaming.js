import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';
import { getEventTitle } from './events';

function streamIdentity(event) {
  if (!event?.id) throw new Error('Event not found.');
  return { eventId: event.id, ...(event.registrationOnly ? { eventCollection: 'registrationEvents' } : {}) };
}

export async function startNativeEventStream(event, privacyStatus = 'public') {
  const identity = streamIdentity(event);
  const fnName = event.isLive && event.liveUrl ? 'nativeStreamResume' : 'nativeStreamStart';
  const payload = fnName === 'nativeStreamResume'
    ? { eventId: event.id, sessionId: event.liveUrl, directNative: true }
    : {
        useOAuth: true,
        eventId: event.id,
        eventTitle: getEventTitle(event),
        qualityProfile: '720p',
        audioMode: 'natural',
        privacyStatus,
        protocolVersion: 2,
        directNative: true,
      };
  const result = await httpsCallable(functions, fnName)({ ...payload, ...identity });
  if (!result.data?.rtmpUrl || !result.data?.sessionId) {
    throw new Error('YouTube did not return a usable stream destination.');
  }
  return result.data;
}

export async function startExternalEventStream(event, youtubeUrl, privacyStatus = 'public') {
  const identity = streamIdentity(event);
  const result = await httpsCallable(functions, 'startExternalYouTubeStream')({
    ...identity,
    youtubeUrl: String(youtubeUrl || '').trim(),
    privacyStatus,
  });
  return result.data || {};
}

export async function endEventStream(event, sessionId = '') {
  const identity = streamIdentity(event);
  const functionName = event.liveSource === 'external-youtube'
    ? 'endExternalYouTubeStream'
    : 'nativeStreamEndEvent';
  const result = await httpsCallable(functions, functionName)({
    ...identity,
    ...(functionName === 'nativeStreamEndEvent' ? { sessionId: sessionId || event.liveUrl || '' } : {}),
  });
  return result.data || {};
}

export function notifyEventLive(event) {
  streamIdentity(event);
  if (event.registrationOnly) throw new Error('Registration stream notifications are not enabled.');
  return httpsCallable(functions, 'notifyEventLive')({
    eventId: event.id,
    eventTitle: event.eventTypeDisplay || event.eventType || 'Event',
    hostName: event.hostName || '',
  });
}

export async function getManagedEventStream(event) {
  const result = await httpsCallable(functions, 'getEventStream')(streamIdentity(event));
  if (!/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]+$/.test(result.data?.watchUrl || '')) {
    throw new Error('The event stream link could not be retrieved. Reopen the host controls to retry.');
  }
  return result.data;
}

export function sendPrivateStreamLink(sessionId) {
  return httpsCallable(functions, 'sendPrivateStreamLinkEmail')({ sessionId });
}

export function splitRtmpDestination(rtmpUrl) {
  const value = String(rtmpUrl || '').trim().replace(/\/+$/, '');
  const separator = value.lastIndexOf('/');
  if (separator <= value.indexOf('://') + 2 || separator === value.length - 1) {
    throw new Error('The streaming destination returned by YouTube is invalid.');
  }
  return {
    url: value.slice(0, separator),
    streamKey: value.slice(separator + 1),
  };
}
