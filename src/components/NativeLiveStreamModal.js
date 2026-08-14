import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiVideoLiveStreamView } from '@api.video/react-native-livestream';
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
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [camera, setCamera] = useState('back');
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [watchUrl, setWatchUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !event) return;
    const existingExternal = event.isLive && event.liveSource === 'external-youtube';
    setStep(existingExternal ? 'external-live' : event.isLive && event.liveUrl ? 'phone' : 'method');
    setPrivacyStatus(event.liveAppVisibility === 'private' ? 'unlisted' : 'public');
    setYoutubeUrl('');
    setStreaming(false);
    setConnected(false);
    setSessionId(event.liveUrl || '');
    setWatchUrl(event.liveWatchUrl || '');
    setStatus(event.isLive ? 'This event is currently live.' : '');
    setError('');
  }, [event?.id, visible]);

  if (!event) return null;

  const closeSafely = () => {
    if (streaming) {
      Alert.alert('Stream is live', 'End the stream before closing the camera screen so the broadcast is closed safely.');
      return;
    }
    onClose?.();
  };

  const startPhoneStream = async () => {
    if (busy || streaming) return;
    setBusy(true);
    setError('');
    setStatus(event.isLive ? 'Resuming the YouTube stream…' : 'Creating the YouTube stream…');
    let createdSessionId = event.liveUrl || '';
    try {
      const result = await startNativeEventStream(event, privacyStatus);
      createdSessionId = result.sessionId;
      setSessionId(result.sessionId);
      setWatchUrl(result.watchUrl || '');
      setStatus('Connecting this phone’s camera to YouTube…');
      const destination = splitRtmpDestination(result.rtmpUrl);
      const started = await liveRef.current?.startStreaming(destination.streamKey, destination.url);
      if (!started) throw new Error('The phone camera could not start the YouTube stream.');
      setStreaming(true);
      setStatus('LIVE — your camera is streaming to YouTube.');
      notifyEventLive(event).catch(() => {});
      if (privacyStatus === 'unlisted') sendPrivateStreamLink(result.sessionId).catch(() => {});
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
      if (createdSessionId && !event.isLive) {
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closeSafely}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{event.isLive || streaming || step === 'external-live' ? 'LIVE EVENT' : 'EVENT STREAMING'}</Text>
            <Text numberOfLines={2} style={styles.title}>{getEventTitle(event)}</Text>
          </View>
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
                setStatus('LIVE — YouTube is receiving the stream.');
              }}
              onConnectionFailed={code => {
                setConnected(false);
                setError(`The live connection failed (${code || 'unknown error'}).`);
              }}
              onDisconnect={() => {
                setConnected(false);
                if (streaming) setStatus('The camera connection was interrupted. You can end or try resuming the stream.');
              }}
              onPermissionsDenied={() => setError('Camera and microphone access are required to stream from this phone.')}
            />
            <View style={styles.liveBadge}>
              <View style={[styles.liveDot, connected && styles.liveDotConnected]} />
              <Text style={styles.liveBadgeText}>{streaming ? (connected ? 'LIVE' : 'CONNECTING') : 'PREVIEW'}</Text>
            </View>
            <View style={styles.cameraControls}>
              <Pressable onPress={() => setCamera(value => value === 'back' ? 'front' : 'back')} style={styles.cameraControl}>
                <Text style={styles.cameraControlIcon}>↺</Text>
                <Text style={styles.cameraControlText}>Camera</Text>
              </Pressable>
              <Pressable onPress={() => setMuted(value => !value)} style={styles.cameraControl}>
                <Text style={styles.cameraControlIcon}>{muted ? '🔇' : '🎙️'}</Text>
                <Text style={styles.cameraControlText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === 'method' ? (
              <>
                <Text style={styles.sectionTitle}>How do you want to stream?</Text>
                <Text style={styles.sectionText}>Use this phone’s camera or connect an existing YouTube Live video from another device.</Text>
                <View style={styles.visibilityRow}>
                  <Choice active={privacyStatus === 'public'} icon="🌏" title="Public" text="Visible in the app and on YouTube" onPress={() => setPrivacyStatus('public')} />
                  <Choice active={privacyStatus === 'unlisted'} icon="🔒" title="Private" text="Only people with the link can watch" onPress={() => setPrivacyStatus('unlisted')} />
                </View>
                <Choice icon="📹" title="Stream from this phone" text="Use the phone camera and microphone to go live on YouTube." onPress={() => setStep('phone')} />
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
          <View style={styles.phoneFooter}>
            {status ? <Text style={styles.statusText}>{status}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!streaming ? (
              <Pressable disabled={busy} onPress={startPhoneStream} style={({ pressed }) => [styles.goLiveButton, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={styles.goLiveButtonText}>{busy ? 'Preparing YouTube…' : event.isLive ? 'Resume Stream' : '🔴 Start Streaming'}</Text>
              </Pressable>
            ) : (
              <Pressable disabled={busy} onPress={confirmEndStream} style={[styles.dangerButton, busy && styles.disabled]}>
                <Text style={styles.dangerButtonText}>{busy ? 'Ending…' : 'End Live Stream'}</Text>
              </Pressable>
            )}
            {!streaming && !busy ? (
              <Pressable onPress={() => setStep('method')} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {step !== 'phone' && (status || error) ? (
          <View style={styles.messageBar}>
            {status ? <Text style={styles.statusText}>{status}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.danger, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.navy, fontSize: 18, lineHeight: 23, fontWeight: '900', marginTop: 2 },
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
  input: { minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surface, fontSize: 14 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.teal },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealSoft },
  secondaryButtonText: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  cameraStage: { flex: 1, backgroundColor: '#050b12' },
  camera: { flex: 1, alignSelf: 'stretch', backgroundColor: '#050b12' },
  liveBadge: { position: 'absolute', top: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(5,11,18,0.72)' },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#94a3b8' },
  liveDotConnected: { backgroundColor: '#ef4444' },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  cameraControls: { position: 'absolute', right: spacing.md, bottom: spacing.md, gap: spacing.sm },
  cameraControl: { width: 66, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: 'rgba(5,11,18,0.7)' },
  cameraControlIcon: { color: '#fff', fontSize: 21 },
  cameraControlText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 3 },
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
