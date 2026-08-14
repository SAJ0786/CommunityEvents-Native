import React, { useEffect, useState } from 'react';
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
import { colors, radius, shadow, spacing } from '../theme';
import { getEventTitle } from '../services/events';
import {
  endEventStream,
  notifyEventLive,
  startExternalEventStream,
} from '../services/streaming';

function Choice({ active, icon, title, text, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.choice, active && styles.choiceActive, pressed && styles.pressed]}
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
  const [step, setStep] = useState('method');
  const [privacyStatus, setPrivacyStatus] = useState('public');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [watchUrl, setWatchUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !event) return;
    setStep(event.isLive ? 'external-live' : 'method');
    setPrivacyStatus(event.liveAppVisibility === 'private' ? 'unlisted' : 'public');
    setYoutubeUrl('');
    setWatchUrl(event.liveWatchUrl || '');
    setStatus(event.isLive ? 'This event is currently live.' : '');
    setError('');
  }, [event?.id, visible]);

  if (!event) return null;

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

  const finishStream = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('Ending the stream safely…');
    try {
      await endEventStream(event, event.liveUrl || '');
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

  const confirmEndStream = () => {
    Alert.alert('End live stream?', 'This removes the live broadcast from the event.', [
      { text: 'Keep Streaming', style: 'cancel' },
      { text: 'End Stream', style: 'destructive', onPress: finishStream },
    ]);
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
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{event.isLive || step === 'external-live' ? 'LIVE EVENT' : 'EVENT STREAMING'}</Text>
            <Text numberOfLines={2} style={styles.title}>{getEventTitle(event)}</Text>
          </View>
          <Pressable accessibilityLabel="Close streaming" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'method' ? (
            <>
              <Text style={styles.sectionTitle}>Stream this event</Text>
              <Text style={styles.sectionText}>Start your broadcast in YouTube, then connect its live-video link to this event.</Text>
              <View style={styles.visibilityRow}>
                <Choice active={privacyStatus === 'public'} icon="🌏" title="Public" text="Visible in the app and on YouTube" onPress={() => setPrivacyStatus('public')} />
                <Choice active={privacyStatus === 'unlisted'} icon="🔒" title="Private" text="Only people with the link can watch" onPress={() => setPrivacyStatus('unlisted')} />
              </View>
              <Pressable onPress={() => setStep('external')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>▶ Connect YouTube Live</Text>
              </Pressable>
              <Text style={styles.helperText}>Direct broadcasting from this phone’s camera will be added after its Android camera module completes compatibility testing.</Text>
            </>
          ) : null}

          {step === 'external' ? (
            <>
              <Text style={styles.sectionTitle}>Connect YouTube Live</Text>
              <Text style={styles.sectionText}>Start the broadcast in YouTube, then paste its live video URL here.</Text>
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
              <Text style={styles.liveCardText}>The event’s broadcast is connected through YouTube.</Text>
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

          {status ? <Text style={styles.statusText}>{status}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
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
  helperText: { color: colors.muted, fontSize: 12, lineHeight: 18, fontStyle: 'italic', textAlign: 'center' },
  dangerButton: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fee2e2' },
  dangerButtonText: { color: '#b91c1c', fontSize: 15, fontWeight: '900' },
  liveCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: '#fecaca', borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  liveCardIcon: { fontSize: 42 },
  liveCardTitle: { color: colors.navy, fontSize: 23, fontWeight: '900', marginTop: spacing.sm },
  liveCardText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  youtubeButton: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#ff0000', marginBottom: spacing.sm },
  youtubeButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  statusText: { color: colors.tealDark, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.8 },
});
