import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';
import { getEventTitle } from './events';

function requireSupportedStreamEvent(event) {
  if (!event?.id) throw new Error('Event not found.');
  if (event.registrationOnly) throw new Error('Streaming is not available for registration events until viewing privacy and backend support are configured.');
}

export async function startNativeEventStream(event, privacyStatus = 'public') {
  requireSupportedStreamEvent(event);
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
  const result = await httpsCallable(functions, fnName)(payload);
  if (!result.data?.rtmpUrl || !result.data?.sessionId) {
    throw new Error('YouTube did not return a usable stream destination.');
  }
  return result.data;
}

export async function startExternalEventStream(event, youtubeUrl, privacyStatus = 'public') {
  requireSupportedStreamEvent(event);
  const result = await httpsCallable(functions, 'startExternalYouTubeStream')({
    eventId: event.id,
    youtubeUrl: String(youtubeUrl || '').trim(),
    privacyStatus,
  });
  return result.data || {};
}

export async function endEventStream(event, sessionId = '') {
  requireSupportedStreamEvent(event);
  const functionName = event.liveSource === 'external-youtube'
    ? 'endExternalYouTubeStream'
    : 'nativeStreamEndEvent';
  const result = await httpsCallable(functions, functionName)({
    eventId: event.id,
    ...(functionName === 'nativeStreamEndEvent' ? { sessionId: sessionId || event.liveUrl || '' } : {}),
  });
  return result.data || {};
}

export function notifyEventLive(event) {
  requireSupportedStreamEvent(event);
  return httpsCallable(functions, 'notifyEventLive')({
    eventId: event.id,
    eventTitle: event.eventTypeDisplay || event.eventType || 'Event',
    hostName: event.hostName || '',
  });
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
