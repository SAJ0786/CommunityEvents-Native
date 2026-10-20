import React, { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { auth } from '../firebase/firebase';
import { registrationStatusLabel } from '../registration/registrationStatus';
import { colors, radius, shadow, spacing, typography, withAlpha } from '../theme';
import { formatEventTime } from '../utils/formatters';
import { getEventPoster, getEventSuburb } from '../services/events';
import { getImmediatePosterSource, resolvePosterSource } from '../services/images';
import { firebaseRegistration, REGISTRATION_ENABLED } from '../registration/firebaseRegistration';

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
    return { label: 'Private', backgroundColor: colors.background, color: colors.neutralStrong };
  }
  const type = String(event.organisationType || event.organiserCategory || 'centre').toLowerCase() === 'org'
    ? 'org'
    : 'centre';
  return type === 'org'
    ? { label: 'Org', backgroundColor: colors.blueSoft, color: colors.tealDark }
    : { label: 'Centre', backgroundColor: colors.amberSoft, color: colors.warningText };
}

export default function EventCard({ event, onPress, onToggleSaved, isSaved, saving, registrationActionLabel }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width / Math.max(fontScale, 1) < 390;
  const [poster, setPoster] = useState(getEventPoster(event) || getImmediatePosterSource(event));
  const viewerUid = auth.currentUser?.uid || '';
  const [posterAccount, setPosterAccount] = useState('');
  const visiblePoster = event.registrationOnly && (posterAccount !== viewerUid || event.status === 'cancelled' || (!event.isRegistered && !event.canManage)) ? '' : poster;
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterError, setPosterError] = useState('');
  const [posterRefresh, setPosterRefresh] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const chip = dateChip(event.eventDate);
  const displayType = event.eventTypeDisplay || event.customEventType || event.eventType || 'Event';
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const title = event.registrationOnly ? event.title : [displayType, host].filter(Boolean).join(' - ');
  const suburb = getEventSuburb(event);
  const organiser = organiserBadge(event);
  const displayTime = `${event.prayerLabel ? `${event.prayerLabel} ` : ''}${formatEventTime(event.startTime, event.endTime)}`.trim();
  const hasUploadedPoster = event.registrationOnly ? event.hasPoster : Boolean(event.imageUrl || event.posterUrl || event.poster || event.image || event.flyerUrl || event.flyer || event.imagePath || event.posterPath);

  useEffect(() => {
    if (!event.registrationOnly) return undefined;
    const listener = AppState.addEventListener('change', state => {
      setPoster(''); setPosterOpen(false); setForeground(state === 'active');
      if (state === 'active') setPosterRefresh(value => value + 1);
    });
    return () => listener.remove();
  }, [event.registrationOnly]);

  useEffect(() => {
    let alive = true;
    setPosterError('');
    if (event.registrationOnly) {
      setPoster('');
      if (event.hasPoster && event.status !== 'cancelled' && foreground && viewerUid && (event.isRegistered || event.canManage || posterOpen)) firebaseRegistration({ enabled: REGISTRATION_ENABLED }).poster(event.id)
        .then(result => { if (alive && auth.currentUser?.uid === viewerUid && ['image/jpeg', 'image/png', 'image/webp'].includes(result.mime)) { setPosterAccount(viewerUid); setPoster(`data:${result.mime};base64,${result.base64}`); } })
        .catch(() => { if (alive) setPosterError('Poster unavailable. Open event to retry.'); });
      return () => { alive = false; };
    }
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
  }, [event.id, event.revision, event.status, event.hasPoster, event.imageUrl, event.posterUrl, event.imagePath, foreground, posterRefresh, viewerUid, event.isRegistered, event.canManage, event.registrationOnly && !event.isRegistered && !event.canManage && posterOpen]);

  return (
    <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${title}`}
      onPress={() => onPress?.(event.registrationOnly && visiblePoster ? {...event,registrationPoster:{uid:viewerUid,revision:event.revision,uri:visiblePoster}} : event)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Pressable
        disabled={!hasUploadedPoster}
        onPress={pressEvent => {
          pressEvent.stopPropagation?.();
          setPosterOpen(true);
        }}
        style={[styles.posterFrame, compact && styles.posterFrameCompact]}
      >
        <Image
          source={visiblePoster ? { uri: visiblePoster } : fallbackLogo}
          style={styles.poster}
          resizeMode={visiblePoster ? 'cover' : 'contain'}
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
          <MaterialCommunityIcons color={colors.onPrimary} name="calendar-blank-outline" size={15} />
        </View>
      </Pressable>

      <View style={styles.content}>
        {event.registrationOnly && event.canManage && (event.status === 'pending' || event.hasPendingChanges || event.reviewDecision) ? <View style={{ backgroundColor: colors.amberSoft, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignSelf: 'flex-start' }}><Text style={{ color: colors.danger, ...typography.label }}>{event.reviewDecision === 'rejected' ? 'Unapproved' : event.reviewDecision === 'changes-requested' ? 'Changes requested' : 'Needs approval'}</Text></View> : null}
        {event.registrationOnly && registrationStatusLabel(event) ? <Text style={styles.unavailableText}>{registrationStatusLabel(event)}</Text> : null}
        {posterError ? <Text accessibilityRole="alert" style={styles.metaText}>{posterError}</Text> : null}
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
        {event.registrationOnly && <Text style={styles.metaText}>Submitted by {event.submittedByName || 'Name unavailable'}</Text>}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, styles.typeBadge]}>
            <Text maxFontSizeMultiplier={1.02} numberOfLines={1} style={styles.typeText}>{displayType}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: organiser.backgroundColor }]}>
            <Text maxFontSizeMultiplier={1.02} numberOfLines={1} style={[styles.typeText, { color: organiser.color }]}>{organiser.label}</Text>
          </View>
        </View>
        {registrationActionLabel ? <View style={styles.registrationCaption}><MaterialCommunityIcons color={colors.blue} name="clipboard-text-outline" size={14}/><Text style={styles.registrationCaptionText}>{registrationActionLabel}</Text></View> : null}
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
        {visiblePoster ? <Image source={{ uri: visiblePoster }} style={styles.posterFullscreen} resizeMode="contain" /> : posterError ? <><Text accessibilityRole="alert" style={{ color: colors.onPrimary }}>{posterError}</Text><Pressable onPress={event => { event.stopPropagation?.(); setPosterRefresh(value => value + 1); }}><Text style={{ color: colors.onPrimary }}>Retry poster</Text></Pressable></> : <ActivityIndicator color={colors.onPrimary} />}
        <Text maxFontSizeMultiplier={1.1} style={styles.posterCloseHint}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 8, marginBottom: spacing.sm, backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1, borderRadius: 24, ...shadow },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  posterFrame: { width: 78, height: 78, position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.neutralSoft },
  posterFrameCompact: { width: 70, height: 74 },
  poster: { width: '100%', height: '100%' },
  dateChip: { position: 'absolute', top: 4, left: 4, minWidth: 31, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 7, backgroundColor: colors.surface, ...shadow },
  dateMonth: { color: colors.tealDark, fontSize: 7, fontWeight: '700', letterSpacing: 0.3 },
  dateDay: { color: colors.text, fontSize: typography.cardTitle.fontSize, lineHeight: 14, fontWeight: '700' },
  dateWeekday: { color: colors.muted, fontSize: 7, fontWeight: '600' },
  liveBadge: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 2, color: colors.surface, backgroundColor: colors.teal, fontSize: typography.eyebrow.fontSize, fontWeight: '700', textAlign: 'center' },
  posterCalendarIcon: { position: 'absolute', right: 5, bottom: 5, width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: withAlpha(colors.blue, 0.88), borderWidth: 1, borderColor: withAlpha(colors.glassBorder, 0.76) },
  content: { flex: 1, minWidth: 0, position: 'relative', justifyContent: 'center' },
  titlePanel: { alignSelf: 'stretch', minHeight: 30, justifyContent: 'center', paddingRight: 46, marginBottom: 3 },
  title: { color: colors.navy, fontSize: typography.body.fontSize, lineHeight: 17, fontWeight: '700', letterSpacing: -0.15 },
  titleCompact: { fontSize: 12, lineHeight: 16 },
  metaRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingRight: 25, gap: 3, overflow: 'hidden' },
  unavailableText: { color: colors.danger, fontSize: 10, lineHeight: 14, fontWeight: '700', marginBottom: 4 },
  registrationCaption: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingRight: 24 },
  registrationCaptionText: { color: colors.blue, fontSize: 10, lineHeight: 14, fontWeight: '600', flexShrink: 1 },
  metaText: { flexShrink: 0, color: colors.muted, fontSize: 9.5, lineHeight: 13, fontWeight: '600' },
  locationText: { flex: 1, minWidth: 0 },
  metaDot: { color: colors.borderStrong, fontSize: 10, lineHeight: 13, marginHorizontal: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 28, marginTop: 5, overflow: 'hidden' },
  badge: { maxWidth: '48%', minHeight: 19, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  typeBadge: { backgroundColor: colors.indigoSoft },
  typeText: { color: colors.purple, fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  disclosureIcon: { position: 'absolute', right: 1, bottom: 9 },
  saveButton: { position: 'absolute', right: 0, top: -2, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  saveButtonPressed: { opacity: 0.65 },
  saveText: { color: colors.borderStrong, fontSize: 21, lineHeight: 25 },
  saveTextActive: { color: colors.rose },
  posterModal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: withAlpha(colors.mediaBackground, 0.94) },
  posterFullscreen: { width: '100%', height: '88%' },
  posterCloseHint: { position: 'absolute', bottom: 34, color: colors.surface, fontSize: typography.body.fontSize, fontWeight: '600' },
});
