import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import { formatEventTime } from '../utils/formatters';
import { getEventPoster, getEventSuburb } from '../services/events';
import { getImmediatePosterSource, resolvePosterSource } from '../services/images';

const fallbackLogo = require('../../assets/logo.png');

function dateChip(dateValue) {
  try {
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    return {
      month: date.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase(),
      day: String(date.getDate()),
      weekday: date.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
    };
  } catch {
    return { month: '', day: '', weekday: '' };
  }
}

function organiserBadge(event) {
  if (event.organiserType === 'private' || event.organisationType === 'private') {
    return { label: 'Private', backgroundColor: '#f1f5f9', color: '#475569' };
  }
  const type = String(event.organisationType || event.organiserCategory || 'centre').toLowerCase() === 'org'
    ? 'org'
    : 'centre';
  return type === 'org'
    ? { label: 'Org', backgroundColor: '#e0f2fe', color: '#075985' }
    : { label: 'Centre', backgroundColor: '#fef9c3', color: '#854d0e' };
}

export default function EventCard({ event, onPress, onToggleSaved, isSaved, saving }) {
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const [poster, setPoster] = useState(getEventPoster(event) || getImmediatePosterSource(event));
  const [posterOpen, setPosterOpen] = useState(false);
  const chip = dateChip(event.eventDate);
  const displayType = event.eventTypeDisplay || event.customEventType || event.eventType || 'Event';
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const title = [displayType, host].filter(Boolean).join(' - ');
  const suburb = getEventSuburb(event);
  const audience = event.audienceType === 'Mixed Audience'
    ? 'Family Event'
    : event.audienceType || event.audience || 'All Welcome';
  const organiser = organiserBadge(event);
  const displayTime = `${event.prayerLabel ? `${event.prayerLabel} ` : ''}${formatEventTime(event.startTime, event.endTime)}`.trim();
  const hasUploadedPoster = Boolean(event.imageUrl || event.posterUrl || event.poster || event.image || event.flyerUrl || event.flyer || event.imagePath || event.posterPath);

  useEffect(() => {
    let alive = true;
    const immediate = getEventPoster(event) || getImmediatePosterSource(event);
    setPoster(immediate || '');
    resolvePosterSource(event)
      .then(value => {
        if (alive && value) setPoster(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [event]);

  return (
    <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Pressable
        disabled={!hasUploadedPoster || !poster}
        onPress={pressEvent => {
          pressEvent.stopPropagation?.();
          setPosterOpen(true);
        }}
        style={[styles.posterFrame, compact && styles.posterFrameCompact]}
      >
        <Image
          source={poster ? { uri: poster } : fallbackLogo}
          style={styles.poster}
          resizeMode={poster ? 'cover' : 'contain'}
        />
        {chip.day ? (
          <View style={styles.dateChip}>
            <Text style={styles.dateMonth}>{chip.month}</Text>
            <Text style={styles.dateDay}>{chip.day}</Text>
            <Text style={styles.dateWeekday}>{chip.weekday}</Text>
          </View>
        ) : null}
        {event.isLive ? <Text style={styles.liveBadge}>LIVE</Text> : null}
        {hasUploadedPoster && poster ? <Text style={styles.zoomHint}>{'\u2315'}</Text> : null}
      </Pressable>

      <View style={styles.content}>
        <View style={styles.titlePanel}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>{title.toUpperCase()}</Text>
        </View>
        <Text style={[styles.meta, compact && styles.metaCompact]}>{'\u23F0'} {displayTime || 'Time TBC'}</Text>
        <Text style={[styles.meta, compact && styles.metaCompact]} numberOfLines={1}>{'\uD83D\uDCCD'} {suburb || 'Location TBC'}</Text>

        <View style={styles.footerRow}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, audience === 'Family Event' ? styles.familyBadge : styles.audienceBadge]}>
              <Text style={[styles.badgeText, audience === 'Family Event' ? styles.familyText : styles.audienceText]} numberOfLines={1}>
                {String(audience).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: organiser.backgroundColor }]}>
              <Text style={[styles.badgeText, { color: organiser.color }]}>{organiser.label}</Text>
            </View>
          </View>

          {onToggleSaved ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from Favourites' : 'Add to Favourites'}
              hitSlop={8}
              onPress={pressEvent => {
                pressEvent.stopPropagation?.();
                onToggleSaved?.();
              }}
              style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
            >
              {saving ? (
                <ActivityIndicator color={colors.tealDark} size="small" />
              ) : (
                <Text style={[styles.saveText, isSaved && styles.saveTextActive]}>
                  {isSaved ? '\u2605' : '\u2606'}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>

    <Modal transparent visible={posterOpen} animationType="fade" onRequestClose={() => setPosterOpen(false)}>
      <Pressable accessibilityLabel="Close full-screen event poster" onPress={() => setPosterOpen(false)} style={styles.posterModal}>
        {poster ? <Image source={{ uri: poster }} style={styles.posterFullscreen} resizeMode="contain" /> : null}
        <Text style={styles.posterCloseHint}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, ...shadow },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  posterFrame: { width: 92, height: 92, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: '#f0f4f3' },
  posterFrameCompact: { width: 82, height: 92 },
  poster: { width: '100%', height: '100%' },
  dateChip: { position: 'absolute', top: 6, left: 6, minWidth: 36, alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.surface, ...shadow },
  dateMonth: { color: '#16a34a', fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  dateDay: { color: colors.text, fontSize: 16, lineHeight: 17, fontWeight: '900' },
  dateWeekday: { color: colors.muted, fontSize: 8, fontWeight: '800' },
  liveBadge: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, color: colors.surface, backgroundColor: colors.teal, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  zoomHint: { position: 'absolute', right: 5, bottom: 5, width: 22, height: 22, borderRadius: 11, color: colors.surface, backgroundColor: 'rgba(0,0,0,0.58)', fontSize: 15, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  content: { flex: 1, minWidth: 0, justifyContent: 'center' },
  titlePanel: { alignSelf: 'stretch', paddingHorizontal: 9, paddingVertical: 7, marginBottom: 5, borderLeftWidth: 3, borderLeftColor: colors.teal, borderRadius: 9, backgroundColor: '#edf8f6' },
  title: { color: colors.navy, fontSize: 13, lineHeight: 17, fontWeight: '900', letterSpacing: 0.25 },
  titleCompact: { fontSize: 12, lineHeight: 16 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  metaCompact: { fontSize: 11 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  badgeRow: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  badge: { maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 9, fontWeight: '900' },
  familyBadge: { backgroundColor: '#dbeafe' },
  familyText: { color: '#1d4ed8' },
  audienceBadge: { backgroundColor: '#dcfce7' },
  audienceText: { color: '#15803d' },
  saveButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  saveButtonPressed: { opacity: 0.65 },
  saveText: { color: '#cbd5d3', fontSize: 24, lineHeight: 28 },
  saveTextActive: { color: colors.teal },
  posterModal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.94)' },
  posterFullscreen: { width: '100%', height: '88%' },
  posterCloseHint: { position: 'absolute', bottom: 34, color: colors.surface, fontSize: 13, fontWeight: '800' },
});
