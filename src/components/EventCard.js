import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
  const { width, fontScale } = useWindowDimensions();
  const compact = width / Math.max(fontScale, 1) < 390;
  const [poster, setPoster] = useState(getEventPoster(event) || getImmediatePosterSource(event));
  const [posterOpen, setPosterOpen] = useState(false);
  const chip = dateChip(event.eventDate);
  const displayType = event.eventTypeDisplay || event.customEventType || event.eventType || 'Event';
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const title = [displayType, host].filter(Boolean).join(' - ');
  const suburb = getEventSuburb(event);
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
            <Text maxFontSizeMultiplier={1} style={styles.dateMonth}>{chip.month}</Text>
            <Text maxFontSizeMultiplier={1} style={styles.dateDay}>{chip.day}</Text>
            <Text maxFontSizeMultiplier={1} style={styles.dateWeekday}>{chip.weekday}</Text>
          </View>
        ) : null}
        {event.isLive ? <Text maxFontSizeMultiplier={1} style={styles.liveBadge}>LIVE</Text> : null}
        <View style={styles.posterCalendarIcon}>
          <MaterialCommunityIcons color="#ffffff" name="calendar-blank-outline" size={15} />
        </View>
      </Pressable>

      <View style={styles.content}>
        <View style={styles.titlePanel}>
          <Text maxFontSizeMultiplier={1.06} style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>{title}</Text>
        </View>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons color={colors.blue} name="clock-outline" size={13} />
          <Text maxFontSizeMultiplier={1.03} numberOfLines={1} style={styles.metaText}>{displayTime || 'TBC'}</Text>
          <Text maxFontSizeMultiplier={1} style={styles.metaDot}>{'\u2022'}</Text>
          <MaterialCommunityIcons color={colors.blue} name="map-marker-outline" size={13} />
          <Text maxFontSizeMultiplier={1.03} numberOfLines={1} style={[styles.metaText, styles.locationText]}>{suburb || 'TBC'}</Text>
        </View>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, styles.typeBadge]}>
            <Text maxFontSizeMultiplier={1.02} numberOfLines={1} style={styles.typeText}>{displayType}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: organiser.backgroundColor }]}>
            <Text maxFontSizeMultiplier={1.02} numberOfLines={1} style={[styles.typeText, { color: organiser.color }]}>{organiser.label}</Text>
          </View>
        </View>
        <MaterialCommunityIcons color={colors.blue} name="chevron-right" size={22} style={styles.disclosureIcon} />
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
              <Text maxFontSizeMultiplier={1} style={[styles.saveText, isSaved && styles.saveTextActive]}>
                {isSaved ? '\u2665' : '\u2661'}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </Pressable>

    <Modal transparent visible={posterOpen} animationType="fade" onRequestClose={() => setPosterOpen(false)}>
      <Pressable accessibilityLabel="Close full-screen event poster" onPress={() => setPosterOpen(false)} style={styles.posterModal}>
        {poster ? <Image source={{ uri: poster }} style={styles.posterFullscreen} resizeMode="contain" /> : null}
        <Text maxFontSizeMultiplier={1.1} style={styles.posterCloseHint}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 8, marginBottom: spacing.sm, backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: 24, ...shadow },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  posterFrame: { width: 78, height: 78, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#f0f4f3' },
  posterFrameCompact: { width: 70, height: 74 },
  poster: { width: '100%', height: '100%' },
  dateChip: { position: 'absolute', top: 4, left: 4, minWidth: 31, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 7, backgroundColor: colors.surface, ...shadow },
  dateMonth: { color: colors.tealDark, fontSize: 7, fontWeight: '700', letterSpacing: 0.3 },
  dateDay: { color: colors.text, fontSize: 14, lineHeight: 14, fontWeight: '700' },
  dateWeekday: { color: colors.muted, fontSize: 7, fontWeight: '600' },
  liveBadge: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, color: colors.surface, backgroundColor: colors.teal, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  posterCalendarIcon: { position: 'absolute', right: 5, bottom: 5, width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: 'rgba(37,99,235,0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.76)' },
  content: { flex: 1, minWidth: 0, position: 'relative', justifyContent: 'center' },
  titlePanel: { alignSelf: 'stretch', minHeight: 30, justifyContent: 'center', paddingRight: 46, marginBottom: 3 },
  title: { color: colors.navy, fontSize: 13, lineHeight: 17, fontWeight: '700', letterSpacing: -0.15 },
  titleCompact: { fontSize: 12, lineHeight: 16 },
  metaRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingRight: 25, gap: 3, overflow: 'hidden' },
  metaText: { flexShrink: 0, color: colors.muted, fontSize: 9.5, lineHeight: 13, fontWeight: '600' },
  locationText: { flex: 1, minWidth: 0 },
  metaDot: { color: '#aab4c2', fontSize: 10, lineHeight: 13, marginHorizontal: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 28, marginTop: 5, overflow: 'hidden' },
  badge: { maxWidth: '48%', minHeight: 19, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  typeBadge: { backgroundColor: '#eee6ff' },
  typeText: { color: '#6941c6', fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  disclosureIcon: { position: 'absolute', right: 1, bottom: 9 },
  saveButton: { position: 'absolute', right: 0, top: -2, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  saveButtonPressed: { opacity: 0.65 },
  saveText: { color: '#cbd5d3', fontSize: 21, lineHeight: 25 },
  saveTextActive: { color: '#d43867' },
  posterModal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.94)' },
  posterFullscreen: { width: '100%', height: '88%' },
  posterCloseHint: { position: 'absolute', bottom: 34, color: colors.surface, fontSize: 13, fontWeight: '600' },
});
