import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { listenBusinessNotifications, markBusinessNotificationRead } from '../services/businessNotifications';
import { friendlyError } from '../utils/errors';
import { colors, radius, shadow, spacing } from '../theme';

function createdLabel(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : null;
  if (!date) return 'Just now';
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function BusinessNotificationsScreen({ user, onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const unreadCount = useMemo(() => rows.filter(item => item.read !== true).length, [rows]);

  useEffect(() => listenBusinessNotifications(
    user?.uid,
    notifications => { setRows(notifications); setLoading(false); setError(''); },
    nextError => { setLoading(false); setError(friendlyError(nextError, 'Could not load Directory notifications.')); }
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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <MaterialCommunityIcons color={colors.tealDark} name="arrow-left" size={23} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>BUSINESS DIRECTORY</Text>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'You are up to date'}</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator color={colors.teal} size="large" /> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {!loading && !error && !rows.length ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons color={colors.teal} name="bell-check-outline" size={34} />
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyText}>Business submissions, changes, promotions and approval updates will appear here.</Text>
        </View>
      ) : null}
      {rows.map(item => (
        <Pressable key={item.id} onPress={() => openNotification(item)} style={({ pressed }) => [styles.card, item.read !== true && styles.unreadCard, pressed && styles.pressed]}>
          <View style={[styles.iconWrap, item.read !== true && styles.unreadIcon]}>
            <MaterialCommunityIcons color={item.read !== true ? colors.surface : colors.tealDark} name={item.icon || 'bell-outline'} size={22} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleLine}>
              <Text style={styles.cardTitle}>{item.title || 'Business update'}</Text>
              {item.read !== true ? <View style={styles.unreadDot} /> : null}
            </View>
            <Text style={styles.cardBody}>{item.body || ''}</Text>
            <Text style={styles.cardTime}>{createdLabel(item.createdAt)}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.tealSoft },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 4, color: colors.navy, fontSize: 25, fontWeight: '900' },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 12, fontWeight: '700' },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  unreadCard: { borderColor: '#8bc9bf', backgroundColor: '#f2fbf9' },
  iconWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.tealSoft },
  unreadIcon: { backgroundColor: colors.teal },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1, color: colors.navy, fontSize: 14, fontWeight: '900' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal },
  cardBody: { marginTop: 5, color: colors.text, fontSize: 13, lineHeight: 19 },
  cardTime: { marginTop: 8, color: colors.muted, fontSize: 10, fontWeight: '800' },
  emptyCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.navy, fontSize: 17, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorCard: { padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff0ef' },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
