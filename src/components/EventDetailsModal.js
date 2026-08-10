import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import { formatEventDate, formatEventTime } from '../utils/formatters';
import {
  getEventPoster,
  getEventSuburb,
  getEventTitle,
} from '../services/events';

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text maxFontSizeMultiplier={1.2} style={styles.detailLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.detailValue}>{String(value)}</Text>
    </View>
  );
}

function formatReciters(reciters) {
  if (!Array.isArray(reciters)) return '';
  return reciters
    .filter(reciter => reciter?.name)
    .map(reciter => {
      const role = reciter.customType || reciter.type || 'Reciter';
      return `${role}: ${reciter.name}`;
    })
    .join('\n');
}

export default function EventDetailsModal({ event, visible, onClose }) {
  if (!event) return null;

  const poster = getEventPoster(event);
  const host = event.hostName || event.organiserName || event.organizationName || '';
  const displayType = event.eventTypeDisplay || event.eventType || event.type || '';
  const audience = event.audienceType === 'Mixed Audience'
    ? 'Family Event'
    : event.audienceType || event.audience || '';
  const hijriDate = event.hijriDateDisplay || event.hijriDate || '';

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      transparent={false}
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text maxFontSizeMultiplier={1.2} style={styles.headerTitle}>Event details</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close event details"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text maxFontSizeMultiplier={1.2} style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {poster ? (
            <View style={styles.posterFrame}>
              <Image
                source={{ uri: poster }}
                style={styles.poster}
                resizeMode="contain"
              />
            </View>
          ) : null}

          <View style={[styles.card, !poster && styles.cardFirst]}>
            <Text maxFontSizeMultiplier={1.2} style={styles.title}>{getEventTitle(event)}</Text>
            <Text maxFontSizeMultiplier={1.2} style={styles.date}>{formatEventDate(event.eventDate)}</Text>

            <DetailRow label="Event" value={displayType} />
            <DetailRow label="Host" value={host} />
            <DetailRow
              label="Time"
              value={`${event.prayerLabel ? `${event.prayerLabel} ` : ''}${formatEventTime(event.startTime, event.endTime)}`}
            />
            <DetailRow label="Location" value={getEventSuburb(event) || 'Location TBC'} />
            <DetailRow label="Audience" value={audience} />
            <DetailRow label="Hijri date" value={hijriDate} />
            <DetailRow label="Speaker" value={event.speakerName} />
            <DetailRow label="Reciters" value={formatReciters(event.reciters)} />

            {event.notes?.trim() ? (
              <View style={styles.notesBox}>
                <Text maxFontSizeMultiplier={1.2} style={styles.detailLabel}>Notes</Text>
                <Text maxFontSizeMultiplier={1.2} style={styles.notes}>{event.notes.trim()}</Text>
              </View>
            ) : null}
          </View>

          <Text maxFontSizeMultiplier={1.2} style={styles.privacyNote}>
            Public view shows suburb-level location only. Verify event details with the host.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  closeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  closeText: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: 40,
  },
  posterFrame: {
    width: '100%',
    maxWidth: 620,
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.tealSoft,
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 620,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  cardFirst: {
    marginTop: 0,
  },
  title: {
    color: colors.navy,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  date: {
    color: colors.teal,
    fontSize: 15,
    fontWeight: '900',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  detailRow: {
    width: '100%',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    width: '100%',
    flexShrink: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: spacing.xs,
  },
  notesBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  notes: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  privacyNote: {
    width: '100%',
    maxWidth: 620,
    color: colors.muted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
