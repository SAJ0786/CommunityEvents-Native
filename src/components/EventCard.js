import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import { formatEventDate, formatEventTime } from '../utils/formatters';
import { getEventPoster, getEventSuburb, getEventTitle } from '../services/events';

const fallbackLogo = require('../../assets/logo.png');

function AudienceBadge({ label }) {
  if (!label) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{String(label).toUpperCase()}</Text>
    </View>
  );
}

export default function EventCard({ event, onPress }) {
  const poster = getEventPoster(event);
  const title = getEventTitle(event);
  const suburb = getEventSuburb(event);
  const hostType = event.organiserType || event.hostType || event.locationType || '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Image
        source={poster ? { uri: poster } : fallbackLogo}
        style={styles.poster}
        resizeMode="cover"
      />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.meta}>Clock {formatEventTime(event.startTime, event.endTime)}</Text>
        <Text style={styles.meta}>Pin {suburb || 'Location TBC'}</Text>
        <View style={styles.badgeRow}>
          <AudienceBadge label={event.audienceType || event.audience} />
          <AudienceBadge label={hostType} />
        </View>
        <Text style={styles.date}>{formatEventDate(event.eventDate)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    ...shadow,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  poster: {
    width: 82,
    height: 82,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  content: {
    flex: 1,
    minHeight: 82,
  },
  title: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    marginBottom: 5,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.tealSoft,
  },
  badgeText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },
  date: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
});
