import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  listenBusinessSupportThreads,
  listenThreadMessages,
  markFeedbackThreadRead,
  sendFeedbackReply,
} from '../services/messaging';
import { decideBusinessSafetyReport, isBusinessSafetyThread } from '../services/businessSafety';
import { colors, radius, shadow, spacing } from '../theme';
import NativeBackButton from '../components/NativeBackButton';

function timeLabel(value) {
  const millis = value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value || ''));
  return millis ? new Date(millis).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

function threadTitle(thread = {}) {
  if (thread.category === 'business-report') return `Report: ${thread.businessName || 'Business'}`;
  if (thread.category === 'business-conversation-report') return `Conversation report: ${thread.businessName || 'Business'}`;
  if (thread.category === 'business-appeal') return `Appeal: ${thread.businessName || 'Business'}`;
  if (thread.category === 'directory-contact') return thread.subject || 'Contact Us';
  return thread.subject || thread.businessName || 'Business Directory message';
}

export default function BusinessSupportInboxScreen({ user, profile, onBack }) {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const [moderationReason, setModerationReason] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superAdmin';

  useEffect(() => listenBusinessSupportThreads(user, profile, setThreads), [profile?.adminCity, profile?.defaultCity, profile?.role, user?.isAnonymous, user?.uid]);
  useEffect(() => {
    if (!selected?.id) return;
    const refreshed = threads.find(item => item.id === selected.id);
    if (refreshed) setSelected(refreshed);
  }, [threads, selected?.id]);
  useEffect(() => {
    if (!selected?.id) { setMessages([]); return undefined; }
    markFeedbackThreadRead(selected, user, profile).catch(() => {});
    return listenThreadMessages('adminFeedbackThreads', selected.id, setMessages);
  }, [profile?.adminCity, profile?.defaultCity, profile?.role, selected, user?.uid]);

  const send = async () => {
    setStatus('');
    try {
      await sendFeedbackReply({ thread: selected, user, profile, text: reply });
      setReply('');
    } catch (error) {
      setStatus(error?.message || 'Could not send the reply.');
    }
  };

  const decide = async decision => {
    setStatus('');
    setModerationBusy(true);
    try {
      await decideBusinessSafetyReport({ thread: selected, user, profile, decision, reason: moderationReason });
      setSelected(current => ({ ...current, moderationStatus: decision, moderationDecision: decision, moderationReason }));
      setModerationReason('');
      setStatus('Moderation decision recorded. The audit record and owner notice were retained.');
    } catch (error) {
      setStatus(error?.message || 'Could not record the moderation decision.');
    } finally { setModerationBusy(false); }
  };

  if (!user?.uid || user.isAnonymous) return (
    <ScrollView contentContainerStyle={styles.list}>
      <NativeBackButton accessibilityLabel="Back to directory" onPress={onBack} />
      <Text style={styles.pageTitle}>Business Feedback</Text>
      <View style={styles.empty}><Text style={styles.emptyIcon}>🔒</Text><Text style={styles.threadTitle}>Sign in required</Text><Text style={styles.pageText}>Sign in to view reports and messages you have sent.</Text></View>
    </ScrollView>
  );

  if (selected) return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <NativeBackButton accessibilityLabel="Back to feedback" onPress={() => setSelected(null)} />
        <View style={styles.headerCopy}><Text style={styles.title}>{threadTitle(selected)}</Text><Text style={styles.subtitle}>{isBusinessSafetyThread(selected) ? 'Private safety case for directory administrators' : 'Directory support conversation'}</Text></View>
      </View>
      {isAdmin && isBusinessSafetyThread(selected) ? <View style={styles.moderationCard}>
        <View style={styles.moderationHeading}><Text style={styles.moderationTitle}>Safety review</Text><View style={styles.statusPill}><Text style={styles.statusPillText}>{String(selected.moderationStatus || 'open').replace('-', ' ')}</Text></View></View>
        {selected.moderationReason ? <Text style={styles.previousDecision}>Latest reason: {selected.moderationReason}</Text> : null}
        <TextInput value={moderationReason} onChangeText={setModerationReason} multiline maxLength={1500} placeholder="Record facts, checks and the reason for this decision…" placeholderTextColor={colors.muted} style={styles.input} />
        <View style={styles.moderationActions}>
          <Pressable disabled={moderationBusy} onPress={() => decide('under-review')} style={styles.reviewButton}><Text style={styles.reviewButtonText}>Under Review</Text></Pressable>
          <Pressable disabled={moderationBusy} onPress={() => decide('dismissed')} style={styles.reviewButton}><Text style={styles.reviewButtonText}>Dismiss</Text></Pressable>
          {selected.category === 'business-conversation-report' ? <Pressable disabled={moderationBusy} onPress={() => decide('conversation-blocked')} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Block Conversation</Text></Pressable> : null}
          {selected.businessId ? <Pressable disabled={moderationBusy} onPress={() => decide('takedown')} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Archive Listing</Text></Pressable> : null}
          <Pressable disabled={moderationBusy} onPress={() => decide('closed')} style={styles.reviewButton}><Text style={styles.reviewButtonText}>Close Review</Text></Pressable>
        </View>
      </View> : null}
      <ScrollView contentContainerStyle={styles.messages}>{messages.map(message => { const mine = message.senderUid === user.uid; return <View key={message.id} style={[styles.bubble, mine && styles.bubbleMine]}><Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text><Text style={[styles.time, mine && styles.timeMine]}>{timeLabel(message.createdAt)}</Text></View>; })}</ScrollView>
      <View style={styles.composer}><TextInput value={reply} onChangeText={setReply} multiline placeholder={isAdmin ? 'Write an administrator reply...' : 'Write a reply...'} placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!reply.trim()} onPress={send} style={[styles.send, !reply.trim() && styles.disabled]}><Text style={styles.sendText}>Send Reply</Text></Pressable>{status ? <Text style={styles.error}>{status}</Text> : null}</View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <NativeBackButton accessibilityLabel="Back to directory" onPress={onBack} />
      <Text style={styles.eyebrow}>COMMUNITY BUSINESSES AUSTRALIA</Text>
      <Text style={styles.pageTitle}>Business Feedback</Text>
      <Text style={styles.pageText}>{isAdmin ? 'Business reports and Contact Us messages are kept here, separate from Events Feedback.' : 'Your Business Directory reports and Contact Us conversations appear here.'}</Text>
      {threads.length ? threads.map(thread => <Pressable key={thread.id} onPress={() => setSelected(thread)} style={styles.thread}><View style={[styles.avatar, thread.category === 'business-report' && styles.reportAvatar]}><Text style={styles.avatarText}>{thread.category === 'business-report' ? '⚑' : '💬'}</Text></View><View style={styles.threadCopy}><Text style={styles.threadTitle}>{threadTitle(thread)}</Text><Text numberOfLines={1} style={styles.threadText}>{thread.lastMessage}</Text><Text style={styles.time}>{[thread.senderName, timeLabel(thread.updatedAt)].filter(Boolean).join(' · ')}</Text></View></Pressable>) : <View style={styles.empty}><Text style={styles.emptyIcon}>📋</Text><Text style={styles.threadTitle}>No Business feedback yet</Text><Text style={styles.pageText}>Business reports and Contact Us messages will appear here.</Text></View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 48 },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  back: { color: colors.tealDark, fontSize: 13, fontWeight: '700' },
  title: { color: colors.navy, fontSize: 17, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 11 },
  eyebrow: { marginTop: spacing.lg, color: colors.tealDark, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  pageTitle: { marginTop: 4, color: colors.navy, fontSize: 27, fontWeight: '700' },
  pageText: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  thread: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.tealSoft },
  reportAvatar: { backgroundColor: '#fff0f0' },
  avatarText: { fontSize: 18 },
  threadCopy: { flex: 1 },
  threadTitle: { color: colors.navy, fontSize: 14, fontWeight: '700' },
  threadText: { marginTop: 3, color: colors.muted, fontSize: 12 },
  time: { marginTop: 4, color: colors.muted, fontSize: 9 },
  messages: { padding: spacing.lg, gap: spacing.sm },
  bubble: { maxWidth: '82%', alignSelf: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.teal },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  messageTextMine: { color: colors.surface },
  timeMine: { color: '#d9fffa' },
  composer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { minHeight: 64, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, textAlignVertical: 'top' },
  send: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.teal },
  sendText: { color: colors.surface, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { marginTop: 5, color: colors.danger, fontSize: 11, fontWeight: '600' },
  moderationCard: { margin: spacing.md, marginBottom: 0, padding: spacing.md, borderWidth: 1, borderColor: '#bfded7', borderRadius: radius.md, backgroundColor: '#f5fbfa' },
  moderationHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  moderationTitle: { color: colors.navy, fontSize: 15, fontWeight: '700' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: colors.tealSoft },
  statusPillText: { color: colors.tealDark, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  previousDecision: { marginVertical: spacing.sm, color: colors.text, fontSize: 12, lineHeight: 18 },
  moderationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  reviewButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 19, backgroundColor: colors.surface },
  reviewButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '600' },
  dangerButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 19, backgroundColor: colors.danger },
  dangerButtonText: { color: colors.surface, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: spacing.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyIcon: { marginBottom: spacing.sm, fontSize: 34 },
});
