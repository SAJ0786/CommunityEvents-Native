import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import ScrollView from '../components/KeyboardAwareScrollView';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { clearUserNotifications, listenUserNotifications, markBusinessNotificationRead } from '../services/businessNotifications';
import { sendFeedbackMessage } from '../services/messaging';
import { listenBusinessModerationNotices, recordBusinessModerationAppeal } from '../services/businessSafety';
import { friendlyError } from '../utils/errors';
import { colors, radius, shadow, spacing } from '../theme';
import NativeBackButton from '../components/NativeBackButton';

function createdLabel(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Just now';
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function BusinessNotificationsScreen({ user, profile, onBack }) {
  const [rows, setRows] = useState([]);
  const [moderationRows, setModerationRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appealNotice, setAppealNotice] = useState(null);
  const [appealText, setAppealText] = useState('');
  const [appealBusy, setAppealBusy] = useState(false);
  const unreadCount = useMemo(() => rows.filter(item => item.read !== true).length, [rows]);

  useEffect(() => listenUserNotifications(
    user?.uid,
    notifications => { setRows(notifications); setLoading(false); setError(''); },
    nextError => { setLoading(false); setError(friendlyError(nextError, 'Could not load notifications.')); }
  ), [user?.uid]);

  useEffect(() => listenBusinessModerationNotices(
    user?.uid,
    setModerationRows,
    nextError => setError(friendlyError(nextError, 'Could not load moderation notices.'))
  ), [user?.uid]);

  const openNotification = async notification => {
    if (notification.read === true) return;
    setRows(current => current.map(item => item.id === notification.id ? { ...item, read: true } : item));
    try {
      await markBusinessNotificationRead(notification.id);
    } catch {
      setRows(current => current.map(item => item.id === notification.id ? { ...item, read: false } : item));
    }
  };

  const submitAppeal = async () => {
    setAppealBusy(true); setError('');
    try {
      await recordBusinessModerationAppeal({ notice: appealNotice, user, text: appealText });
      await sendFeedbackMessage({
        user,
        profile,
        city: profile?.defaultCity,
        target: 'cityAdmins',
        module: 'business',
        category: 'business-appeal',
        subject: `Moderation appeal: ${appealNotice.businessName}`,
        businessId: appealNotice.businessId,
        businessName: appealNotice.businessName,
        text: `BUSINESS MODERATION APPEAL\nBusiness: ${appealNotice.businessName}\nOriginal report: ${appealNotice.reportId}\nDecision: ${appealNotice.decision}\n\n${appealText.trim()}`,
      });
      setModerationRows(current => current.map(item => item.id === appealNotice.id ? { ...item, appealStatus: 'submitted', appealText } : item));
      setAppealNotice(null); setAppealText('');
    } catch (nextError) { setError(friendlyError(nextError, 'Could not submit the appeal.')); }
    finally { setAppealBusy(false); }
  };

  const clearNotifications = async () => {
    try {
      await clearUserNotifications(rows, user?.uid);
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not clear notifications.'));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <NativeBackButton onPress={onBack} style={styles.backButton} />
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>COMMUNITY CONNECT</Text>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are up to date'}</Text>
          {rows.length ? <Pressable accessibilityRole="button" accessibilityHint="Marks updates read and clears them from this device; moderation notices are retained." onPress={clearNotifications} style={styles.clearButton}><Text style={styles.clearButtonText}>Clear notifications on this device</Text></Pressable> : null}
        </View>
      </View>

      {loading ? <ActivityIndicator color={colors.teal} size="large" /> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {moderationRows.map(item => <View key={item.id} style={styles.moderationNotice}>
        <View style={styles.noticeHeading}><MaterialCommunityIcons color={colors.danger} name="shield-alert-outline" size={22} /><Text style={styles.cardTitle}>Listing moderation decision</Text></View>
        <Text style={styles.noticeBusiness}>{item.businessName}</Text>
        <Text style={styles.cardBody}>{item.reason}</Text>
        <Text style={styles.noticeDecision}>Decision: {String(item.decision || 'reviewed').replace('-', ' ')}</Text>
        {item.appealStatus === 'submitted' ? <Text style={styles.appealSubmitted}>Appeal submitted for administrator review.</Text> : <Pressable onPress={() => setAppealNotice(item)} style={styles.appealButton}><Text style={styles.appealButtonText}>Appeal Decision</Text></Pressable>}
      </View>)}
      {!loading && !error && !rows.length && !moderationRows.length ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons color={colors.teal} name="bell-check-outline" size={34} />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyText}>Updates from Community Events and the Business Directory will appear here.</Text>
        </View>
      ) : null}
      {rows.map(item => (
        <Pressable key={item.id} onPress={() => openNotification(item)} style={({ pressed }) => [styles.card, item.read !== true && styles.unreadCard, pressed && styles.pressed]}>
          <View style={[styles.iconWrap, item.read !== true && styles.unreadIcon]}>
            <MaterialCommunityIcons color={item.read !== true ? colors.surface : colors.tealDark} name={item.icon || 'bell-outline'} size={22} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleLine}>
              <Text style={[styles.cardTitle, item.read !== true && styles.unreadTitle]}>{item.title || 'Business update'}</Text>
              {item.read !== true ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.cardBody}>{item.body || ''}</Text>
            <Text style={styles.cardTime}>{createdLabel(item.createdAt)}</Text>
          </View>
        </Pressable>
      ))}
      <Modal transparent visible={Boolean(appealNotice)} animationType="fade" onRequestClose={() => setAppealNotice(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAppealNotice(null)} />
          <ScrollView automaticallyAdjustKeyboardInsets={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={styles.appealCard}><Text style={styles.appealTitle}>Appeal moderation decision</Text><Text style={styles.emptyText}>Explain why the business should be eligible to remain listed. The original decision and this appeal are retained.</Text><TextInput value={appealText} onChangeText={setAppealText} multiline maxLength={2500} placeholder="Grounds for appeal…" placeholderTextColor={colors.muted} style={styles.appealInput} /><Pressable disabled={appealBusy || appealText.trim().length < 20} onPress={submitAppeal} style={[styles.appealSubmit, (appealBusy || appealText.trim().length < 20) && styles.disabled]}><Text style={styles.appealSubmitText}>{appealBusy ? 'Submitting…' : 'Submit Appeal'}</Text></Pressable><Pressable onPress={() => setAppealNotice(null)} style={styles.appealCancel}><Text style={styles.appealCancelText}>Cancel</Text></Pressable></View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.tealSoft },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 },
  title: { marginTop: 4, color: colors.navy, fontSize: 25, fontWeight: '700' },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: '700' },
  clearButton: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  clearButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '700' },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  unreadCard: { borderColor: '#8bc9bf', backgroundColor: '#f2fbf9' },
  iconWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.tealSoft },
  unreadIcon: { backgroundColor: colors.teal },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, color: colors.navy, fontSize: 14, fontWeight: '700' },
  unreadTitle: { fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal },
  cardBody: { marginTop: 5, color: colors.text, fontSize: 13, lineHeight: 19 },
  cardTime: { marginTop: 8, color: colors.muted, fontSize: 10, fontWeight: '600' },
  emptyCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorCard: { padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff0ef' },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  moderationNotice: { padding: spacing.md, borderWidth: 1, borderColor: '#f1c7d4', borderRadius: radius.lg, backgroundColor: '#fff8fa', ...shadow },
  noticeHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeBusiness: { marginTop: spacing.sm, color: colors.navy, fontSize: 15, fontWeight: '700' },
  noticeDecision: { marginTop: spacing.sm, color: colors.danger, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  appealButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md, backgroundColor: '#3b82f6' },
  appealButtonText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  appealSubmitted: { marginTop: spacing.md, color: colors.tealDark, fontSize: 12, fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(12,20,38,0.45)' },
  appealCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  appealTitle: { color: colors.navy, fontSize: 20, fontWeight: '700' },
  appealInput: { minHeight: 130, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, textAlignVertical: 'top' },
  appealSubmit: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md, backgroundColor: '#3b82f6' },
  appealSubmitText: { color: colors.surface, fontWeight: '700' },
  appealCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  appealCancelText: { color: colors.tealDark, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
