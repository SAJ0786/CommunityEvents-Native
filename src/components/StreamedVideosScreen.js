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
import { colors, radius, shadow, spacing, typography } from '../theme';
import NativeBackButton from './NativeBackButton';
import MemberPageHeader from './MemberPageHeader';

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
      <MemberPageHeader panel title="Streamed Videos" subtitle="Community Events Australia live-stream archive" icon="play-circle-outline" tone="indigo" onBack={onBack} />

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
  title: { color: colors.navy, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: typography.cardTitle.fontSize, lineHeight: 20, marginTop: 4 },
  lightButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  lightButtonText: { color: colors.tealDark, fontSize: typography.body.fontSize, fontWeight: '700' },
  noticeCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  noticeText: { color: colors.tealDark, fontSize: typography.body.fontSize, lineHeight: 19, fontWeight: '700' },
  errorCard: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    gap: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: typography.body.fontSize, lineHeight: 19, fontWeight: '600' },
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
  emptyTitle: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  stateText: { color: colors.muted, fontSize: typography.cardTitle.fontSize, lineHeight: 20, marginTop: spacing.sm, textAlign: 'center' },
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
    backgroundColor: colors.successSoft,
  },
  placeholderThumb: {
    minHeight: 180,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  placeholderIcon: { color: colors.muted, fontSize: 34, fontWeight: '700' },
  videoBody: { gap: 6 },
  videoTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  videoTitle: { flex: 1, color: colors.text, fontSize: typography.sectionTitle.fontSize, lineHeight: 22, fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  livePill: { backgroundColor: colors.roseSoft },
  scheduledPill: { backgroundColor: colors.amberSoft },
  completedPill: { backgroundColor: colors.background },
  statusPillText: { fontSize: typography.label.fontSize, fontWeight: '700' },
  livePillText: { color: colors.danger },
  scheduledPillText: { color: colors.warningText },
  completedPillText: { color: colors.neutralStrong },
  videoHost: { color: colors.text, fontSize: typography.body.fontSize, fontWeight: '700' },
  videoMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  watchButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  watchButtonText: { color: colors.surface, fontSize: typography.cardTitle.fontSize, fontWeight: '700' },
  disabledButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  disabledButtonText: { color: colors.muted, fontSize: typography.cardTitle.fontSize, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
