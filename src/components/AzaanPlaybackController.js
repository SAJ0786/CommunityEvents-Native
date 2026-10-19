import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { recordNonFatalError } from '../services/diagnostics';

const azaanRecording = require('../../assets/sounds/azan_mashad.mp3');

function isAzaanNotification(response) {
  return response?.notification?.request?.content?.data?.kind === 'azaan-alarm';
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function AzaanPlaybackController({ onOpenHijriCalendar }) {
  // Native audio creation can fail on a device. It must never happen during
  // login/home rendering or take the entire application to its error boundary.
  const playerRef = useRef(null);
  const statusSubscription = useRef(null);
  const [status, setStatus] = useState({});
  const [visible, setVisible] = useState(false);
  const handledNotificationId = useRef('');

  const playFromNotification = useCallback(async response => {
    if (!isAzaanNotification(response)) return;
    const identifier = response.notification.request.identifier || '';
    if (identifier && handledNotificationId.current === identifier) return;
    handledNotificationId.current = identifier;

    onOpenHijriCalendar?.();
    setVisible(true);
    try {
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer(azaanRecording, { updateInterval: 250 });
        statusSubscription.current = playerRef.current.addListener('playbackStatusUpdate', setStatus);
      }
      const player = playerRef.current;
      await setAudioModeAsync({
        playsInSilentMode: false,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers',
      });
      await player.seekTo(0);
      player.play();
    } catch (error) {
      recordNonFatalError(error, { feature: 'notifications', operation: 'open_azaan_player' });
      handledNotificationId.current = '';
      setVisible(false);
    }
  }, [onOpenHijriCalendar]);

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
