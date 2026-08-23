import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  listenBusinessSupportThreads,
  listenThreadMessages,
  markFeedbackThreadRead,
  sendFeedbackReply,
} from '../services/messaging';
import { colors, radius, shadow, spacing } from '../theme';

function timeLabel(value) {
  const millis = value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value || ''));
  return millis ? new Date(millis).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

function threadTitle(thread = {}) {
  if (thread.category === 'business-report') return `Report: ${thread.businessName || 'Business'}`;
  if (thread.category === 'directory-contact') return thread.subject || 'Contact Us';
  return thread.subject || thread.businessName || 'Business Directory message';
}

export default function BusinessSupportInboxScreen({ user, profile, onBack }) {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superAdmin';

  useEffect(() => listenBusinessSupportThreads(user, profile, setThreads), [profile?.adminCity, profile?.defaultCity, profile?.role, user?.isAnonymous, user?.uid]);
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

  if (!user?.uid || user.isAnonymous) return (
    <ScrollView contentContainerStyle={styles.list}>
      <Pressable onPress={onBack}><Text style={styles.back}>{'‹'} Back to Directory</Text></Pressable>
      <Text style={styles.pageTitle}>Business Feedback</Text>
      <View style={styles.empty}><Text style={styles.emptyIcon}>🔒</Text><Text style={styles.threadTitle}>Sign in required</Text><Text style={styles.pageText}>Sign in to view reports and messages you have sent.</Text></View>
    </ScrollView>
  );

  if (selected) return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => setSelected(null)}><Text style={styles.back}>{'‹'} Feedback</Text></Pressable>
        <View style={styles.headerCopy}><Text style={styles.title}>{threadTitle(selected)}</Text><Text style={styles.subtitle}>{selected.category === 'business-report' ? 'Private report to directory administrators' : 'Directory support conversation'}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.messages}>{messages.map(message => { const mine = message.senderUid === user.uid; return <View key={message.id} style={[styles.bubble, mine && styles.bubbleMine]}><Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text><Text style={[styles.time, mine && styles.timeMine]}>{timeLabel(message.createdAt)}</Text></View>; })}</ScrollView>
      <View style={styles.composer}><TextInput value={reply} onChangeText={setReply} multiline placeholder={isAdmin ? 'Write an administrator reply...' : 'Write a reply...'} placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!reply.trim()} onPress={send} style={[styles.send, !reply.trim() && styles.disabled]}><Text style={styles.sendText}>Send Reply</Text></Pressable>{status ? <Text style={styles.error}>{status}</Text> : null}</View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Pressable onPress={onBack}><Text style={styles.back}>{'‹'} Back to Directory</Text></Pressable>
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
  back: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  title: { color: colors.navy, fontSize: 17, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 11 },
  eyebrow: { marginTop: spacing.lg, color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  pageTitle: { marginTop: 4, color: colors.navy, fontSize: 27, fontWeight: '900' },
  pageText: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  thread: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.tealSoft },
  reportAvatar: { backgroundColor: '#fff0f0' },
  avatarText: { fontSize: 18 },
  threadCopy: { flex: 1 },
  threadTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
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
  sendText: { color: colors.surface, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  error: { marginTop: 5, color: colors.danger, fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', marginTop: spacing.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyIcon: { marginBottom: spacing.sm, fontSize: 34 },
});
