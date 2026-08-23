import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { colors, radius, shadow, spacing } from '../theme';
import { getEventTitle } from '../services/events';
import {
  endEventStream,
  notifyEventLive,
  sendPrivateStreamLink,
  splitRtmpDestination,
  startExternalEventStream,
  startNativeEventStream,
} from '../services/streaming';

const STREAM_KEEP_AWAKE_TAG = 'community-connect-live-stream';

function Choice({ active, icon, title, text, onPress, disabled = false }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, active && styles.choiceActive, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.choiceIcon}>{icon}</Text>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceText}>{text}</Text>
      </View>
    </Pressable>
  );
}

export default function NativeLiveStreamModal({ event, visible, onClose, onStreamChanged }) {
  const liveRef = useRef(null);
  const [step, setStep] = useState('method');
  const [privacyStatus, setPrivacyStatus] = useState('public');
  const [streamOrientation, setStreamOrientation] = useState('portrait');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [camera, setCamera] = useState('back');
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [watchUrl, setWatchUrl] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const hasActiveNativeSession = Boolean(sessionId && (streaming || interrupted || (event?.isLive && event?.liveSource === 'native')));

  useEffect(() => {
    if (!visible || !event) return;
    const existingExternal = event.isLive && event.liveSource === 'external-youtube';
    setStep(existingExternal ? 'external-live' : 'method');
    setPrivacyStatus(event.liveAppVisibility === 'private' ? 'unlisted' : 'public');
    setStreamOrientation('portrait');
    setYoutubeUrl('');
    setStreaming(false);
    setConnected(false);
    setSessionId(event.liveUrl || '');
    setWatchUrl(event.liveWatchUrl || '');
    setMinimized(false);
    setInterrupted(false);
    setStatus(event.isLive ? 'This event is currently live.' : '');
    setError('');
  }, [event?.id, visible]);

  useEffect(() => {
    if (visible) return undefined;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!visible || !streaming) return undefined;
    activateKeepAwakeAsync(STREAM_KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(STREAM_KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [streaming, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active' && streaming) {
        setStreaming(false);
        setConnected(false);
        setInterrupted(true);
        setStatus('Camera capture paused. The same YouTube live session is being held until you return and resume it.');
      }
    });
    return () => subscription.remove();
  }, [streaming, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (minimized) return false;
      if (streaming) {
        setMinimized(true);
        return true;
      }
      closeSafely();
      return true;
    });
    return () => subscription.remove();
  }, [minimized, streaming, visible]);

  if (!event) return null;

  const restorePortraitOrientation = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  const openPhoneCamera = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const orientationLock = streamOrientation === 'landscape'
        ? ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP;
      await ScreenOrientation.lockAsync(orientationLock);
      // Mount the camera after the requested rotation has settled so the
      // preview, encoder and camera sensor all start in the same orientation.
      await new Promise(resolve => setTimeout(resolve, 350));
      setStep('phone');
    } catch {
      setError('The selected camera orientation could not be locked. Please try again.');
      restorePortraitOrientation().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const leavePhoneCamera = async () => {
    await restorePortraitOrientation().catch(() => {});
    setStep('method');
  };

  const closeSafely = async () => {
    if (hasActiveNativeSession) {
      Alert.alert(
        streaming ? 'Stream is live' : 'Live session is being held',
        streaming
          ? 'Minimise the camera to use other parts of the app, or keep the streaming screen open.'
          : 'Return to the camera to resume the same YouTube stream, or end it explicitly.',
        [
          { text: 'Keep Open', style: 'cancel' },
          { text: streaming ? 'Minimise' : 'Return to Stream', onPress: () => setMinimized(false) },
        ]
      );
      return;
    }
    await restorePortraitOrientation().catch(() => {});
    onClose?.();
  };

  const startPhoneStream = async () => {
    if (busy || streaming) return;
    setBusy(true);
    setError('');
    const resumeExistingSession = Boolean(sessionId && (event.isLive || interrupted));
    const streamRequestEvent = resumeExistingSession
      ? { ...event, isLive: true, liveUrl: sessionId, liveSource: 'native' }
      : event;
    setStatus(resumeExistingSession ? 'Reconnecting to the existing YouTube stream…' : 'Creating the YouTube stream…');
    let createdSessionId = sessionId || event.liveUrl || '';
    try {
      const result = await startNativeEventStream(streamRequestEvent, privacyStatus);
      createdSessionId = result.sessionId;
      setSessionId(result.sessionId);
      setWatchUrl(result.watchUrl || '');
      setStatus('Connecting this phone’s camera to YouTube…');
      const destination = splitRtmpDestination(result.rtmpUrl);
      const started = await liveRef.current?.startStreaming(destination.streamKey, destination.url);
      if (!started) throw new Error('The phone camera could not start the YouTube stream.');
      setStreaming(true);
      setInterrupted(false);
      setStatus('LIVE — your camera is streaming to YouTube.');
      if (!resumeExistingSession) {
        notifyEventLive(event).catch(() => {});
        if (privacyStatus === 'unlisted') sendPrivateStreamLink(result.sessionId).catch(() => {});
      }
      onStreamChanged?.({
        ...event,
        isLive: true,
        liveUrl: result.sessionId,
        liveWatchUrl: privacyStatus === 'public' ? result.watchUrl || null : null,
        liveSource: 'native',
        liveAppVisibility: privacyStatus === 'unlisted' ? 'private' : 'public',
      });
    } catch (streamError) {
      liveRef.current?.stopStreaming?.();
      if (createdSessionId && !resumeExistingSession && !event.isLive) {
        endEventStream({ ...event, liveSource: 'native' }, createdSessionId).catch(() => {});
      }
      setError(streamError?.message || String(streamError) || 'The stream could not be started.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const startExternalStream = async () => {
    if (!youtubeUrl.trim() || busy) return;
    setBusy(true);
    setError('');
    setStatus('Checking the YouTube live video…');
    try {
      const result = await startExternalEventStream(event, youtubeUrl, privacyStatus);
      setWatchUrl(result.watchUrl || '');
      setStep('external-live');
      setStatus('LIVE — the YouTube stream is connected to this event.');
      notifyEventLive(event).catch(() => {});
      onStreamChanged?.({
        ...event,
        isLive: true,
        liveUrl: null,
        liveWatchUrl: privacyStatus === 'public' ? result.watchUrl || null : null,
        liveSource: 'external-youtube',
        liveAppVisibility: privacyStatus === 'unlisted' ? 'private' : 'public',
      });
    } catch (streamError) {
      setError(streamError?.message || 'YouTube could not verify this live video.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const confirmEndStream = () => {
    Alert.alert(
      'End live stream?',
      'This ends the live event and closes its YouTube broadcast.',
      [
        { text: 'Keep Streaming', style: 'cancel' },
        { text: 'End Stream', style: 'destructive', onPress: finishStream },
      ]
    );
  };

  const finishStream = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('Ending the stream safely…');
    try {
      liveRef.current?.stopStreaming?.();
      const sourceEvent = step === 'external-live'
        ? { ...event, liveSource: 'external-youtube' }
        : { ...event, liveSource: 'native' };
      await endEventStream(sourceEvent, sessionId);
      setStreaming(false);
      setInterrupted(false);
      setConnected(false);
      setStatus('Stream ended.');
      onStreamChanged?.({
        ...event,
        isLive: false,
        liveUrl: null,
        liveWatchUrl: null,
        liveSource: null,
        liveAppVisibility: null,
      });
      await restorePortraitOrientation().catch(() => {});
      onClose?.();
    } catch (streamError) {
      setError(streamError?.message || 'The stream could not be ended.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  const openWatchUrl = async () => {
    const url = watchUrl || event.liveWatchUrl;
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      setError('YouTube could not be opened on this device.');
    }
  };

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlayLayer}>
      <SafeAreaView style={[styles.root, minimized && styles.minimizedRoot]}>
        <View style={[styles.header, minimized && styles.hidden]}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{event.isLive || streaming || step === 'external-live' ? 'LIVE EVENT' : 'EVENT STREAMING'}</Text>
            <Text numberOfLines={2} style={styles.title}>{getEventTitle(event)}</Text>
          </View>
          {streaming ? (
            <Pressable accessibilityLabel="Minimise streaming" onPress={() => setMinimized(true)} style={({ pressed }) => [styles.minimizeButton, pressed && styles.pressed]}>
              <Text style={styles.minimizeText}>−</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityLabel="Close streaming" onPress={closeSafely} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        {step === 'phone' ? (
          <View style={styles.cameraStage}>
            <ApiVideoLiveStreamView
              ref={liveRef}
              style={styles.camera}
              camera={camera}
              enablePinchedZoom
              isMuted={muted}
              video={{ fps: 30, resolution: '720p', bitrate: 2000000, gopDuration: 1 }}
              audio={{ bitrate: 128000, sampleRate: 44100, isStereo: true }}
              onConnectionSuccess={() => {
                setConnected(true);
                setInterrupted(false);
                setStatus('LIVE — YouTube is receiving the stream.');
              }}
              onConnectionFailed={code => {
                setConnected(false);
                setStreaming(false);
                setInterrupted(true);
                setError(`The live connection failed (${code || 'unknown error'}).`);
              }}
              onDisconnect={() => {
                setConnected(false);
                if (streaming) {
                  setStreaming(false);
                  setInterrupted(true);
                  setStatus('The camera connection was interrupted. Return to the stream screen and tap Resume Stream.');
                }
              }}
              onPermissionsDenied={() => setError('Camera and microphone access are required to stream from this phone.')}
            />
            <View style={[styles.liveBadge, minimized && styles.miniLiveBadge]}>
              <View style={[styles.liveDot, connected && styles.liveDotConnected]} />
              <Text style={styles.liveBadgeText}>{streaming ? (connected ? 'LIVE' : 'CONNECTING') : 'PREVIEW'}</Text>
            </View>
            <View style={[styles.orientationBadge, minimized && styles.hidden]}>
              <Text style={styles.orientationBadgeText}>{streamOrientation.toUpperCase()} LOCKED</Text>
            </View>
            <View style={[styles.cameraControls, minimized && styles.hidden]}>
              <Pressable onPress={() => setCamera(value => value === 'back' ? 'front' : 'back')} style={styles.cameraControl}>
                <Text style={styles.cameraControlIcon}>↺</Text>
                <Text style={styles.cameraControlText}>Camera</Text>
              </Pressable>
              <Pressable onPress={() => setMuted(value => !value)} style={styles.cameraControl}>
                <Text style={styles.cameraControlIcon}>{muted ? '🔇' : '🎙️'}</Text>
                <Text style={styles.cameraControlText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </Pressable>
            </View>
            {minimized ? (
              <Pressable accessibilityLabel="Return to live stream" onPress={() => setMinimized(false)} style={styles.returnToStreamOverlay}>
                <Text style={styles.returnToStreamIcon}>●</Text>
                <View style={styles.returnToStreamCopy}>
                  <Text style={styles.returnToStreamTitle}>{interrupted ? 'STREAM INTERRUPTED' : 'LIVE STREAM'}</Text>
                  <Text style={styles.returnToStreamText}>Tap to return</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <ScrollView style={minimized && styles.hidden} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === 'method' ? (
              <>
                <Text style={styles.sectionTitle}>How do you want to stream?</Text>
                <Text style={styles.sectionText}>Use this phone’s camera or connect an existing YouTube Live video from another device.</Text>
                <View style={styles.visibilityRow}>
                  <Choice active={privacyStatus === 'public'} icon="🌏" title="Public" text="Visible in the app and on YouTube" onPress={() => setPrivacyStatus('public')} />
                  <Choice active={privacyStatus === 'unlisted'} icon="🔒" title="Private" text="Only people with the link can watch" onPress={() => setPrivacyStatus('unlisted')} />
                </View>
                <Text style={styles.inputLabel}>CAMERA ORIENTATION</Text>
                <Text style={styles.orientationHelp}>Choose before opening the camera. The app keeps this orientation locked for the complete YouTube stream.</Text>
                <View style={styles.orientationRow}>
                  <Pressable
                    onPress={() => setStreamOrientation('portrait')}
                    style={({ pressed }) => [styles.orientationChoice, streamOrientation === 'portrait' && styles.orientationChoiceActive, pressed && styles.pressed]}
                  >
                    <Text style={styles.orientationIcon}>{'\u25AF'}</Text>
                    <Text style={[styles.orientationText, streamOrientation === 'portrait' && styles.orientationTextActive]}>Portrait</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStreamOrientation('landscape')}
                    style={({ pressed }) => [styles.orientationChoice, streamOrientation === 'landscape' && styles.orientationChoiceActive, pressed && styles.pressed]}
                  >
                    <Text style={styles.orientationIcon}>{'\u25AD'}</Text>
                    <Text style={[styles.orientationText, streamOrientation === 'landscape' && styles.orientationTextActive]}>Landscape</Text>
                  </Pressable>
                </View>
                <Choice
                  disabled={busy}
                  icon="📹"
                  title={busy ? 'Locking camera orientation…' : 'Stream from this phone'}
                  text="Use the phone camera and microphone to go live on YouTube."
                  onPress={openPhoneCamera}
                />
                <Choice icon="🔗" title="Use another device" text="Paste an existing YouTube Live link and connect it to this event." onPress={() => setStep('external')} />
              </>
            ) : null}

            {step === 'external' ? (
              <>
                <Text style={styles.sectionTitle}>Connect YouTube Live</Text>
                <Text style={styles.sectionText}>Start the broadcast on the other device, then paste its YouTube video URL here.</Text>
                <Text style={styles.inputLabel}>YOUTUBE LIVE VIDEO URL</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onChangeText={value => { setYoutubeUrl(value); setError(''); }}
                  placeholder="https://www.youtube.com/watch?v=…"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={youtubeUrl}
                />
                <Pressable disabled={!youtubeUrl.trim() || busy} onPress={startExternalStream} style={({ pressed }) => [styles.primaryButton, (!youtubeUrl.trim() || busy) && styles.disabled, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>{busy ? 'Checking YouTube…' : 'Mark Event Live'}</Text>
                </Pressable>
                <Pressable disabled={busy} onPress={() => setStep('method')} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
              </>
            ) : null}

            {step === 'external-live' ? (
              <View style={styles.liveCard}>
                <Text style={styles.liveCardIcon}>🔴</Text>
                <Text style={styles.liveCardTitle}>This event is live</Text>
                <Text style={styles.liveCardText}>The broadcast is running on YouTube from another device.</Text>
                {(watchUrl || event.liveWatchUrl) ? (
                  <Pressable onPress={openWatchUrl} style={styles.youtubeButton}>
                    <Text style={styles.youtubeButtonText}>▶ Watch on YouTube</Text>
                  </Pressable>
                ) : null}
                <Pressable disabled={busy} onPress={confirmEndStream} style={[styles.dangerButton, busy && styles.disabled]}>
                  <Text style={styles.dangerButtonText}>{busy ? 'Ending…' : 'End Live Stream'}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        )}

        {step === 'phone' ? (
          <View style={[styles.phoneFooter, minimized && styles.hidden]}>
            {status ? <Text style={styles.statusText}>{status}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!streaming ? (
              <Pressable disabled={busy} onPress={startPhoneStream} style={({ pressed }) => [styles.goLiveButton, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.goLiveButtonText}>{busy ? 'Preparing YouTube…' : hasActiveNativeSession ? 'Resume Same Stream' : '🔴 Start Streaming'}</Text>
              </Pressable>
            ) : (
              <Pressable disabled={busy} onPress={confirmEndStream} style={[styles.dangerButton, busy && styles.disabled]}>
                <Text style={styles.dangerButtonText}>{busy ? 'Ending…' : 'End Live Stream'}</Text>
              </Pressable>
            )}
            {!streaming && hasActiveNativeSession ? (
              <Pressable disabled={busy} onPress={confirmEndStream} style={[styles.dangerButton, busy && styles.disabled]}>
                <Text style={styles.dangerButtonText}>{busy ? 'Ending…' : 'End Live Stream'}</Text>
              </Pressable>
            ) : null}
            {!streaming && !busy && !hasActiveNativeSession ? (
              <Pressable onPress={leavePhoneCamera} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {step !== 'phone' && (status || error) ? (
          <View style={[styles.messageBar, minimized && styles.hidden]}>
            {status ? <Text style={styles.statusText}>{status}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
  root: { flex: 1, backgroundColor: colors.background },
  minimizedRoot: { position: 'absolute', right: 14, bottom: 92, width: 204, height: 126, flex: 0, overflow: 'hidden', borderWidth: 2, borderColor: '#ef4444', borderRadius: radius.lg, backgroundColor: '#050b12', ...shadow },
  hidden: { display: 'none' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.danger, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.navy, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 2 },
  minimizeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#fee2e2' },
  minimizeText: { color: '#b91c1c', fontSize: 28, lineHeight: 30, fontWeight: '900' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.tealSoft },
  closeText: { color: colors.tealDark, fontSize: 29, lineHeight: 31, fontWeight: '800' },
  content: { padding: spacing.lg, paddingBottom: 56, gap: spacing.md },
  sectionTitle: { color: colors.navy, fontSize: 25, lineHeight: 31, fontWeight: '900' },
  sectionText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  visibilityRow: { gap: spacing.sm, marginBottom: spacing.sm },
  choice: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  choiceActive: { borderWidth: 2, borderColor: colors.teal, backgroundColor: '#edf9f7' },
  choiceIcon: { width: 34, fontSize: 27, textAlign: 'center' },
  choiceCopy: { flex: 1 },
  choiceTitle: { color: colors.navy, fontSize: 16, fontWeight: '900' },
  choiceText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  inputLabel: { color: colors.navy, fontSize: 12, fontWeight: '900', marginTop: spacing.md },
  orientationHelp: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: -6 },
  orientationRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  orientationChoice: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  orientationChoiceActive: { borderWidth: 2, borderColor: colors.teal, backgroundColor: colors.tealSoft },
  orientationIcon: { color: colors.tealDark, fontSize: 25, fontWeight: '900' },
  orientationText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  orientationTextActive: { color: colors.tealDark },
  input: { minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surface, fontSize: 14 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.teal },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealSoft },
  secondaryButtonText: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  cameraStage: { flex: 1, backgroundColor: '#050b12' },
  camera: { flex: 1, alignSelf: 'stretch', backgroundColor: '#050b12' },
  liveBadge: { position: 'absolute', top: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(5,11,18,0.72)' },
  miniLiveBadge: { top: 7, left: 7, paddingHorizontal: 7, paddingVertical: 4 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#94a3b8' },
  liveDotConnected: { backgroundColor: '#ef4444' },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  orientationBadge: { position: 'absolute', top: spacing.md, right: spacing.md, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(5,11,18,0.72)' },
  orientationBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  cameraControls: { position: 'absolute', right: spacing.md, bottom: spacing.md, gap: spacing.sm },
  cameraControl: { width: 66, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: 'rgba(5,11,18,0.7)' },
  cameraControlIcon: { color: '#fff', fontSize: 21 },
  cameraControlText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 3 },
  returnToStreamOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'flex-end', gap: 7, padding: 9, paddingTop: 36, backgroundColor: 'rgba(5,11,18,0.24)' },
  returnToStreamIcon: { color: '#ef4444', fontSize: 16, lineHeight: 18 },
  returnToStreamCopy: { flex: 1 },
  returnToStreamTitle: { color: '#ffffff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  returnToStreamText: { color: '#dbeafe', fontSize: 10, fontWeight: '700', marginTop: 1 },
  phoneFooter: { padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  goLiveButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: '#dc2626' },
  goLiveButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  dangerButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fee2e2' },
  dangerButtonText: { color: '#b91c1c', fontSize: 15, fontWeight: '900' },
  liveCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: '#fecaca', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  liveCardIcon: { fontSize: 42 },
  liveCardTitle: { color: colors.navy, fontSize: 23, fontWeight: '900', marginTop: spacing.sm },
  liveCardText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  youtubeButton: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#ff0000', marginBottom: spacing.sm },
  youtubeButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  messageBar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  statusText: { color: colors.tealDark, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.8 },
});
