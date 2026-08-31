import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import CompactSelect from '../components/CompactSelect';
import { BUSINESS_ACTION_LABELS, listenBusinessStatistics } from '../services/businessAnalytics';
import { CITY_OPTIONS, cityLabel, normalizeCity } from '../utils/cities';
import { colors, radius, shadow, spacing } from '../theme';

const EMPTY_STATISTICS = { pageViews: 0, enquiries: 0, actions: {} };

function businessCity(business = {}) {
  return normalizeCity(business.location?.city || business.city || 'rest-of-australia');
}

function sumStatistics(rows = []) {
  return rows.reduce((total, row) => {
    const actions = row?.actions || {};
    Object.entries(actions).forEach(([key, value]) => {
      total.actions[key] = Number(total.actions[key] || 0) + Number(value || 0);
    });
    total.pageViews += Number(row?.pageViews || 0);
    total.enquiries += Number(row?.enquiries || 0);
    return total;
  }, { pageViews: 0, enquiries: 0, actions: {} });
}

export default function BusinessStatisticsScreen({ businesses = [], categories = [], profile, onBack }) {
  const [statistics, setStatistics] = useState([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState(profile?.role === 'superAdmin' ? 'all' : normalizeCity(profile?.adminCity || profile?.defaultCity || 'sydney'));
  const [categoryId, setCategoryId] = useState('all');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [businessId, setBusinessId] = useState('all');

  useEffect(() => listenBusinessStatistics(
    rows => { setStatistics(rows); setError(''); },
    nextError => setError(nextError?.message || 'Could not load Business Statistics.')
  ), []);

  const selectedCategory = categories.find(item => item.id === categoryId);
  const publicBusinesses = useMemo(() => businesses.filter(item => (
    (item.status === 'approved' || item.hasPublishedVersion === true) && item.hidden !== true
  )), [businesses]);
  const filteredBusinesses = useMemo(() => {
    const search = query.trim().toLowerCase();
    return publicBusinesses.filter(business => {
      const categoryIds = Array.isArray(business.categoryIds) ? business.categoryIds : [business.categoryId].filter(Boolean);
      const subcategoryIds = Array.isArray(business.subcategoryIds) ? business.subcategoryIds : [];
      if (city !== 'all' && businessCity(business) !== city) return false;
      if (categoryId !== 'all' && !categoryIds.includes(categoryId)) return false;
      if (subcategoryId && !subcategoryIds.includes(subcategoryId)) return false;
      if (!search) return true;
      return [business.name, business.category, ...(business.categories || []), ...(business.subcategories || []), business.location?.suburb, business.suburb]
        .some(value => String(value || '').toLowerCase().includes(search));
    }).sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  }, [categoryId, city, publicBusinesses, query, subcategoryId]);

  useEffect(() => {
    if (businessId !== 'all' && !filteredBusinesses.some(item => item.id === businessId)) setBusinessId('all');
  }, [businessId, filteredBusinesses]);

  const statisticsById = useMemo(() => new Map(statistics.map(item => [item.id, item])), [statistics]);
  const visibleStatistics = useMemo(() => filteredBusinesses.map(item => statisticsById.get(item.id) || { id: item.id, ...EMPTY_STATISTICS }), [filteredBusinesses, statisticsById]);
  const selectedStatistics = businessId === 'all'
    ? sumStatistics(visibleStatistics)
    : statisticsById.get(businessId) || EMPTY_STATISTICS;
  const selectedBusiness = filteredBusinesses.find(item => item.id === businessId);
  const buttonHits = Object.entries(selectedStatistics.actions || {})
    .filter(([key]) => !['page_view', 'message_enquiry'].includes(key))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const ranking = filteredBusinesses.map(business => ({
    id: business.id,
    name: business.name,
    views: Number(statisticsById.get(business.id)?.pageViews || 0),
    enquiries: Number(statisticsById.get(business.id)?.enquiries || 0),
  })).sort((left, right) => right.views - left.views || right.enquiries - left.enquiries || left.name.localeCompare(right.name)).slice(0, 8);

  const businessOptions = [
    { value: 'all', label: `Overall — ${filteredBusinesses.length} filtered businesses` },
    ...filteredBusinesses.map(item => ({ value: item.id, label: `${item.name} · ${item.location?.suburb || item.suburb || cityLabel(businessCity(item)).replace(', Australia', '')}` })),
  ];
  const cityOptions = [{ value: 'all', label: 'All Australia' }, ...CITY_OPTIONS];
  const subcategoryOptions = [{ value: '', label: 'All subcategories' }, ...(selectedCategory?.subcategories || []).map(item => ({ value: item.id, label: item.label }))];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>{'←'} Back</Text></Pressable>
        <Text style={styles.eyebrow}>DIRECTORY ANALYTICS</Text>
        <Text style={styles.title}>Business Statistics</Text>
        <Text style={styles.subtitle}>Overall interaction status and individual-business performance. Counters measure actions, not completed sales or unique people.</Text>
      </View>

      <View style={styles.filters}>
        <Text style={styles.filterLabel}>CITY</Text>
        <CompactSelect options={cityOptions} value={city} onChange={value => { setCity(value); setBusinessId('all'); }} />
        <View style={styles.searchBox}><Text style={styles.searchIcon}>{'⌕'}</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search businesses or services" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
        <Text style={styles.filterLabel}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
          {[{ id: 'all', label: 'All', icon: '✦' }, ...categories].map(item => {
            const active = categoryId === item.id;
            return <Pressable key={item.id} onPress={() => { setCategoryId(item.id); setSubcategoryId(''); setBusinessId('all'); }} style={[styles.category, active && styles.categoryActive]}><Text style={styles.categoryIcon}>{item.icon}</Text><Text numberOfLines={2} style={[styles.categoryText, active && styles.categoryTextActive]}>{item.label}</Text></Pressable>;
          })}
        </ScrollView>
        {categoryId !== 'all' ? <CompactSelect options={subcategoryOptions} value={subcategoryId} onChange={value => { setSubcategoryId(value); setBusinessId('all'); }} placeholder="All subcategories" /> : null}
        <Text style={styles.filterLabel}>BUSINESS</Text>
        <CompactSelect options={businessOptions} value={businessId} onChange={setBusinessId} placeholder="Overall filtered statistics" />
      </View>

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
      <Text style={styles.scopeTitle}>{selectedBusiness?.name || 'Overall filtered statistics'}</Text>
      <Text style={styles.scopeText}>{businessId === 'all' ? `${filteredBusinesses.length} businesses included` : [selectedBusiness?.category, selectedBusiness?.location?.suburb || selectedBusiness?.suburb].filter(Boolean).join(' · ')}</Text>
      <View style={styles.metrics}>
        <View style={[styles.metric, styles.metricBlue]}><Text style={styles.metricValue}>{Number(selectedStatistics.pageViews || 0)}</Text><Text style={styles.metricLabel}>PAGE ACCESSES</Text></View>
        <View style={[styles.metric, styles.metricGreen]}><Text style={styles.metricValue}>{buttonHits}</Text><Text style={styles.metricLabel}>BUTTON HITS</Text></View>
        <View style={[styles.metric, styles.metricPink]}><Text style={styles.metricValue}>{Number(selectedStatistics.enquiries || 0)}</Text><Text style={styles.metricLabel}>IN-APP ENQUIRIES</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Action breakdown</Text>
      <View style={styles.breakdown}>
        {Object.entries(BUSINESS_ACTION_LABELS).map(([key, label]) => (
          <View key={key} style={styles.breakdownRow}><Text style={styles.breakdownLabel}>{label}</Text><Text style={styles.breakdownValue}>{Number(selectedStatistics.actions?.[key] || 0)}</Text></View>
        ))}
      </View>

      {businessId === 'all' ? <>
        <Text style={styles.sectionTitle}>Most accessed businesses</Text>
        <View style={styles.ranking}>
          {ranking.length ? ranking.map((item, index) => <Pressable key={item.id} onPress={() => setBusinessId(item.id)} style={styles.rankRow}><View style={styles.rankNumber}><Text style={styles.rankNumberText}>{index + 1}</Text></View><View style={styles.rankCopy}><Text style={styles.rankName}>{item.name}</Text><Text style={styles.rankMeta}>{item.views} accesses · {item.enquiries} enquiries</Text></View><Text style={styles.rankArrow}>{'›'}</Text></Pressable>) : <Text style={styles.emptyText}>No businesses match the current filters.</Text>}
        </View>
      </> : null}

      <Text style={styles.privacy}>Statistics contain aggregate counters only. They do not copy message text, customer identity, contact details, ABNs, referrer data or exact addresses.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 64 },
  header: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#e6f5f2', ...shadow },
  back: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center' },
  backText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  eyebrow: { color: colors.tealDark, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 4, color: colors.navy, fontSize: 24, fontWeight: '900' },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  filters: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  filterLabel: { marginTop: 2, color: colors.tealDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  searchIcon: { color: colors.muted, fontSize: 21, fontWeight: '900' },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13, fontWeight: '700' },
  categoryRail: { gap: spacing.sm, paddingRight: spacing.md },
  category: { width: 84, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 7, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  categoryActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  categoryIcon: { fontSize: 19 },
  categoryText: { color: colors.text, fontSize: 9, lineHeight: 12, fontWeight: '800', textAlign: 'center' },
  categoryTextActive: { color: colors.surface },
  error: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff0f0' },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  scopeTitle: { marginTop: spacing.lg, color: colors.navy, fontSize: 20, fontWeight: '900' },
  scopeText: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  metric: { minWidth: 98, flex: 1, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface },
  metricBlue: { borderColor: '#c8ddf5', backgroundColor: '#f3f8fe' },
  metricGreen: { borderColor: '#bde0d8', backgroundColor: '#f0faf7' },
  metricPink: { borderColor: '#efd1df', backgroundColor: '#fff5f9' },
  metricValue: { color: colors.navy, fontSize: 24, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: colors.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '900' },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.navy, fontSize: 17, fontWeight: '900' },
  breakdown: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  breakdownRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  breakdownLabel: { flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' },
  breakdownValue: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  ranking: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  rankRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rankNumber: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.tealSoft },
  rankNumberText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  rankCopy: { flex: 1, minWidth: 0 },
  rankName: { color: colors.navy, fontSize: 12, fontWeight: '900' },
  rankMeta: { marginTop: 2, color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  rankArrow: { color: colors.tealDark, fontSize: 22, fontWeight: '900' },
  emptyText: { padding: spacing.md, color: colors.muted, fontSize: 11, textAlign: 'center' },
  privacy: { marginTop: spacing.lg, color: colors.muted, fontSize: 10, lineHeight: 15, fontStyle: 'italic', textAlign: 'center' },
});
