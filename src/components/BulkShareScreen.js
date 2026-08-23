import React, { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import HomeFilters from './HomeFilters';
import { colors, radius, shadow, spacing } from '../theme';
import { DEFAULT_CITY, cityLabel, getEventMetroArea, normalizeCity } from '../utils/cities';
import { compareEventsByDateTime } from '../services/events';
import { formatEventDate } from '../utils/formatters';
import { STORE_SHARE_LINES } from '../utils/storeLinks';

const EMPTY_FILTERS = {
  organiser: '',
  eventType: '',
  audienceType: '',
  period: '',
  hostName: '',
  suburb: '',
};

function localDateString(offsetDays = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatAudienceType(value) {
  if (!value) return '';
  return value === 'Mixed Audience' ? 'Family Event' : value;
}

function isSuperAdminRole(role) {
  return role === 'superAdmin';
}

function getAdminCity(profile) {
  return normalizeCity(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);
}

function getSharePrivacy(profile, event, uid) {
  const role = profile?.role;
  const isAdmin = role === 'admin' || role === 'superAdmin';
  const isGuest = !uid;
  const isPrivate = event?.organiserType === 'private';
  const isOwner = uid && event?.createdByUserId === uid;

  if (isGuest) return { showFullAddress: !isPrivate, showPhone: false };
  if (isAdmin) return { showFullAddress: true, showPhone: true };
  if (!isPrivate || isOwner) return { showFullAddress: true, showPhone: true };
  return { showFullAddress: false, showPhone: false };
}

function filterEvents(events, query, filters) {
  let displayed = [...events];
  const today = localDateString();
  if (filters.period) {
    const end = filters.period === 'today'
      ? today
      : localDateString(filters.period === 'week' ? 7 : 30);
    displayed = displayed.filter(event => event.isLive || (
      event.eventDate >= today && event.eventDate <= end
    ));
  }
  if (filters.organiser) {
    displayed = displayed.filter(event => {
      const organiserType = event.organiserType || event.organisationType || 'private';
      const isPrivate = organiserType === 'private';
      return filters.organiser === 'private' ? isPrivate : !isPrivate;
    });
  }
  if (filters.eventType) {
    displayed = displayed.filter(event => (
      event.eventTypeDisplay || event.customEventType || event.eventType
    ) === filters.eventType);
  }
  if (filters.audienceType) {
    displayed = displayed.filter(event => formatAudienceType(event.audienceType) === filters.audienceType);
  }
  if (filters.hostName.trim()) {
    const host = filters.hostName.trim().toLowerCase();
    displayed = displayed.filter(event => String(event.hostName || '').toLowerCase().includes(host));
  }
  if (filters.suburb.trim()) {
    const suburb = filters.suburb.trim().toLowerCase();
    displayed = displayed.filter(event => String(event.address?.suburb || event.suburb || '').toLowerCase().includes(suburb));
  }
  if (query.trim()) {
    const lower = query.trim().toLowerCase();
    displayed = displayed.filter(event => [
      event.eventTypeDisplay,
      event.customEventType,
      event.eventType,
      event.hostName,
      event.eventSubject,
      event.address?.suburb,
      event.address?.fullAddress,
      event.audienceType,
      event.speakerName,
      event.notes,
    ].filter(Boolean).join(' ').toLowerCase().includes(lower));
  }
  return displayed.sort(compareEventsByDateTime);
}

function sortEventsForMessage(events) {
  return [...events].sort((a, b) => {
    const dateCompare = String(a.eventDate || '').localeCompare(String(b.eventDate || ''));
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = String(a.startTime || '').localeCompare(String(b.startTime || ''));
    if (timeCompare !== 0) return timeCompare;
    return String(a.hostName || '').localeCompare(String(b.hostName || ''));
  });
}

function buildMessage(selectedEvents, profile, uid, messageTitle, messageMode = 'detail') {
  if (!selectedEvents.length) return '';

  const lines = ['📅 *Community Events*', ''];
  if (messageTitle.trim()) lines.push(`*${messageTitle.trim()}*`, '');

  const appendDetailEvent = event => {
    const privacy = getSharePrivacy(profile, event, uid);
    const address = event.address || {};
    const fullAddress = address.fullAddress || [address.street, address.suburb, address.state, address.postcode].filter(Boolean).join(', ');
    const suburbOnly = `${address.suburb || ''}${address.state ? ', ' + address.state : ''}`;
    const location = privacy.showFullAddress ? fullAddress : suburbOnly;
    const locationLabel = privacy.showFullAddress ? 'Location' : 'Suburb';
    const audience = formatAudienceType(event.audienceType);
    const eventCategory = event.organiserType === 'private' ? 'Private Event' : 'Centre Event';

    lines.push(`*${event.eventType}${event.eventSubject ? ' - ' + event.eventSubject : ''}*`);
    if (audience) lines.push(`*${audience}*`);
    lines.push(`${event.organiserType === 'private' ? '🔒' : '🏛️'} ${eventCategory}`);
    lines.push(`🗓️ ${formatEventDate(event.eventDate)}${event.hijriDate ? ' - ' + event.hijriDate : ''}`);
    lines.push(`⏰ ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}`);
    if (event.hostName) lines.push(`👤 ${event.hostName}`);
    if (location) lines.push(`📍 ${locationLabel}: ${location}`);
    if (privacy.showPhone && event.hostPhone) lines.push(`📞 ${event.hostPhone}`);
    if (event.speakerName) lines.push(`🎙️ ${event.speakerName}`);
    (event.reciters || [])
      .filter(reciter => reciter?.name?.trim())
      .forEach(reciter => lines.push(`🎙️ ${reciter.customType || reciter.type || 'Reciter'}: ${reciter.name.trim()}`));
    if (event.notes?.trim()) lines.push(`📝 Notes: ${event.notes.trim()}`);
    lines.push('');
  };

  const appendBriefEvent = event => {
    const suburb = event.address?.suburb || '';
    const state = event.address?.state || '';
    const suburbLabel = [suburb, state].filter(Boolean).join(', ');
    lines.push(`*${event.hostName || 'Community Event'}*`);
    lines.push(`Date: ${formatEventDate(event.eventDate)}`);
    lines.push(`Time: ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''}`);
    const audience = formatAudienceType(event.audienceType);
    if (audience) lines.push(`Audience: ${audience}`);
    if (suburbLabel) lines.push(`Suburb: ${suburbLabel}`);
    lines.push('');
  };

  const appendEvent = messageMode === 'brief' ? appendBriefEvent : appendDetailEvent;
  const centreEvents = sortEventsForMessage(selectedEvents.filter(event => event.organiserType !== 'private'));
  const privateEvents = sortEventsForMessage(selectedEvents.filter(event => event.organiserType === 'private'));

  if (centreEvents.length) {
    lines.push(`*Centre Programs (${centreEvents.length})*`, '--------------------');
    centreEvents.forEach(appendEvent);
  }
  if (centreEvents.length && privateEvents.length) lines.push('====================', '');
  if (privateEvents.length) {
    lines.push(`*Private Programs (${privateEvents.length})*`, '--------------------');
    privateEvents.forEach(appendEvent);
  }

  lines.push(...STORE_SHARE_LINES);
  lines.push('_Shared via Community Events_');
  return lines.join('\n');
}

export default function BulkShareScreen({ events = [], profile, user }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageMode, setMessageMode] = useState('detail');

  const today = localDateString();
  const bulkShareCity = getAdminCity(profile);
  const isNationalBulkShare = isSuperAdminRole(profile?.role);

  const upcoming = useMemo(() => events.filter(event => (
    event?.status !== 'inactive'
    && !event?.hidden
    && event.eventDate >= today
    && (isNationalBulkShare || getEventMetroArea(event) === bulkShareCity)
  )).sort(compareEventsByDateTime), [bulkShareCity, events, isNationalBulkShare, today]);

  const displayed = useMemo(() => filterEvents(upcoming, query, filters), [filters, query, upcoming]);
  const selectedEvents = useMemo(() => displayed.filter(event => selected.has(event.id)), [displayed, selected]);
  const message = useMemo(
    () => buildMessage(selectedEvents, profile, user?.uid, messageTitle, messageMode),
    [messageMode, messageTitle, profile, selectedEvents, user?.uid]
  );

  const toggleSelect = id => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(displayed.map(event => event.id)));
  const clearAll = () => setSelected(new Set());

  const copyMessage = async () => {
    if (!message) return;
    await Clipboard.setStringAsync(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareMessage = async () => {
    if (!message) return;
    try {
      await Share.share({ title: 'Community Events Programs Update', message });
    } catch {}
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.topCopy}>
            <Text style={styles.title}>Bulk Share Events</Text>
            <Text style={styles.subtitle}>
              Filter events, select the ones you want, then share or copy.
              {!isNationalBulkShare ? ` Your bulk share list is limited to ${cityLabel(bulkShareCity)}.` : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Message title</Text>
        <TextInput
          maxLength={120}
          onChangeText={setMessageTitle}
          placeholder="e.g. Events this weekend"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={messageTitle}
        />

        <Text style={[styles.label, styles.labelSpaced]}>Message format</Text>
        <View style={styles.modeWrap}>
          {[
            ['detail', 'Detailed message'],
            ['brief', 'Brief message'],
          ].map(([value, label]) => {
            const active = messageMode === value;
            return (
              <Pressable
                key={value}
                onPress={() => setMessageMode(value)}
                style={({ pressed }) => [styles.modeButton, active && styles.modeButtonActive, pressed && styles.pressed]}
              >
                <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {selected.size > 0 ? (
        <View style={styles.card}>
          <Text style={styles.previewTitle}>Message preview ({selected.size} event{selected.size === 1 ? '' : 's'})</Text>
          <ScrollView nestedScrollEnabled style={styles.previewBox}>
            <Text style={styles.previewText}>{message}</Text>
          </ScrollView>
          <View style={styles.actionRow}>
            <Pressable onPress={shareMessage} style={({ pressed }) => [styles.primaryButton, styles.actionPrimary, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Share via WhatsApp / SMS</Text>
            </Pressable>
            <Pressable onPress={copyMessage} style={({ pressed }) => [styles.secondaryButton, styles.actionSecondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <HomeFilters
        events={upcoming}
        query={query}
        onQueryChange={setQuery}
        filters={filters}
        onFilterChange={(field, value) => setFilters(current => ({ ...current, [field]: value }))}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(current => !current)}
        onClear={() => setFilters({ ...EMPTY_FILTERS })}
      />

      <View style={styles.toolbar}>
        <Pressable onPress={selectAll} style={({ pressed }) => [styles.secondaryButton, styles.toolbarButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Select all ({displayed.length})</Text>
        </Pressable>
        {selected.size > 0 ? (
          <>
            <Pressable onPress={clearAll} style={({ pressed }) => [styles.secondaryButton, styles.toolbarButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Clear selection</Text>
            </Pressable>
            <Text style={styles.selectedText}>{selected.size} selected</Text>
          </>
        ) : null}
      </View>

      {displayed.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No events match filters</Text>
          <Text style={styles.emptyText}>Try clearing filters or changing your search.</Text>
        </View>
      ) : null}

      {displayed.map(event => {
        const isSelected = selected.has(event.id);
        const audience = formatAudienceType(event.audienceType);
        return (
          <Pressable
            key={event.id}
            onPress={() => toggleSelect(event.id)}
            style={({ pressed }) => [styles.eventCard, isSelected && styles.eventCardSelected, pressed && styles.pressed]}
          >
            <View style={styles.eventRow}>
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected ? <Text style={styles.checkboxText}>✓</Text> : null}
              </View>
              <View style={styles.eventCopy}>
                <View style={styles.pillRow}>
                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>{event.eventType}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaPillText}>{event.organiserType === 'centre' ? 'Centre' : 'Private'}</Text>
                  </View>
                  {event.hijriDate ? (
                    <View style={styles.metaPill}>
                      <Text style={styles.metaPillText}>{event.hijriDate}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.eventTitle}>{event.eventType} - {event.hostName || 'Community Event'}</Text>
                <Text style={styles.eventMeta}>{formatEventDate(event.eventDate)} • {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}</Text>
                {audience ? <Text style={styles.eventSubMeta}>{audience}</Text> : null}
                {event.address?.suburb ? (
                  <Text style={styles.eventSubMeta}>
                    {event.address.suburb}{event.address.state ? `, ${event.address.state}` : ''}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  topCopy: { flex: 1 },
  title: { color: colors.navy, fontSize: 26, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  backButton: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tealSoft },
  backButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: 6 },
  labelSpaced: { marginTop: spacing.md },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  modeWrap: { flexDirection: 'row', gap: spacing.sm, padding: 4, borderRadius: radius.md, backgroundColor: '#eef7f5' },
  modeButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  modeButtonActive: { backgroundColor: colors.teal },
  modeButtonText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  modeButtonTextActive: { color: colors.surface },
  previewTitle: { color: colors.navy, fontSize: 14, fontWeight: '900', marginBottom: spacing.sm },
  previewBox: { maxHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: '#f9fafb', padding: spacing.md },
  previewText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionPrimary: { flex: 2 },
  actionSecondary: { flex: 1 },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.teal, paddingHorizontal: spacing.lg },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.tealSoft, paddingHorizontal: spacing.md },
  secondaryButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  toolbarButton: { minHeight: 40 },
  selectedText: { color: colors.tealDark, fontSize: 13, fontWeight: '800', marginLeft: 'auto' },
  emptyCard: { padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  emptyTitle: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  eventCard: { padding: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  eventCardSelected: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  eventRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2, backgroundColor: colors.surface },
  checkboxSelected: { borderColor: colors.teal, backgroundColor: colors.teal },
  checkboxText: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  eventCopy: { flex: 1, minWidth: 0 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  typePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.tealSoft },
  typePillText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  metaPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#fef3c7' },
  metaPillText: { color: '#92400e', fontSize: 11, fontWeight: '800' },
  eventTitle: { color: colors.navy, fontSize: 16, fontWeight: '900' },
  eventMeta: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  eventSubMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  pressed: { opacity: 0.8 },
});
