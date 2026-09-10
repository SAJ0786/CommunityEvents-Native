import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { listenBusinessThreads, listenThreadMessages, markBusinessThreadRead, sendBusinessReply, sendFeedbackMessage } from '../services/messaging';
import { setBusinessConversationBlocked } from '../services/businessSafety';
import { colors, radius, shadow, spacing } from '../theme';
import NativeBackButton from '../components/NativeBackButton';

function timeLabel(value) {
  const millis = value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value || ''));
  return millis ? new Date(millis).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
}

export default function BusinessInboxScreen({ user, profile, onBack }) {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState('');
  useEffect(() => listenBusinessThreads(user?.uid, rows => { setThreads(rows); setLoading(false); }, error => {
    setLoading(false);
    setStatus(error?.message || 'Could not load business messages.');
  }), [user?.uid]);
  useEffect(() => {
    if (!selected?.id) return;
    const refreshed = threads.find(item => item.id === selected.id);
    if (refreshed) setSelected(refreshed);
  }, [threads, selected?.id]);
  useEffect(() => {
    if (!selected?.id) { setMessages([]); return undefined; }
    markBusinessThreadRead(selected.id, user?.uid).catch(() => {});
    return listenThreadMessages('businessMessageThreads', selected.id, setMessages);
  }, [selected?.id, user?.uid]);
  const send = async () => {
    try { await sendBusinessReply({ thread: selected, user, profile, text: reply }); setReply(''); setStatus(''); }
    catch (error) { setStatus(error?.message || 'Could not send reply.'); }
  };
  const blocked = selected ? selected.adminBlocked === true || Object.values(selected.blockedBy || {}).some(Boolean) : false;
  const blockedByMe = selected ? selected.blockedBy?.[user?.uid] === true : false;
  const toggleBlock = async () => {
    try {
      await setBusinessConversationBlocked({ thread: selected, user, blocked: !blockedByMe });
      setSelected(current => ({ ...current, blockedBy: { ...(current?.blockedBy || {}), [user.uid]: !blockedByMe } }));
      setStatus(!blockedByMe ? 'Conversation blocked. Messages cannot be sent until you unblock it.' : 'Conversation unblocked.');
    } catch (error) { setStatus(error?.message || 'Could not update the conversation.'); }
  };
  const submitReport = async () => {
    if (reportText.trim().length < 10) { setStatus('Add at least 10 characters explaining the concern.'); return; }
    try {
      await sendFeedbackMessage({
        user,
        profile,
        city: selected.eventCity || profile?.defaultCity,
        target: 'cityAdmins',
        module: 'business',
        category: 'business-conversation-report',
        subject: `Conversation report: ${selected.businessName || 'Business'}`,
        businessId: selected.businessId,
        businessName: selected.businessName,
        reportedThreadId: selected.id,
        text: `BUSINESS CONVERSATION REPORT\nBusiness: ${selected.businessName || 'Business'}\nConversation ID: ${selected.id}\n\n${reportText.trim()}`,
      });
      setReportText(''); setReporting(false); setStatus('Conversation reported privately to the directory team.');
    } catch (error) { setStatus(error?.message || 'Could not submit this report.'); }
  };
  if (selected) return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <View style={styles.header}><NativeBackButton accessibilityLabel="Back to inbox" onPress={() => setSelected(null)} /><View style={styles.headerCopy}><Text style={styles.title}>{selected.businessName}</Text><Text style={styles.subtitle}>Private business conversation</Text></View></View>
      <View style={styles.safetyRow}>
        <Pressable onPress={toggleBlock} style={styles.safetyButton}><Text style={styles.safetyButtonText}>{blockedByMe ? 'Unblock' : 'Block'}</Text></Pressable>
        <Pressable onPress={() => setReporting(value => !value)} style={styles.safetyButton}><Text style={styles.safetyButtonText}>Report</Text></Pressable>
      </View>
      {reporting ? <View style={styles.reportCard}><Text style={styles.reportTitle}>Report this conversation</Text><Text style={styles.reportHelp}>Explain the safety, fraud or conduct concern. The report is private and retained for audit.</Text><TextInput value={reportText} onChangeText={setReportText} multiline maxLength={2500} placeholder="What should the directory team review?" placeholderTextColor={colors.muted} style={styles.input} /><Pressable onPress={submitReport} style={styles.reportSend}><Text style={styles.sendText}>Submit Report</Text></Pressable></View> : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages}>{messages.map(message => { const mine = message.senderUid === user?.uid; return <View key={message.id} style={[styles.bubble, mine && styles.bubbleMine]}><Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text><Text style={[styles.time, mine && styles.timeMine]}>{timeLabel(message.createdAt)}</Text></View>; })}</ScrollView>
      <View style={styles.composer}>{blocked ? <Text style={styles.blockedText}>{selected.adminBlocked ? 'An administrator has blocked this conversation.' : 'This conversation is blocked.'}</Text> : <><TextInput value={reply} onChangeText={setReply} multiline placeholder="Write a reply..." placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={!reply.trim()} onPress={send} style={[styles.send, !reply.trim() && styles.disabled]}><Text style={styles.sendText}>Send</Text></Pressable></>}{status ? <Text style={styles.error}>{status}</Text> : null}</View>
    </KeyboardAvoidingView>
  );
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <NativeBackButton accessibilityLabel="Back to directory" onPress={onBack} />
      <Text style={styles.eyebrow}>COMMUNITY BUSINESSES AUSTRALIA</Text><Text style={styles.pageTitle}>Business Inbox</Text><Text style={styles.pageText}>Messages sent through Contact Business are kept separate from Events Inbox.</Text>
      {loading ? <Text style={styles.pageText}>Loading business messages…</Text> : null}
      {!loading && threads.length ? threads.map(thread => <Pressable key={thread.id} onPress={() => setSelected(thread)} style={styles.thread}><View style={styles.avatar}><Text style={styles.avatarText}>{String(thread.businessName || 'B')[0]}</Text></View><View style={styles.threadCopy}><Text style={styles.threadTitle}>{thread.businessName}</Text><Text numberOfLines={1} style={styles.threadText}>{thread.lastMessage}</Text><Text style={styles.time}>{timeLabel(thread.updatedAt)}</Text></View>{Number(thread.unreadBy?.[user?.uid] || 0) ? <View style={styles.unread}><Text style={styles.unreadText}>{thread.unreadBy[user.uid]}</Text></View> : null}</Pressable>) : null}
      {!loading && !threads.length ? <View style={styles.empty}><Text style={styles.emptyIcon}>{'\u{1F4E5}'}</Text><Text style={styles.threadTitle}>No business messages yet</Text><Text style={styles.pageText}>New owner and customer conversations will appear here.</Text></View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, list: { padding: spacing.lg, paddingBottom: 48 },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }, headerCopy: { flex: 1 },
  back: { color: colors.tealDark, fontSize: 13, fontWeight: '700' }, title: { color: colors.navy, fontSize: 17, fontWeight: '700' }, subtitle: { color: colors.muted, fontSize: 11 },
  eyebrow: { marginTop: spacing.lg, color: colors.tealDark, fontSize: 10, fontWeight: '700', letterSpacing: 1 }, pageTitle: { marginTop: 4, color: colors.navy, fontSize: 27, fontWeight: '700' }, pageText: { marginTop: 5, color: colors.muted, fontSize: 13, lineHeight: 19 },
  thread: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow }, avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#fff0f6' }, avatarText: { color: '#a33667', fontSize: 18, fontWeight: '700' }, threadCopy: { flex: 1 }, threadTitle: { color: colors.navy, fontSize: 14, fontWeight: '700' }, threadText: { marginTop: 3, color: colors.muted, fontSize: 12 }, time: { marginTop: 4, color: colors.muted, fontSize: 9 }, unread: { minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#d43867' }, unreadText: { color: colors.surface, fontSize: 10, fontWeight: '700' },
  messages: { padding: spacing.lg, gap: spacing.sm }, bubble: { maxWidth: '82%', alignSelf: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }, bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.teal }, messageText: { color: colors.text, fontSize: 14, lineHeight: 20 }, messageTextMine: { color: colors.surface }, timeMine: { color: '#d9fffa' },
  composer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }, input: { minHeight: 64, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, textAlignVertical: 'top' }, send: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.teal }, sendText: { color: colors.surface, fontWeight: '700' }, disabled: { opacity: 0.45 }, error: { marginTop: 5, color: colors.danger, fontSize: 11, fontWeight: '600' }, empty: { alignItems: 'center', marginTop: spacing.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }, emptyIcon: { fontSize: 34 },
  safetyRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  safetyButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.background },
  safetyButtonText: { color: colors.tealDark, fontSize: 12, fontWeight: '600' },
  reportCard: { marginHorizontal: spacing.lg, padding: spacing.md, borderWidth: 1, borderColor: '#f1c7d4', borderRadius: radius.md, backgroundColor: '#fff8fa' },
  reportTitle: { color: colors.navy, fontSize: 15, fontWeight: '700' },
  reportHelp: { marginVertical: spacing.sm, color: colors.muted, fontSize: 12, lineHeight: 18 },
  reportSend: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.danger },
  blockedText: { padding: spacing.md, borderRadius: radius.md, color: colors.danger, backgroundColor: '#fff0ef', fontSize: 12, lineHeight: 18 },
});
