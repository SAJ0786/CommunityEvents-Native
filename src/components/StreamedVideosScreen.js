import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../firebase/firebase';
import { colors, radius, shadow, spacing } from '../theme';

function formatDate(value) {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function StreamedVideosScreen({ isGuest = false, onBack }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await httpsCallable(functions, 'listStreamVideos')();
      setVideos(Array.isArray(result.data?.videos) ? result.data.videos : []);
    } catch (err) {
      console.error('[StreamedVideosScreen] Load failed:', err);
      setError('The streamed videos list could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const openWatchUrl = async watchUrl => {
    if (!watchUrl || isGuest) return;
    try {
      await Linking.openURL(watchUrl);
    } catch {
      setError('Could not open YouTube on this device.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Streamed Videos</Text>
          <Text style={styles.subtitle}>Community Events Australia live-stream archive</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={loadVideos} style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
            <Text style={styles.lightButtonText}>{loading ? 'Loading...' : 'Refresh'}</Text>
          </Pressable>
          <Pressable onPress={onBack} style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
            <Text style={styles.lightButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>

      {isGuest ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>Sign in to open streamed videos on YouTube.</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadVideos} style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
            <Text style={styles.lightButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.stateText}>Loading streamed videos...</Text>
        </View>
      ) : null}

      {!loading && !error && videos.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.emptyTitle}>No streamed videos yet</Text>
          <Text style={styles.stateText}>Completed app streams will appear here.</Text>
        </View>
      ) : null}

      {!loading && !error && videos.map(video => {
        const isLive = video.status === 'live' || video.status === 'active';
        const isScheduled = video.status === 'scheduled';
        const statusLabel = isLive ? 'LIVE' : isScheduled ? 'Scheduled' : 'Completed';
        const title = video.eventTitle || 'Community Event Stream';
        return (
          <View key={video.id} style={styles.videoCard}>
            {!isGuest && video.videoId ? (
              <Image
                accessibilityLabel={`${title} YouTube thumbnail`}
                source={{ uri: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg` }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.placeholderThumb}>
                <Text style={styles.placeholderIcon}>{'\u25B6'}</Text>
              </View>
            )}

            <View style={styles.videoBody}>
              <View style={styles.videoTopRow}>
                <Text style={styles.videoTitle}>{title}</Text>
                <View style={[styles.statusPill, isLive ? styles.livePill : isScheduled ? styles.scheduledPill : styles.completedPill]}>
                  <Text style={[styles.statusPillText, isLive ? styles.livePillText : isScheduled ? styles.scheduledPillText : styles.completedPillText]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
              {video.hostName ? <Text style={styles.videoHost}>{video.hostName}</Text> : null}
              <Text style={styles.videoMeta}>
                {[formatDate(video.eventDate || video.scheduledStartAt || video.startedAt), video.privacyStatus === 'unlisted' ? 'Private' : 'Public']
                  .filter(Boolean)
                  .join(' • ')}
              </Text>
            </View>

            {video.watchUrl && !isGuest ? (
              <Pressable onPress={() => openWatchUrl(video.watchUrl)} style={({ pressed }) => [styles.watchButton, pressed && styles.pressed]}>
                <Text style={styles.watchButtonText}>Watch on YouTube</Text>
              </Pressable>
            ) : (
              <View style={styles.disabledButton}>
                <Text style={styles.disabledButtonText}>Sign in to watch</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, justifyContent: 'space-between' },
  headerCopy: { flex: 1 },
  headerActions: { gap: spacing.sm },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  lightButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  lightButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  noticeCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#99d5ce',
    borderRadius: radius.md,
    backgroundColor: '#effcf9',
  },
  noticeText: { color: '#115e59', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  errorCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: radius.md,
    backgroundColor: '#fef2f2',
    gap: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  emptyTitle: { color: colors.navy, fontSize: 20, fontWeight: '900' },
  stateText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm, textAlign: 'center' },
  videoCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.md,
    ...shadow,
  },
  thumbnail: {
    width: '100%',
    minHeight: 180,
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: '#e5e7eb',
  },
  placeholderThumb: {
    minHeight: 180,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f4',
  },
  placeholderIcon: { color: colors.muted, fontSize: 34, fontWeight: '900' },
  videoBody: { gap: 6 },
  videoTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  videoTitle: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  livePill: { backgroundColor: '#fee2e2' },
  scheduledPill: { backgroundColor: '#fef3c7' },
  completedPill: { backgroundColor: '#f1f5f9' },
  statusPillText: { fontSize: 11, fontWeight: '900' },
  livePillText: { color: '#991b1b' },
  scheduledPillText: { color: '#92400e' },
  completedPillText: { color: '#475569' },
  videoHost: { color: colors.text, fontSize: 13, fontWeight: '700' },
  videoMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  watchButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: '#ff0000',
  },
  watchButtonText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  disabledButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: '#e5e7eb',
  },
  disabledButtonText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
