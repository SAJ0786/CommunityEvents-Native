import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  approveBusinessPromotion,
  listenBusinessPromotionsForAdmin,
  listenBusinessesForAdmin,
  rejectBusinessPromotion,
} from '../services/businesses';
import { friendlyError } from '../utils/errors';
import { colors, radius, shadow, spacing } from '../theme';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Changes' },
  { value: 'all', label: 'All' },
];

function PromotionCard({ promotion, business, busy, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const [boosted, setBoosted] = useState(Boolean(promotion.boosted));
  const [reason, setReason] = useState(promotion.rejectionReason || '');

  useEffect(() => {
    setBoosted(Boolean(promotion.boosted));
    setReason(promotion.rejectionReason || '');
  }, [promotion.boosted, promotion.id, promotion.rejectionReason]);

  const approve = () => Alert.alert(
    promotion.status === 'active' ? 'Update promotion?' : 'Approve promotion?',
    `${promotion.title} will appear publicly for ${business?.name || 'the linked business'}.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => onApprove?.(promotion, { boosted }) },
    ]
  );

  const reject = () => {
    if (reason.trim().length < 10) {
      Alert.alert('Add a reason', 'Enter at least 10 characters so the owner knows what to change.');
      return;
    }
    Alert.alert('Request changes?', 'The promotion will remain private.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request Changes', style: 'destructive', onPress: () => onReject?.(promotion, reason.trim()) },
    ]);
  };

  return (
    <View style={[styles.card, expanded && styles.cardExpanded]}>
      <Pressable onPress={() => setExpanded(current => !current)} style={styles.cardHeader}>
        {promotion.imageUrl ? <Image source={{ uri: promotion.imageUrl }} resizeMode="cover" style={styles.image} /> : <View style={styles.imageFallback}><Text style={styles.imageFallbackText}>{'\u{1F3F7}\uFE0F'}</Text></View>}
        <View style={styles.headerCopy}>
          <Text numberOfLines={2} style={styles.title}>{promotion.title}</Text>
          <Text numberOfLines={1} style={styles.business}>{business?.name || 'Linked business unavailable'}</Text>
          <Text style={[styles.status, promotion.status === 'active' && styles.statusActive, promotion.status === 'rejected' && styles.statusRejected]}>{promotion.status === 'active' ? 'ACTIVE' : promotion.status === 'rejected' ? 'CHANGES REQUIRED' : 'PENDING REVIEW'}</Text>
        </View>
        <Text style={styles.expand}>{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.body}>
          <Text style={styles.offer}>{promotion.discountText || promotion.briefText}</Text>
          <Text style={styles.details}>{promotion.fullDetails}</Text>
          <View style={styles.metaGrid}>
            <View style={styles.meta}><Text style={styles.metaLabel}>START</Text><Text style={styles.metaValue}>{promotion.startDate}</Text></View>
            <View style={styles.meta}><Text style={styles.metaLabel}>END</Text><Text style={styles.metaValue}>{promotion.endDate}</Text></View>
            <View style={styles.meta}><Text style={styles.metaLabel}>OWNER</Text><Text numberOfLines={1} style={styles.metaValue}>{promotion.ownerId}</Text></View>
          </View>
          <View style={styles.boostRow}>
            <View style={styles.boostCopy}><Text style={styles.boostTitle}>Featured promotion</Text><Text style={styles.boostText}>Featured promotions appear ahead of standard offers.</Text></View>
            <Switch value={boosted} onValueChange={setBoosted} trackColor={{ false: colors.border, true: '#e2a73f' }} />
          </View>
          <Text style={styles.controlLabel}>CHANGES REQUIRED REASON</Text>
          <TextInput value={reason} onChangeText={setReason} multiline placeholder="Explain what must be corrected…" placeholderTextColor={colors.muted} style={styles.reason} />
          <View style={styles.actions}>
            <Pressable disabled={busy || !business} onPress={approve} style={[styles.approve, (busy || !business) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.approveText}>Approve & Publish</Text>}</Pressable>
            <Pressable disabled={busy} onPress={reject} style={[styles.reject, busy && styles.disabled]}><Text style={styles.rejectText}>Request Changes</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function BusinessPromotionApprovalPanel() {
  const [promotions, setPromotions] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [queryText, setQueryText] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    const unsubscribePromotions = listenBusinessPromotionsForAdmin(rows => {
      setPromotions(rows);
      setLoading(false);
      setError('');
    }, nextError => {
      setLoading(false);
      setError(friendlyError(nextError, 'Could not load the promotion queue.'));
    });
    const unsubscribeBusinesses = listenBusinessesForAdmin(setBusinesses, nextError => setError(friendlyError(nextError, 'Could not load linked businesses.')));
    return () => {
      unsubscribePromotions?.();
      unsubscribeBusinesses?.();
    };
  }, []);

  const counts = useMemo(() => ({
    all: promotions.length,
    pending: promotions.filter(item => item.status === 'pending').length,
    active: promotions.filter(item => item.status === 'active').length,
    rejected: promotions.filter(item => item.status === 'rejected').length,
  }), [promotions]);

  const filtered = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return promotions.filter(item => filter === 'all' || item.status === filter).filter(item => {
      if (!query) return true;
      const business = businesses.find(row => row.id === item.businessId);
      return [item.title, item.briefText, item.discountText, business?.name].filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [businesses, filter, promotions, queryText]);

  const approve = async (promotion, options) => {
    setBusyId(promotion.id);
    setError('');
    try {
      await approveBusinessPromotion(promotion.id, options);
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not approve this promotion.'));
    } finally {
      setBusyId('');
    }
  };

  const reject = async (promotion, reason) => {
    setBusyId(promotion.id);
    setError('');
    try {
      await rejectBusinessPromotion(promotion.id, reason);
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not request promotion changes.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{counts.pending}</Text><Text style={styles.metricLabel}>PENDING</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{counts.active}</Text><Text style={styles.metricLabel}>ACTIVE</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{counts.rejected}</Text><Text style={styles.metricLabel}>CHANGES</Text></View>
      </View>
      <TextInput value={queryText} onChangeText={setQueryText} placeholder="Search promotion or business" placeholderTextColor={colors.muted} style={styles.search} />
      <View style={styles.filters}>{FILTERS.map(item => <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filter, filter === item.value && styles.filterActive]}><Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label} ({counts[item.value]})</Text></Pressable>)}</View>
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={styles.loadingText}>Loading promotion queue…</Text></View> : null}
      {!loading && !filtered.length ? <View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>Queue is clear</Text><Text style={styles.emptyText}>No promotions match this view.</Text></View> : null}
      <View style={styles.list}>{filtered.map(promotion => <PromotionCard key={promotion.id} promotion={promotion} business={businesses.find(row => row.id === promotion.businessId)} busy={busyId === promotion.id} onApprove={approve} onReject={reject} />)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  metricValue: { color: colors.navy, fontSize: 23, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: colors.muted, fontSize: 8.5, fontWeight: '900' },
  search: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 14, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 99, backgroundColor: colors.surface },
  filterActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  filterTextActive: { color: colors.surface },
  list: { gap: spacing.md },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  cardExpanded: { borderColor: colors.teal },
  cardHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  image: { width: 58, height: 58, borderRadius: 14, backgroundColor: '#fff0d9' },
  imageFallback: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#fff0d9' },
  imageFallbackText: { fontSize: 25 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.navy, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  business: { marginTop: 3, color: colors.muted, fontSize: 10, fontWeight: '800' },
  status: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, overflow: 'hidden', backgroundColor: '#fff2d8', color: '#8b5c08', fontSize: 8, fontWeight: '900' },
  statusActive: { backgroundColor: '#e7f5ea', color: '#2f7740' },
  statusRejected: { backgroundColor: '#ffeded', color: colors.danger },
  expand: { width: 30, color: colors.tealDark, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  body: { padding: spacing.md, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.border },
  offer: { marginTop: spacing.md, color: '#aa6507', fontSize: 14, fontWeight: '900' },
  details: { marginTop: spacing.sm, color: colors.text, fontSize: 12, lineHeight: 19, fontWeight: '600' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  meta: { flex: 1, minWidth: 90, padding: spacing.sm, borderRadius: 10, backgroundColor: '#f4f7f6' },
  metaLabel: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  metaValue: { marginTop: 3, color: colors.navy, fontSize: 10, fontWeight: '800' },
  boostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff4df' },
  boostCopy: { flex: 1 },
  boostTitle: { color: colors.navy, fontSize: 12, fontWeight: '900' },
  boostText: { marginTop: 2, color: colors.text, fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  controlLabel: { marginTop: spacing.md, marginBottom: 6, color: colors.navy, fontSize: 10, fontWeight: '900' },
  reason: { minHeight: 88, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  approve: { flex: 1.2, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.teal },
  approveText: { color: colors.surface, fontSize: 10.5, fontWeight: '900' },
  reject: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2b5b5', borderRadius: radius.md, backgroundColor: '#fff5f5' },
  rejectText: { color: colors.danger, fontSize: 10, fontWeight: '900' },
  error: { padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff0f0' },
  errorText: { color: colors.danger, fontSize: 11, lineHeight: 17, fontWeight: '800' },
  loading: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  loadingText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyIcon: { color: '#2f7740', fontSize: 35, fontWeight: '900' },
  emptyTitle: { marginTop: spacing.sm, color: colors.navy, fontSize: 17, fontWeight: '900' },
  emptyText: { marginTop: 4, color: colors.muted, fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
