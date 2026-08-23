import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatAbn, isValidAbn, listenBusinessesForAdmin, listenBusinessPromotionsForAdmin } from '../services/businesses';
import { getDiagnosticSessionId } from '../services/diagnostics';
import { listUsers } from '../services/users';
import { colors, radius, shadow, spacing } from '../theme';
import BusinessApprovalPanel from './BusinessApprovalPanel';
import BusinessSupportInboxScreen from './BusinessSupportInboxScreen';

const AREAS = [
  ['approvals', '\u2713', 'Business Approvals', 'Review listings and promotions before publication.'],
  ['users', '\u{1F465}', 'Users', 'Search Business Directory accounts and listing owners.'],
  ['businesses', '\u{1F3EA}', 'Businesses', 'Manage active, pending, draft and rejected listings.'],
  ['messaging', '\u{1F4E8}', 'Business Messaging', 'Review Business reports and Contact Us conversations.'],
  ['troubleshooting', '\u{1F6E0}', 'Troubleshooting', 'Business diagnostics and tester support details.'],
  ['tools', '\u{1F50E}', 'Tools', 'Validate an ABN checksum and open its official ABR record.'],
];

function PanelHeader({ title, subtitle, onBack }) {
  return <View style={styles.panelHead}><Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>{'‹'} Overview</Text></Pressable><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelSubtitle}>{subtitle}</Text></View>;
}

export default function BusinessAdminDashboard({ user, profile }) {
  const [panel, setPanel] = useState('overview');
  const [businesses, setBusinesses] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [abn, setAbn] = useState('');

  useEffect(() => {
    const stopBusinesses = listenBusinessesForAdmin(setBusinesses, () => {});
    const stopPromotions = listenBusinessPromotionsForAdmin(setPromotions, () => {});
    listUsers().then(setUsers).catch(() => {});
    return () => { stopBusinesses?.(); stopPromotions?.(); };
  }, []);

  const metrics = useMemo(() => [
    ['Registered Businesses', businesses.filter(item => item.status === 'approved').length, 'businesses'],
    ['Waiting Approval', businesses.filter(item => item.status === 'pending').length, 'approvals'],
    ['Draft', businesses.filter(item => item.status === 'draft').length, 'businesses'],
    ['Rejected', businesses.filter(item => item.status === 'rejected').length, 'businesses'],
    ['Users', users.length, 'users'],
    ['Upcoming Promotions', promotions.filter(item => item.status === 'active' && item.startDate > new Date().toISOString().slice(0, 10)).length, 'approvals'],
    ['Current Promotions', promotions.filter(item => item.status === 'active').length, 'approvals'],
  ], [businesses, promotions, users.length]);

  const visibleUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return users.filter(item => !query || [item.fullName, item.email, item.phone, item.phoneNumber, item.defaultCity].some(value => String(value || '').toLowerCase().includes(query))).sort((a, b) => String(a.fullName || a.email || '').localeCompare(String(b.fullName || b.email || '')));
  }, [userQuery, users]);

  if (panel === 'approvals' || panel === 'businesses') return <ScrollView contentContainerStyle={styles.content}><BusinessApprovalPanel onBack={() => setPanel('overview')} /></ScrollView>;
  if (panel === 'messaging') return <BusinessSupportInboxScreen user={user} profile={profile} onBack={() => setPanel('overview')} />;

  if (panel === 'users') return <ScrollView contentContainerStyle={styles.content}><PanelHeader title="Directory Users" subtitle="Business Directory accounts and listing owners." onBack={() => setPanel('overview')} /><TextInput value={userQuery} onChangeText={setUserQuery} placeholder="Search name, email, phone or city" placeholderTextColor={colors.muted} style={styles.input} /><Text style={styles.resultCount}>{visibleUsers.length} USERS</Text>{visibleUsers.map(item => <View key={item.id} style={styles.userCard}><View style={styles.userAvatar}><Text style={styles.userAvatarText}>{String(item.fullName || item.email || 'U').charAt(0).toUpperCase()}</Text></View><View style={styles.userCopy}><Text style={styles.userName}>{item.fullName || 'Unnamed user'}</Text><Text style={styles.userMeta}>{item.email || item.phone || item.phoneNumber || 'No contact detail'}</Text><Text style={styles.userMeta}>{item.defaultCity || 'No default city'} · {item.role || 'user'}</Text></View></View>)}</ScrollView>;

  if (panel === 'troubleshooting') return <ScrollView contentContainerStyle={styles.content}><PanelHeader title="Business Troubleshooting" subtitle="Tester-safe diagnostics for the Business Directory." onBack={() => setPanel('overview')} /><View style={styles.infoCard}><Text style={styles.infoLabel}>DIAGNOSTIC SESSION</Text><Text selectable style={styles.infoValue}>{getDiagnosticSessionId()}</Text></View><View style={styles.infoCard}><Text style={styles.infoLabel}>DATA STATUS</Text><Text style={styles.infoValue}>{businesses.length} private listings · {promotions.length} promotions</Text><Text style={styles.infoText}>Crash reports exclude typed form contents, ABNs, phone numbers, email addresses and exact private addresses.</Text></View><View style={styles.infoCard}><Text style={styles.infoLabel}>TESTING POLICY</Text><Text style={styles.infoText}>This build is for authorised testers and fictional or authorised test listings only. Real public submissions stay disabled until store launch readiness is approved.</Text></View></ScrollView>;

  if (panel === 'tools') {
    const normalized = String(abn || '').replace(/\D/g, '').slice(0, 11);
    const valid = normalized.length === 11 && isValidAbn(normalized);
    return <ScrollView contentContainerStyle={styles.content}><PanelHeader title="Directory Tools" subtitle="ABN format checking and official Australian Business Register access." onBack={() => setPanel('overview')} /><View style={styles.infoCard}><Text style={styles.infoLabel}>ABN LOOKUP</Text><TextInput value={abn} onChangeText={value => setAbn(value.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder="11-digit ABN" placeholderTextColor={colors.muted} style={styles.input} />{normalized.length ? <Text style={[styles.validation, valid ? styles.valid : styles.invalid]}>{valid ? `✓ ${formatAbn(normalized)} passes the ABN checksum` : 'Enter a valid 11-digit ABN'}</Text> : null}<Pressable disabled={!valid} onPress={() => Linking.openURL(`https://abr.business.gov.au/ABN/View?abn=${normalized}`)} style={[styles.primaryButton, !valid && styles.disabled]}><Text style={styles.primaryButtonText}>Open Official ABR Record</Text></Pressable><Text style={styles.infoText}>A checksum is not verification. Approval still requires an administrator to check the active ABR record and name match. No licence, identity, insurance or quality check is performed.</Text></View></ScrollView>;
  }

  return <ScrollView contentContainerStyle={styles.content}><View style={styles.identity}><View style={styles.identityIcon}><Text style={styles.identityIconText}>{'🏪'}</Text></View><View style={styles.identityCopy}><Text style={styles.eyebrow}>COMMUNITY BUSINESSES AUSTRALIA</Text><Text style={styles.title}>{profile?.fullName || 'Business Admin'}</Text><Text style={styles.subtitle}>Approvals, businesses, promotions and directory support.</Text></View></View><View style={styles.metrics}>{metrics.map(([label, value, target], index) => <Pressable key={label} onPress={() => setPanel(target)} style={[styles.metric, styles[`metricTone${index % 4}`]]}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></Pressable>)}</View><Text style={styles.sectionTitle}>Management areas</Text><View style={styles.areas}>{AREAS.map(([key, icon, label, description]) => <Pressable key={key} onPress={() => setPanel(key)} style={({ pressed }) => [styles.area, pressed && styles.pressed]}><View style={styles.areaIcon}><Text style={styles.areaIconText}>{icon}</Text></View><View style={styles.areaCopy}><Text style={styles.areaTitle}>{label}</Text><Text style={styles.areaText}>{description}</Text></View><Text style={styles.chevron}>{'›'}</Text></Pressable>)}</View></ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 48 }, identity: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fff0f6', ...shadow }, identityIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#f7c6dc' }, identityIconText: { fontSize: 26 }, identityCopy: { flex: 1 }, eyebrow: { color: '#a33667', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { marginTop: 3, color: colors.navy, fontSize: 20, fontWeight: '900' }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, metric: { width: '31%', minWidth: 96, flexGrow: 1, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface }, metricTone0: { borderColor: '#f0d6e2' }, metricTone1: { borderColor: '#cce2f6' }, metricTone2: { borderColor: '#d7ead8' }, metricTone3: { borderColor: '#eadcc5' }, metricValue: { color: '#a33667', fontSize: 22, fontWeight: '900' }, metricLabel: { marginTop: 3, color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.navy, fontSize: 18, fontWeight: '900' }, areas: { gap: spacing.sm }, area: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, areaIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#fff0f6' }, areaIconText: { fontSize: 20 }, areaCopy: { flex: 1 }, areaTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' }, areaText: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 15 }, chevron: { color: '#a33667', fontSize: 23, fontWeight: '900' }, pressed: { opacity: 0.75 },
  panelHead: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fff0f6' }, backButton: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center' }, backText: { color: '#a33667', fontSize: 12, fontWeight: '900' }, panelTitle: { color: colors.navy, fontSize: 23, fontWeight: '900' }, panelSubtitle: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 50, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 14 }, resultCount: { marginTop: spacing.md, color: colors.muted, fontSize: 10, fontWeight: '900' }, userCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, userAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.tealSoft }, userAvatarText: { color: colors.tealDark, fontSize: 17, fontWeight: '900' }, userCopy: { flex: 1 }, userName: { color: colors.navy, fontSize: 14, fontWeight: '900' }, userMeta: { marginTop: 3, color: colors.muted, fontSize: 11 },
  infoCard: { marginBottom: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow }, infoLabel: { color: '#a33667', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, infoValue: { marginTop: 7, color: colors.navy, fontSize: 15, fontWeight: '900' }, infoText: { marginTop: spacing.sm, color: colors.muted, fontSize: 11, lineHeight: 17 }, validation: { marginTop: spacing.sm, fontSize: 11, fontWeight: '900' }, valid: { color: '#27753a' }, invalid: { color: colors.danger }, primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md, backgroundColor: '#a33667' }, primaryButtonText: { color: colors.surface, fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.4 },
});
