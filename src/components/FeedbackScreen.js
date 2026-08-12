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
import { CITY_OPTIONS, DEFAULT_CITY, cityLabel, normalizeCity } from '../utils/cities';
import { colors, radius, shadow, spacing } from '../theme';
import {
  getAdminCity,
  isAdminRole,
  isSuperAdminRole,
  listenAdminFeedbackThreads,
  listenOwnFeedbackThreads,
  listenThreadMessages,
  markFeedbackThreadRead,
  sendFeedbackMessage,
  sendFeedbackReaction,
  sendFeedbackReply,
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

const shortText = (value, max = 90) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

function SelectPills({ options, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && styles.pressed]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function FeedbackScreen({ user, profile, selectedCity, onBack }) {
  const isRegisteredUser = Boolean(user?.uid && !user?.isAnonymous);
  const defaultCity = normalizeCity(selectedCity || profile?.defaultCity || DEFAULT_CITY);
  const [target, setTarget] = useState('cityAdmins');
  const [city, setCity] = useState(defaultCity);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [adminThreads, setAdminThreads] = useState([]);
  const [ownThreads, setOwnThreads] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');

  useEffect(() => setCity(defaultCity), [defaultCity]);

  useEffect(() => {
    if (!isRegisteredUser) return undefined;
    return listenOwnFeedbackThreads(user.uid, setOwnThreads);
  }, [isRegisteredUser, user?.uid]);

  useEffect(() => {
    if (!isAdminRole(profile?.role)) return undefined;
    return listenAdminFeedbackThreads(profile, setAdminThreads);
  }, [profile]);

  const combinedThreads = useMemo(() => {
    const map = new Map();
    [...adminThreads, ...ownThreads].forEach(thread => map.set(thread.id, thread));
    return [...map.values()].sort((a, b) => {
      const am = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds || 0;
      const bm = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds || 0;
      return bm - am;
    });
  }, [adminThreads, ownThreads]);

  useEffect(() => {
    setSelectedId(current => current || combinedThreads[0]?.id || '');
  }, [combinedThreads]);

  const selected = useMemo(
    () => combinedThreads.find(thread => thread.id === selectedId) || null,
    [combinedThreads, selectedId]
  );

  useEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      return undefined;
    }
    markFeedbackThreadRead(selected, user, profile).catch(() => {});
    return listenThreadMessages('adminFeedbackThreads', selected.id, setMessages);
  }, [selected, user, profile]);

  const selectedHasRegisteredSender = Boolean(selected?.senderUid);
  const canReply = selectedHasRegisteredSender && selected && isAdminRole(profile?.role) && (
    isSuperAdminRole(profile?.role) ||
    (selected.target === 'cityAdmins' && selected.city === getAdminCity(profile))
  );

  const handleSend = async () => {
    setStatus('');
    setSending(true);
    try {
      await sendFeedbackMessage({ user, profile, text, city, target });
      setText('');
      setStatus('Your message has been sent.');
    } catch (error) {
      setStatus(error.message || 'Could not send feedback.');
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    setStatus('');
    setSending(true);
    try {
      await sendFeedbackReply({ thread: selected, user, profile, text: reply });
      setReply('');
      setStatus('Reply sent.');
    } catch (error) {
      setStatus(error.message || 'Could not send reply.');
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async reaction => {
    if (!selected) return;
    setStatus('');
    setSending(true);
    try {
      await sendFeedbackReaction({ thread: selected, user, profile, reaction });
      setStatus(`${reaction} reaction sent.`);
    } catch (error) {
      setStatus(error.message || 'Could not send reaction.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.introCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Feedback</Text>
            <Text style={styles.subtitle}>Send app feedback or a support message to city admins or super admins.</Text>
          </View>
          <Pressable onPress={onBack} style={({ pressed }) => [styles.lightButton, pressed && styles.pressed]}>
            <Text style={styles.lightButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Send Message</Text>
        <Text style={styles.label}>Send to</Text>
        <SelectPills
          value={target}
          onChange={setTarget}
          options={[
            { value: 'cityAdmins', label: 'Admins in selected city' },
            { value: 'superAdmins', label: 'Super admins' },
          ]}
        />

        {target === 'cityAdmins' ? (
          <>
            <Text style={[styles.label, styles.labelSpaced]}>City</Text>
            <SelectPills
              value={city}
              onChange={setCity}
              options={CITY_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
            />
          </>
        ) : null}

        <Text style={[styles.label, styles.labelSpaced]}>Message</Text>
        <TextInput
          multiline
          placeholder="Write your feedback or support message..."
          placeholderTextColor={colors.muted}
          style={styles.textarea}
          textAlignVertical="top"
          value={text}
          onChangeText={setText}
        />

        <Pressable
          disabled={sending || !text.trim()}
          onPress={handleSend}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (sending || !text.trim()) && styles.disabled]}
        >
          {sending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Send Message</Text>}
        </Pressable>

        {status ? <Text style={styles.statusText}>{status}</Text> : null}
      </View>

      {(isRegisteredUser || isAdminRole(profile?.role)) && combinedThreads.length > 0 ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Feedback Messages</Text>
            {combinedThreads.map(thread => {
              const senderUnread = user?.uid ? Number(thread.unreadBy?.[user.uid] || 0) : 0;
              const adminUnread = isSuperAdminRole(profile?.role)
                ? Number(thread.unreadForSuperAdmins || 0)
                : profile?.role === 'admin'
                  ? Number(thread.unreadForCityAdmins || 0)
                  : 0;
              const unread = senderUnread + adminUnread;
              const cityText = thread.target === 'superAdmins' ? 'Super Admins' : cityLabel(thread.city);
              const isGuestThread = !thread.senderUid;
              const active = selectedId === thread.id;
              return (
                <Pressable
                  key={thread.id}
                  onPress={() => setSelectedId(thread.id)}
                  style={({ pressed }) => [styles.threadCard, active && styles.threadCardActive, pressed && styles.pressed]}
                >
                  <View style={styles.threadHeader}>
                    <Text style={styles.threadTitle}>{thread.senderName || 'Sender'}</Text>
                    {unread > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.threadMetaRow}>
                    <Text style={styles.threadMeta}>{cityText}</Text>
                    {isGuestThread ? <Text style={styles.guestBadge}>Guest</Text> : null}
                    <Text style={styles.threadMeta}>{formatDateTime(thread.updatedAt || thread.createdAt)}</Text>
                  </View>
                  <Text style={styles.threadPreview}>{shortText(thread.lastMessage || 'No preview')}</Text>
                </Pressable>
              );
            })}
          </View>

          {selected ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {selected.target === 'superAdmins' ? 'Super Admin Feedback' : `${cityLabel(selected.city)} Feedback`}
              </Text>
              <Text style={styles.selectedMeta}>
                From {selected.senderName || 'Sender'}{!selectedHasRegisteredSender ? ' - guest feedback, one-way message' : ''}
              </Text>

              <View style={styles.messageList}>
                {messages.map(message => {
                  const mine = message.senderUid && message.senderUid === user?.uid;
                  const canReact = selectedHasRegisteredSender && isRegisteredUser && !mine && message.kind !== 'reaction';
                  return (
                    <View key={message.id} style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                      <Text style={[styles.messageSender, mine && styles.messageSenderMine]}>
                        {mine ? 'You' : (message.senderName || 'Sender')}
                      </Text>
                      <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text>
                      <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{formatDateTime(message.createdAt)}</Text>
                      {canReact ? (
                        <View style={styles.reactionRow}>
                          {['Like', 'Love', 'Unlike'].map(reaction => (
                            <Pressable
                              key={reaction}
                              disabled={sending}
                              onPress={() => handleReaction(reaction)}
                              style={({ pressed }) => [styles.reactionButton, pressed && styles.pressed, sending && styles.disabled]}
                            >
                              <Text style={styles.reactionButtonText}>
                                {reaction === 'Like' ? '👍 Like' : reaction === 'Love' ? '❤️ Love' : '👎 Unlike'}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {canReply ? (
                <>
                  <TextInput
                    multiline
                    placeholder="Write an admin reply..."
                    placeholderTextColor={colors.muted}
                    style={styles.textarea}
                    textAlignVertical="top"
                    value={reply}
                    onChangeText={setReply}
                  />
                  <Pressable
                    disabled={sending || !reply.trim()}
                    onPress={handleReply}
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (sending || !reply.trim()) && styles.disabled]}
                  >
                    {sending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Send Reply</Text>}
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  introCard: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerCopy: { flex: 1 },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  sectionTitle: { color: colors.navy, fontSize: 18, fontWeight: '900', marginBottom: spacing.sm },
  label: { color: colors.muted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 6 },
  labelSpaced: { marginTop: spacing.md },
  pillRow: { gap: spacing.sm },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface },
  pillActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  pillText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  pillTextActive: { color: colors.surface },
  textarea: { minHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.surface, fontSize: 15 },
  primaryButton: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  lightButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  lightButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  statusText: { color: colors.tealDark, fontSize: 13, fontWeight: '800', marginTop: spacing.md },
  disabled: { opacity: 0.5 },
  threadCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, marginTop: spacing.sm },
  threadCardActive: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  threadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  threadTitle: { color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
  threadMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  threadMeta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  guestBadge: { color: '#92400e', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, fontSize: 11, fontWeight: '900' },
  threadPreview: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 6 },
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
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  reactionButton: { borderWidth: 1, borderColor: 'rgba(15,118,110,0.22)', backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  reactionButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.78 },
});
