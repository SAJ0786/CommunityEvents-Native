import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import EventCard from './EventCard';
import { colors, radius, shadow, spacing } from '../theme';

export default function FavouritesScreen({
  events = [],
  loading = false,
  savingEventId = '',
  onPressEvent,
  onToggleSaved,
  onBrowseEvents,
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Favourites</Text>
        {events.length ? <Text style={styles.count}>{events.length}</Text> : null}
      </View>
      <Text style={styles.subtitle}>Events you've saved. Tap {'\u2605'} on any event to save it here.</Text>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.stateText}>Loading favourites...</Text>
        </View>
      ) : null}

      {!loading && events.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.emptyStar}>{'\u2605'}</Text>
          <Text style={styles.emptyTitle}>No saved events yet</Text>
          <Text style={styles.stateText}>Tap the {'\u2605'} button on any event card to save it here for quick access.</Text>
          <Pressable onPress={onBrowseEvents} style={({ pressed }) => [styles.browseButton, pressed && styles.pressed]}>
            <Text style={styles.browseText}>Browse Events</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading ? events.map(event => (
        <View key={event.id}>
          <Pressable
            disabled={savingEventId === event.id}
            onPress={() => onToggleSaved?.(event)}
            style={({ pressed }) => [
              styles.removeButton,
              pressed && styles.pressed,
              savingEventId === event.id && styles.disabled,
            ]}
          >
            <Text style={styles.removeText}>{'\u2605'} Remove from Favourites</Text>
          </Pressable>
          <EventCard
            event={event}
            isSaved
            onPress={() => onPressEvent?.(event)}
            onToggleSaved={() => onToggleSaved?.(event)}
            saving={savingEventId === event.id}
          />
        </View>
      )) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' },
  count: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: spacing.xs, marginBottom: spacing.lg },
  stateCard: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadow },
  emptyStar: { color: colors.teal, fontSize: 44, lineHeight: 52, marginBottom: spacing.sm },
  emptyTitle: { color: colors.navy, fontSize: 20, fontWeight: '900' },
  stateText: { color: colors.muted, fontSize: 15, lineHeight: 21, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  browseButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal },
  browseText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  removeButton: { alignSelf: 'flex-start', marginBottom: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: '#fef3c7' },
  removeText: { color: '#92400e', fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
