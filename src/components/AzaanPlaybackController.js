import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { recordNonFatalError } from '../services/diagnostics';
import { getActiveAzaanRecording } from '../services/azaanRecording';

function isAzaanNotification(response) {
  return response?.notification?.request?.content?.data?.kind === 'azaan-alarm';
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function AzaanPlaybackController({ onOpenHijriCalendar, manualPlayRequest = 0 }) {
  // Native audio creation can fail on a device. It must never happen during
  // login/home rendering or take the entire application to its error boundary.
  const playerRef = useRef(null);
  const statusSubscription = useRef(null);
  const playerSourceKey = useRef('');
  const [status, setStatus] = useState({});
  const [visible, setVisible] = useState(false);
  const handledNotificationId = useRef('');

  const playRecording = useCallback(async ({ openCalendar = false, operation = 'play_azaan' } = {}) => {
    if (openCalendar) onOpenHijriCalendar?.();
    setVisible(true);
    try {
      const recording = await getActiveAzaanRecording();
      if (!playerRef.current || playerSourceKey.current !== recording.key) {
        try { statusSubscription.current?.remove(); } catch { /* already released */ }
        try { playerRef.current?.remove(); } catch { /* replace stale recording */ }
        playerRef.current = createAudioPlayer(recording.source, { updateInterval: 250 });
        statusSubscription.current = playerRef.current.addListener('playbackStatusUpdate', setStatus);
        playerSourceKey.current = recording.key;
      }
      const player = playerRef.current;
      await setAudioModeAsync({
        // Manual playback and a deliberate notification tap should be audible
        // even when the iPhone silent switch is on. Background notification
        // delivery still follows the operating system's alert-sound policy.
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers',
      });
      await player.seekTo(0);
      player.play();
      return true;
    } catch (error) {
      recordNonFatalError(error, { feature: 'notifications', operation });
      setVisible(false);
      if (operation === 'manual_azaan_player') {
        Alert.alert('Play Azan', 'The Azan recording could not be played. Check your media volume and try again.');
      }
      return false;
    }
  }, [onOpenHijriCalendar]);

  const playFromNotification = useCallback(async response => {
    if (!isAzaanNotification(response)) return;
    const identifier = response.notification.request.identifier || '';
    if (identifier && handledNotificationId.current === identifier) return;
    handledNotificationId.current = identifier;
    const played = await playRecording({ openCalendar: true, operation: 'open_azaan_player' });
    if (!played) handledNotificationId.current = '';
  }, [playRecording]);

  const stopPlayback = useCallback(async () => {
    try {
      playerRef.current?.pause();
      await playerRef.current?.seekTo(0);
    } catch {}
    setVisible(false);
  }, []);

  useEffect(() => () => {
    try { statusSubscription.current?.remove(); } catch { /* already released */ }
    try { playerRef.current?.remove(); } catch { /* native teardown must not crash navigation */ }
    statusSubscription.current = null;
    playerRef.current = null;
    playerSourceKey.current = '';
  }, []);

  useEffect(() => {
    let mounted = true;
    Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (mounted && response) {
          playFromNotification(response);
          Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
        }
      })
      .catch(() => {});

    const subscription = Notifications.addNotificationResponseReceivedListener(playFromNotification);
    // The notification system plays the bundled alert in foreground and
    // background. Only a deliberate tap opens the calendar and its player.
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [playFromNotification]);

  useEffect(() => {
    if (!manualPlayRequest) return;
    playRecording({ operation: 'manual_azaan_player' });
  }, [manualPlayRequest, playRecording]);

  useEffect(() => {
    if (status.didJustFinish) setVisible(false);
  }, [status.didJustFinish]);

  if (!visible) return null;

  const prayer = status.playing ? 'Azaan is playing' : 'Azaan paused';
  return (
    <View accessibilityLiveRegion="polite" style={styles.wrap}>
      <View style={styles.icon}><Text maxFontSizeMultiplier={1} style={styles.iconText}>{'\u263E'}</Text></View>
      <View style={styles.copy}>
        <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.title}>{prayer}</Text>
        <Text maxFontSizeMultiplier={1.1} style={styles.time}>
          {formatTime(status.currentTime)} / {formatTime(status.duration)}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop Azaan" onPress={stopPlayback} style={({ pressed }) => [styles.stop, pressed && styles.pressed]}>
        <View style={styles.stopIcon} />
        <Text maxFontSizeMultiplier={1.05} style={styles.stopText}>Stop</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginBottom: 24,
    zIndex: 50,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.purple },
  iconText: { color: colors.gold, fontSize: 23, fontWeight: '700' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.navy, fontSize: typography.cardTitle.fontSize, fontWeight: '700' },
  time: { color: colors.muted, fontSize: typography.label.fontSize, fontWeight: '700', marginTop: 2 },
  stop: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, borderRadius: 20, backgroundColor: colors.danger },
  stopIcon: { width: 11, height: 11, borderRadius: 2, backgroundColor: colors.surface },
  stopText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.76 },
});
