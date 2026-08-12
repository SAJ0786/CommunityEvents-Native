import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import EventCard from './EventCard';
import { colors, radius, shadow, spacing } from '../theme';

function EmptyState({ title, text }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export default function MyEventsScreen({
  events = [],
  loading = false,
  error = '',
  onPressEvent,
  onDelete,
  onEdit,
  onCopy,
  onAddEvent,
  onToggleVisibility,
  deletingId = '',
  visibilityBusyId = '',
  seriesCounts = {},
  onEditSeries,
  onDeleteSeries,
  deletingSeriesId = '',
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>My Events</Text>
      <Text style={styles.subtitle}>Events you created. Toggle visibility to show or hide from the home screen.</Text>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.loadingText}>Loading your events...</Text>
        </View>
      ) : null}

      {!loading && events.length === 0 ? (
        <EmptyState
          title="No events yet"
          text="You haven't added any events yet."
        />
      ) : null}

      {!loading && events.length === 0 ? (
        <Pressable onPress={onAddEvent} style={({ pressed }) => [styles.addEventButton, pressed && styles.pressed]}>
          <Text style={styles.addEventText}>+ Add Your First Event</Text>
        </Pressable>
      ) : null}

      {!loading ? (
        <View style={styles.list}>
          {events.map(event => (
            <View key={event.id} style={styles.itemWrap}>
              {event.isRecurring || event.seriesId || event.recurringSeriesId ? (
                <View style={styles.seriesBanner}>
                  <Text style={styles.seriesBannerText}>
                    Recurring Series
                    {(seriesCounts[event.seriesId || event.recurringSeriesId] || event.recurrenceTotal) ? ` - ${seriesCounts[event.seriesId || event.recurringSeriesId] || event.recurrenceTotal} events` : ''}
                  </Text>
                </View>
              ) : null}
              <View style={styles.visibilityRow}>
                <Text style={[styles.visibilityText, event.hidden ? styles.hiddenText : styles.visibleText]}>
                  {event.hidden ? 'Hidden from home screen' : 'Visible on home screen'}
                </Text>
                <Pressable
                  disabled={visibilityBusyId === event.id}
                  onPress={() => onToggleVisibility?.(event)}
                  style={({ pressed }) => [
                    styles.visibilityButton,
                    event.hidden && styles.makeVisibleButton,
                    pressed && styles.pressed,
                    visibilityBusyId === event.id && styles.disabled,
                  ]}
                >
                  {visibilityBusyId === event.id ? (
                    <ActivityIndicator color={colors.tealDark} size="small" />
                  ) : (
                    <Text style={styles.visibilityButtonText}>{event.hidden ? 'Make Visible' : 'Hide Event'}</Text>
                  )}
                </Pressable>
              </View>
              <View style={event.hidden ? styles.hiddenCard : undefined}>
                <EventCard event={event} onPress={() => onPressEvent?.(event)} />
              </View>
              <View style={styles.metaRow}>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => onEdit?.(event)}
                    style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  {onEditSeries && (event.seriesId || event.recurringSeriesId) ? (
                    <Pressable
                      onPress={() => onEditSeries(event)}
                      style={({ pressed }) => [styles.seriesButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.seriesText}>Edit Entire Series</Text>
                    </Pressable>
                  ) : null}
                  {onCopy ? (
                    <Pressable
                      onPress={() => onCopy(event)}
                      style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.copyText}>Copy</Text>
                    </Pressable>
                  ) : null}
                  {onDeleteSeries && (event.seriesId || event.recurringSeriesId) ? (
                    <Pressable
                      onPress={() => onDeleteSeries(event)}
                      disabled={deletingSeriesId === (event.seriesId || event.recurringSeriesId)}
                      style={({ pressed }) => [
                        styles.deleteSeriesButton,
                        pressed && styles.pressed,
                        deletingSeriesId === (event.seriesId || event.recurringSeriesId) && styles.disabled,
                      ]}
                    >
                      {deletingSeriesId === (event.seriesId || event.recurringSeriesId) ? (
                        <ActivityIndicator color={colors.danger} size="small" />
                      ) : (
                        <Text style={styles.deleteSeriesText}>Delete Entire Series</Text>
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => onDelete?.(event)}
                    disabled={deletingId === event.id}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.pressed,
                      deletingId === event.id && styles.disabled,
                    ]}
                  >
                    {deletingId === event.id ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : (
                      <Text style={styles.deleteText}>Delete</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.navy,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  loadingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  emptyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  emptyTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  itemWrap: {
    gap: spacing.sm,
  },
  seriesBanner: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: '#edf7f5',
  },
  seriesBannerText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  visibilityText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '900',
  },
  hiddenText: { color: colors.tealDark },
  visibleText: { color: '#2e7d32' },
  visibilityButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: '#eef0f3',
  },
  makeVisibleButton: { backgroundColor: colors.tealSoft },
  visibilityButtonText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  hiddenCard: { opacity: 0.62 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#fdeeee',
  },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  copyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#eef0f3',
  },
  seriesButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#e8f5e9',
  },
  deleteSeriesButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: '#fff4f4',
  },
  editText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '900',
  },
  copyText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  seriesText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '900',
  },
  deleteText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  deleteSeriesText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
  addEventButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  addEventText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.md,
  },
});
