import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { colors, radius, shadow, spacing } from '../theme';

const azaanRecording = require('../../assets/sounds/azan_mashad.mp3');

function isAzaanNotification(response) {
  return response?.notification?.request?.content?.data?.kind === 'azaan-alarm';
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function AzaanPlaybackController({ onOpenHijriCalendar }) {
  const player = useAudioPlayer(azaanRecording, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
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
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'duckOthers',
      });
      await player.seekTo(0);
      player.play();
    } catch {
      setVisible(false);
    }
  }, [onOpenHijriCalendar, player]);

  const stopPlayback = useCallback(async () => {
    try {
      player.pause();
      await player.seekTo(0);
    } catch {}
    setVisible(false);
  }, [player]);

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
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 88,
    zIndex: 50,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: '#6ac3ba',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#5b3fb5' },
  iconText: { color: '#ffd66b', fontSize: 23, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  time: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  stop: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, borderRadius: 20, backgroundColor: '#dc2626' },
  stopIcon: { width: 11, height: 11, borderRadius: 2, backgroundColor: colors.surface },
  stopText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.76 },
});
