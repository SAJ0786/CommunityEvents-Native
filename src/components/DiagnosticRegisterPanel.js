import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ScrollView from './KeyboardAwareScrollView';
import { colors, radius, shadow, spacing } from '../theme';
import { listenDiagnosticSessions, updateDiagnosticAdminReview } from '../services/diagnostics';

const CRASHLYTICS_URL = 'https://console.firebase.google.com/project/community-event-8b639/crashlytics';
const FILTERS = [
  ['all', 'All'],
  ['new', 'New'],
  ['crashes', 'Crashes'],
  ['errors', 'Errors'],
  ['investigating', 'Investigating'],
  ['resolved', 'Resolved'],
  ['archived', 'Archived'],
];

function timestampMillis(value, fallback = '') {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return Date.parse(value || fallback || '') || 0;
}

function dateTimeLabel(value, fallback = '') {
  const time = timestampMillis(value, fallback);
  if (!time) return 'Not recorded';
  return new Date(time).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function statusTone(record) {
  if (record.archived) return { backgroundColor: '#edf0f4', color: colors.muted, label: 'Archived' };
  if (record.adminStatus === 'resolved') return { backgroundColor: colors.tealSoft, color: colors.tealDark, label: 'Resolved' };
  if (record.adminStatus === 'investigating') return { backgroundColor: colors.blueSoft, color: colors.blue, label: 'Investigating' };
  if (record.crashDetected || record.severity === 'fatal' || record.previousCrashDetected) {
    return { backgroundColor: '#fee9e7', color: colors.danger, label: 'Crash' };
  }
  if (record.severity === 'error' || Number(record.errorCount) > 0) {
    return { backgroundColor: colors.amberSoft, color: colors.amber, label: 'Error' };
  }
  return { backgroundColor: colors.purpleSoft, color: colors.purple, label: 'New' };
}

function matchesFilter(record, filter) {
  if (filter === 'all') return !record.archived;
  if (filter === 'archived') return record.archived === true;
  if (filter === 'crashes') return !record.archived && (record.crashDetected || record.previousCrashDetected || record.severity === 'fatal');
  if (filter === 'errors') return !record.archived && record.severity === 'error';
  return !record.archived && (record.adminStatus || 'new') === filter;
}

function eventLine(event) {
  const detail = [event.module, event.screen, event.orientation, event.operation, event.nativeCode, event.reason]
    .filter(Boolean)
    .join(' · ');
  return detail;
}

export default function DiagnosticRegisterPanel({ user, profile, users = [] }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(profile?.role === 'superAdmin');
  const [error, setError] = useState('');
  const [queryText, setQueryText] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (profile?.role !== 'superAdmin') {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const unsubscribe = listenDiagnosticSessions(nextRecords => {
      setRecords(nextRecords);
      setLoading(false);
      setError('');
    }, nextError => {
      setError(nextError?.message || 'Could not load diagnostic sessions.');
      setLoading(false);
    });
    return unsubscribe;
  }, [profile?.role]);

  const counts = useMemo(() => ({
    active: records.filter(item => !item.archived).length,
    crashes: records.filter(item => !item.archived && (item.crashDetected || item.previousCrashDetected || item.severity === 'fatal')).length,
    errors: records.filter(item => !item.archived && item.severity === 'error').length,
    unresolved: records.filter(item => !item.archived && !['resolved'].includes(item.adminStatus)).length,
  }), [records]);

  const displayed = useMemo(() => {
    const needle = queryText.trim().toLowerCase();
    return records
      .filter(item => matchesFilter(item, filter))
      .filter(item => {
        if (!needle) return true;
        return [
          item.sessionId,
          item.installationId,
          item.userUid,
          item.reporterUid,
          item.platform,
          item.deviceModel,
          item.osVersion,
          item.appVersion,
          item.buildNumber,
          item.currentScreen,
          item.adminNote,
          ...(item.recentEvents || []).map(event => event.code),
        ].filter(Boolean).join(' ').toLowerCase().includes(needle);
      })
      .sort((left, right) => timestampMillis(right.lastSeenAt, right.lastSeenAtClient) - timestampMillis(left.lastSeenAt, left.lastSeenAtClient));
  }, [filter, queryText, records]);

  const selectRecord = record => {
    setSelectedId(current => current === record.id ? '' : record.id);
    setAdminNote(record.adminNote || '');
  };

  const saveReview = async (record, adminStatus, archived = false) => {
    setBusyId(record.id);
    try {
      await updateDiagnosticAdminReview(record.id, user?.uid, { adminStatus, adminNote, archived });
      setError('');
      if (archived) setSelectedId('');
    } catch (nextError) {
      setError(nextError?.message || 'Could not update this diagnostic record.');
    } finally {
      setBusyId('');
    }
  };

  if (profile?.role !== 'superAdmin') {
    return (
      <View style={styles.noticeCard}>
        <Text style={styles.cardTitle}>Super Admin access required</Text>
        <Text style={styles.body}>Diagnostic records contain restricted operational metadata and are available only to Super Admins.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.introCard}>
        <Text style={styles.cardTitle}>Diagnostics Register</Text>
        <Text style={styles.body}>Search a support ID, installation, user UID, device or build. Crash stacks remain protected in Firebase Crashlytics; this register stores only the safe timeline needed to identify what happened.</Text>
        <Pressable onPress={() => Linking.openURL(CRASHLYTICS_URL)} style={styles.crashlyticsButton}>
          <Text style={styles.crashlyticsButtonText}>Open Firebase Crashlytics</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        {[
          [counts.active, 'Active'],
          [counts.crashes, 'Crashes'],
          [counts.errors, 'Errors'],
          [counts.unresolved, 'Unresolved'],
        ].map(([value, label]) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <TextInput
        value={queryText}
        onChangeText={setQueryText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Search session, installation, device, user or build"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(([value, label]) => (
          <Pressable key={value} onPress={() => setFilter(value)} style={[styles.filterChip, filter === value && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator color={colors.blue} style={styles.loader} /> : null}
      {!loading && !displayed.length ? <View style={styles.noticeCard}><Text style={styles.body}>No matching diagnostic sessions.</Text></View> : null}

      <View style={styles.recordStack}>
        {displayed.map(record => {
          const selected = selectedId === record.id;
          const tone = statusTone(record);
          const events = [...(record.recentEvents || [])].sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || ''));
          const matchedUser = users.find(item => item.id === (record.userUid || record.reporterUid));
          const userLabel = matchedUser?.fullName || matchedUser?.displayName || matchedUser?.email || (record.isAnonymous ? 'Guest user' : 'Registered user');
          return (
            <View key={record.id} style={styles.recordCard}>
              <Pressable onPress={() => selectRecord(record)} style={styles.recordSummary}>
                <View style={styles.recordTitleRow}>
                  <View style={styles.recordTitleCopy}>
                    <Text selectable style={styles.sessionId}>{record.sessionId || record.id}</Text>
                    <Text selectable style={styles.installationId}>{record.installationId || 'Installation ID unavailable'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: tone.backgroundColor }]}>
                    <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>{record.platform || 'unknown'} · {record.deviceModel || 'Unknown device'} · OS {record.osVersion || 'unknown'}</Text>
                <Text style={styles.meta}>Version {record.appVersion || 'unknown'} · Build {record.buildNumber || 'unknown'} · {record.authenticationState || 'unknown user state'}</Text>
                <Text style={styles.meta}>User: {userLabel}</Text>
                <Text style={styles.meta}>Last seen {dateTimeLabel(record.lastSeenAt, record.lastSeenAtClient)}</Text>
                {record.currentScreen ? <Text style={styles.currentScreen}>Last screen: {record.currentScreen}</Text> : null}
              </Pressable>

              {selected ? (
                <View style={styles.details}>
                  <Text style={styles.detailLabel}>USER REFERENCE</Text>
                  <Text selectable style={styles.detailValue}>{record.userUid || record.reporterUid || 'Anonymous session'}</Text>
                  {record.previousSessionId ? <><Text style={styles.detailLabel}>PREVIOUS SESSION</Text><Text selectable style={styles.detailValue}>{record.previousSessionId}</Text></> : null}

                  <Text style={styles.detailLabel}>SAFE EVENT TIMELINE</Text>
                  {!events.length ? <Text style={styles.body}>No timeline events were recorded.</Text> : events.slice(0, 40).map((event, index) => (
                    <View key={`${event.at || 'event'}-${index}`} style={styles.eventRow}>
                      <View style={styles.eventDot} />
                      <View style={styles.eventCopy}>
                        <Text style={styles.eventCode}>{String(event.code || 'Diagnostic event').replace(/_/g, ' ')}</Text>
                        <Text style={styles.eventMeta}>{dateTimeLabel(event.at)}{eventLine(event) ? ` · ${eventLine(event)}` : ''}</Text>
                      </View>
                    </View>
                  ))}

                  <Text style={styles.detailLabel}>ADMIN NOTE</Text>
                  <TextInput
                    value={adminNote}
                    onChangeText={setAdminNote}
                    placeholder="Investigation notes (no passwords or sensitive personal data)"
                    placeholderTextColor={colors.muted}
                    multiline
                    textAlignVertical="top"
                    style={styles.noteInput}
                  />
                  <View style={styles.actionRow}>
                    <Pressable disabled={busyId === record.id} onPress={() => saveReview(record, 'investigating')} style={[styles.actionButton, styles.investigateButton]}><Text style={styles.actionButtonText}>Investigating</Text></Pressable>
                    <Pressable disabled={busyId === record.id} onPress={() => saveReview(record, 'resolved')} style={[styles.actionButton, styles.resolveButton]}><Text style={styles.actionButtonText}>Resolve</Text></Pressable>
                    <Pressable
                      disabled={busyId === record.id}
                      onPress={() => record.archived
                        ? saveReview(record, 'investigating', false)
                        : Alert.alert('Archive diagnostic?', 'The record will remain retained and can be restored later.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Archive', onPress: () => saveReview(record, 'archived', true) },
                        ])}
                      style={[styles.actionButton, styles.archiveButton]}
                    >
                      <Text style={[styles.actionButtonText, styles.archiveButtonText]}>{record.archived ? 'Restore' : 'Archive'}</Text>
                    </Pressable>
                  </View>
                  {busyId === record.id ? <ActivityIndicator color={colors.blue} /> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  introCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.blueSoft, borderWidth: 1, borderColor: 'rgba(37,99,235,0.12)' },
  cardTitle: { color: colors.navy, fontSize: 18, lineHeight: 23, fontWeight: '700' },
  body: { marginTop: spacing.xs, color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '400' },
  crashlyticsButton: { alignSelf: 'flex-start', marginTop: spacing.md, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: 99, backgroundColor: colors.blue },
  crashlyticsButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, minHeight: 62, alignItems: 'center', justifyContent: 'center', padding: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.navy, fontSize: 20, lineHeight: 24, fontWeight: '700' },
  statLabel: { marginTop: 2, color: colors.muted, fontSize: 10, fontWeight: '500' },
  searchInput: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 13, fontWeight: '400' },
  filterRow: { gap: spacing.sm, paddingRight: spacing.lg },
  filterChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 99, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  loader: { marginVertical: spacing.xl },
  noticeCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  errorCard: { padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fee9e7' },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  recordStack: { gap: spacing.md },
  recordCard: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow },
  recordSummary: { padding: spacing.lg },
  recordTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  recordTitleCopy: { flex: 1 },
  sessionId: { color: colors.navy, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  installationId: { marginTop: 2, color: colors.blue, fontSize: 11, lineHeight: 16, fontWeight: '500' },
  statusBadge: { minHeight: 28, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: 99 },
  statusText: { fontSize: 10, fontWeight: '600' },
  meta: { marginTop: spacing.xs, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '400' },
  currentScreen: { marginTop: spacing.sm, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  details: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fbfcfd', gap: spacing.sm },
  detailLabel: { marginTop: spacing.xs, color: colors.muted, fontSize: 9, letterSpacing: 0.8, fontWeight: '600' },
  detailValue: { color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: '400' },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  eventDot: { width: 7, height: 7, marginTop: 5, borderRadius: 4, backgroundColor: colors.blue },
  eventCopy: { flex: 1 },
  eventCode: { color: colors.text, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  eventMeta: { color: colors.muted, fontSize: 9, lineHeight: 14, fontWeight: '400' },
  noteInput: { minHeight: 86, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '400' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 99 },
  investigateButton: { backgroundColor: colors.blue },
  resolveButton: { backgroundColor: colors.tealDark },
  archiveButton: { backgroundColor: '#edf0f4' },
  actionButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  archiveButtonText: { color: colors.text },
});
