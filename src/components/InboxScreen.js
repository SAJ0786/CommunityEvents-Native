import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import {
  listenHostThreads,
  listenThreadMessages,
  markHostThreadRead,
  sendHostReply,
} from '../services/messaging';

const formatDateTime = value => {
  if (!value) return '';
  let date = null;
  if (typeof value?.toDate === 'function') date = value.toDate();
  else if (typeof value?.seconds === 'number') date = new Date(value.seconds * 1000);
  else date = new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function InboxScreen({ user, profile, onBack }) {
  const [threads, setThreads] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return listenHostThreads(user.uid, rows => {
      setThreads(rows);
      setSelectedId(current => current || rows[0]?.id || '');
    });
  }, [user?.uid]);

  const selected = useMemo(
    () => threads.find(thread => thread.id === selectedId) || null,
    [threads, selectedId]
  );

  useEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      return undefined;
    }
    markHostThreadRead(selected.id, user?.uid).catch(() => {});
    return listenThreadMessages('hostMessageThreads', selected.id, setMessages);
  }, [selected?.id, user?.uid]);

  const handleReply = async () => {
    setStatus('');
    setSending(true);
    try {
      await sendHostReply({ thread: selected, user, profile, text: reply });
      setReply('');
      setStatus('Reply sent.');
    } catch (error) {
      setStatus(error.message || 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  if (!user?.uid || user?.isAnonymous) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.centerCard}>
          <Text style={styles.title}>Inbox</Text>
          <Text style={styles.emptyText}>Please sign in to use your inbox.</Text>
          <Pressable onPress={onBack} style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
            <Text style={styles.lightButtonText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Inbox</Text>
            <Text style={styles.subtitle}>Messages between event hosts and community members.</Text>
          </View>
          <Pressable onPress={onBack} style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
            <Text style={styles.lightButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>

      {threads.length === 0 ? (
        <View style={styles.centerCard}>
          <Text style={styles.sectionTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>Host messages sent from event cards will appear here.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Messages</Text>
            {threads.map(thread => {
              const unread = Number(thread.unreadBy?.[user.uid] || 0);
              const active = selectedId === thread.id;
              return (
                <Pressable
                  key={thread.id}
                  onPress={() => setSelectedId(thread.id)}
                  style={({ pressed }) => [styles.threadCard, active && styles.threadCardActive, pressed && styles.pressed]}
                >
                  <View style={styles.threadHeader}>
                    <Text style={styles.threadTitle}>{thread.eventTitle || 'Event message'}</Text>
                    {unread > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.threadPreview}>{thread.lastMessage || 'No message preview'}</Text>
                </Pressable>
              );
            })}
          </View>

          {selected ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{selected.eventTitle || 'Event message'}</Text>
              <Text style={styles.selectedMeta}>Host: {selected.hostName || 'Host'}</Text>

              <View style={styles.messageList}>
                {messages.map(message => {
                  const mine = message.senderUid === user.uid;
                  return (
                    <View key={message.id} style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                      <Text style={[styles.messageSender, mine && styles.messageSenderMine]}>
                        {mine ? 'You' : (message.senderName || 'Sender')}
                      </Text>
                      <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text>
                      <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{formatDateTime(message.createdAt)}</Text>
                    </View>
                  );
                })}
              </View>

              <TextInput
                multiline
                value={reply}
                onChangeText={setReply}
                placeholder="Write a reply..."
                placeholderTextColor={colors.muted}
                style={styles.textarea}
                textAlignVertical="top"
              />
              <Pressable
                onPress={handleReply}
                disabled={sending || !reply.trim()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (sending || !reply.trim()) && styles.disabled]}
              >
                {sending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Send Reply</Text>}
              </Pressable>
              {status ? <Text style={styles.statusText}>{status}</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  centerCard: { padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', gap: spacing.md, ...shadow },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  sectionTitle: { color: colors.navy, fontSize: 18, fontWeight: '900', marginBottom: spacing.sm },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  lightButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  lightButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  threadCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, marginTop: spacing.sm },
  threadCardActive: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'center' },
  threadTitle: { color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 },
  unreadBadge: { backgroundColor: colors.danger, borderRadius: 99, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
  threadPreview: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  selectedMeta: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  messageList: { gap: spacing.sm, marginBottom: spacing.md },
  messageBubble: { maxWidth: '86%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 14 },
  messageBubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.teal },
  messageBubbleOther: { alignSelf: 'flex-start', backgroundColor: '#f3f7f6' },
  messageSender: { color: colors.text, fontSize: 12, fontWeight: '900', marginBottom: 4 },
  messageSenderMine: { color: colors.surface },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  messageTextMine: { color: colors.surface },
  messageTime: { color: colors.muted, fontSize: 11, marginTop: 6 },
  messageTimeMine: { color: 'rgba(255,255,255,0.72)' },
  textarea: { minHeight: 110, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surface, fontSize: 15 },
  primaryButton: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  statusText: { color: colors.tealDark, fontSize: 13, fontWeight: '800', marginTop: spacing.md },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});
