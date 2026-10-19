import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import EventCard from './EventCard';
import { colors, radius, shadow, spacing, typography } from '../theme';
import MemberPageHeader from './MemberPageHeader';

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
  userUid,
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
  onOpenRegistration,
}) {
  const renderEvent = ({ item: event }) => (
    <View style={styles.itemWrap}>
      {event.isRecurring || event.seriesId || event.recurringSeriesId ? (
        <View style={styles.seriesBanner}>
          <Text style={styles.seriesBannerText}>
            Recurring Series
            {(seriesCounts[event.seriesId || event.recurringSeriesId] || event.recurrenceTotal) ? ` - ${seriesCounts[event.seriesId || event.recurringSeriesId] || event.recurrenceTotal} events` : ''}
          </Text>
        </View>
      ) : null}
      {!event.registrationOnly && <View style={styles.visibilityRow}>
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
      </View>}
      <View style={event.hidden ? styles.hiddenCard : undefined}>
        <EventCard event={event} onPress={() => onPressEvent?.(event)} />
      </View>
      {event.registrationOnly && event.isRegistered ? <Pressable onPress={() => onPressEvent?.(event)} style={styles.editButton}><Text style={styles.editText}>{event.status === 'cancelled' ? 'View registration history' : 'View or edit my registration'}</Text></Pressable> : null}
      {(!event.registrationOnly || (event.canManage ?? (event.ownerUid === userUid))) && <View style={styles.metaRow}>
        <View style={styles.actionRow}>
          <Pressable disabled={event.registrationOnly && event.status === 'cancelled'} onPress={() => onEdit?.(event)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
          {event.seriesId || event.recurringSeriesId ? (
            <Pressable disabled={!onEditSeries} onPress={() => onEditSeries?.(event)} style={({ pressed }) => [styles.seriesButton, !onEditSeries && styles.disabled, pressed && onEditSeries && styles.pressed]}>
              <Text style={styles.seriesText}>Edit Entire Series</Text>
            </Pressable>
          ) : null}
          {event.registrationOnly && <>{event.status !== 'cancelled' && <Pressable onPress={() => onOpenRegistration?.(event, 'form')} style={styles.editButton}><Text style={styles.editText}>Edit Registration form</Text></Pressable>}<Pressable onPress={() => onOpenRegistration?.(event, 'responses')} style={styles.editButton}><Text style={styles.editText}>Registration responses</Text></Pressable></>}
          <Pressable disabled={!onCopy} onPress={() => onCopy?.(event)} style={({ pressed }) => [styles.copyButton, !onCopy && styles.disabled, pressed && onCopy && styles.pressed]}>
            <Text style={styles.copyText}>Copy</Text>
          </Pressable>
          {event.seriesId || event.recurringSeriesId ? (
            <Pressable
              onPress={() => onDeleteSeries?.(event)}
              disabled={!onDeleteSeries || deletingSeriesId === (event.seriesId || event.recurringSeriesId)}
              style={({ pressed }) => [styles.deleteSeriesButton, pressed && onDeleteSeries && styles.pressed, (!onDeleteSeries || deletingSeriesId === (event.seriesId || event.recurringSeriesId)) && styles.disabled]}
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
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed, deletingId === event.id && styles.disabled]}
          >
            {deletingId === event.id ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Text style={styles.deleteText}>Delete</Text>
            )}
          </Pressable>
        </View>
      </View>}
    </View>
  );

  return (
    <FlatList
      data={loading ? [] : events}
      keyExtractor={event => event.id}
      renderItem={renderEvent}
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={(
        <View style={styles.headerContent}>
          <MemberPageHeader title="My Events" subtitle="Events you created and your registrations. Manage your events or open a booking to review it." icon="calendar-check-outline" tone="teal" />
          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.teal} size="large" />
              <Text style={styles.loadingText}>Loading your events...</Text>
            </View>
          ) : null}
          {!loading && events.length === 0 ? <EmptyState title="No events yet" text="You haven't added any events yet." /> : null}
          {!loading && events.length === 0 ? (
            <Pressable onPress={onAddEvent} style={({ pressed }) => [styles.addEventButton, pressed && styles.pressed]}>
              <Text style={styles.addEventText}>+ Add Your First Event</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      ListFooterComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      updateCellsBatchingPeriod={40}
      windowSize={5}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
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
    fontSize: 17,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  headerContent: { marginBottom: spacing.md },
  separator: { height: spacing.md },
  itemWrap: {
    gap: spacing.sm,
  },
  seriesBanner: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  seriesBannerText: {
    color: colors.tealDark,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  hiddenText: { color: colors.tealDark },
  visibleText: { color: colors.success },
  visibilityButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralSoft,
  },
  makeVisibleButton: { backgroundColor: colors.tealSoft },
  visibilityButtonText: { color: colors.tealDark, fontSize: 12, fontWeight: '700' },
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
    backgroundColor: colors.dangerSoft,
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
    backgroundColor: colors.neutralSoft,
  },
  seriesButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  deleteSeriesButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  editText: {
    color: colors.tealDark,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  copyText: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  seriesText: {
    color: colors.success,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  deleteText: {
    color: colors.danger,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  deleteSeriesText: {
    color: colors.danger,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
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
  addEventText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  error: {
    color: colors.danger,
    fontSize: typography.cardTitle.fontSize,
    fontWeight: '600',
    marginTop: spacing.md,
  },
});
