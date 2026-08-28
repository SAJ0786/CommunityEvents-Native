import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatAbn, isValidAbn, listenBusinessesForAdmin, listenBusinessPromotionsForAdmin } from '../services/businesses';
import { getDiagnosticSessionId } from '../services/diagnostics';
import { listUsers } from '../services/users';
import { colors, radius, shadow, spacing } from '../theme';
import BusinessApprovalPanel from './BusinessApprovalPanel';
import CompactSelect from '../components/CompactSelect';
import { addBusinessCategory, addBusinessSubcategory } from '../services/businessCategoryAdmin';

const AREAS = [
  ['approvals', '\u2713', 'Business Approvals', 'Review listings and promotions before publication.'],
  ['users', '\u{1F465}', 'Users', 'Search Business Directory accounts and listing owners.'],
  ['businesses', '\u{1F3EA}', 'Businesses', 'Manage active, pending, draft and rejected listings.'],
  ['troubleshooting', '\u{1F6E0}', 'Troubleshooting', 'Business diagnostics and tester support details.'],
  ['tools', '\u{1F50E}', 'Tools', 'Manage categories and subcategories, and validate ABNs.'],
];

const CATEGORY_ICONS = [
  '🏷️', '🍽️', '🥘', '🎉', '🛍️', '👗', '🏗️', '🔨', '💻', '📱',
  '⚖️', '📊', '🩺', '🧰', '🚗', '🏠', '🧹', '🌿', '📚', '🎨',
  '📸', '✈️', '🏋️', '💇', '🧵', '💐', '🐾', '☕', '🕌', '🤝',
];

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function joinedDate(user = {}) {
  const value = user.createdAt || user.joinedAt || user.registeredAt || user.createdOn;
  const millis = timestampMillis(value);
  return millis ? new Date(millis).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable';
}

function PanelHeader({ title, subtitle, onBack }) {
  return <View style={styles.panelHead}><Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>{'←'} Back</Text></Pressable><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelSubtitle}>{subtitle}</Text></View>;
}

export default function BusinessAdminDashboard({ user, profile, categories = [] }) {
  const [panel, setPanel] = useState('overview');
  const [businesses, setBusinesses] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [userScope, setUserScope] = useState('users');
  const [abn, setAbn] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [newSubcategory, setNewSubcategory] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryStatus, setCategoryStatus] = useState('');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const addCategory = async () => {
    setCategoryBusy(true);
    setCategoryStatus('');
    try {
      const next = await addBusinessCategory(newCategory, newCategoryIcon);
      const created = next.find(item => item.label.toLowerCase() === newCategory.trim().replace(/\s+/g, ' ').toLowerCase());
      setNewCategory('');
      setNewCategoryIcon('');
      if (created) setParentCategoryId(created.id);
      setCategoryStatus('Category added. It is now available in Directory search and business forms.');
    } catch (error) {
      setCategoryStatus(error?.message || 'Could not add the category.');
    } finally {
      setCategoryBusy(false);
    }
  };

  const addSubcategory = async () => {
    setCategoryBusy(true);
    setCategoryStatus('');
    try {
      await addBusinessSubcategory(parentCategoryId, newSubcategory);
      setNewSubcategory('');
      setCategoryStatus('Subcategory added. It is now available under the selected category.');
    } catch (error) {
      setCategoryStatus(error?.message || 'Could not add the subcategory.');
    } finally {
      setCategoryBusy(false);
    }
  };

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
    const businessOwnerIds = new Set(businesses.map(item => item.ownerId).filter(Boolean));
    return users
      .filter(item => userScope === 'users' || businessOwnerIds.has(item.id))
      .filter(item => !query || [item.fullName, item.email, item.phone, item.phoneNumber, item.defaultCity].some(value => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => timestampMillis(b.createdAt || b.joinedAt || b.registeredAt) - timestampMillis(a.createdAt || a.joinedAt || a.registeredAt));
  }, [businesses, userQuery, userScope, users]);

  if (panel === 'approvals') return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.keyboardContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets><BusinessApprovalPanel mode="approvals" onBack={() => setPanel('overview')} /></ScrollView></KeyboardAvoidingView>;
  if (panel === 'businesses') return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.keyboardContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets><BusinessApprovalPanel mode="management" onBack={() => setPanel('overview')} /></ScrollView></KeyboardAvoidingView>;

  if (panel === 'users') return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets><PanelHeader title="Directory Users" subtitle="Newest accounts first. Business Owners includes anyone who has submitted a listing, regardless of approval or visibility." onBack={() => setPanel('overview')} /><TextInput value={userQuery} onChangeText={setUserQuery} placeholder="Search name, email, phone or city" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.scopeTabs}><Pressable onPress={() => setUserScope('users')} style={[styles.scopeTab, userScope === 'users' && styles.scopeTabActive]}><Text style={[styles.scopeText, userScope === 'users' && styles.scopeTextActive]}>Users</Text></Pressable><Pressable onPress={() => setUserScope('owners')} style={[styles.scopeTab, userScope === 'owners' && styles.scopeTabActive]}><Text style={[styles.scopeText, userScope === 'owners' && styles.scopeTextActive]}>Business Owners</Text></Pressable></View><Text style={styles.resultCount}>{visibleUsers.length} {userScope === 'owners' ? 'BUSINESS OWNERS' : 'USERS'} · NEWEST FIRST</Text>{visibleUsers.map(item => <View key={item.id} style={styles.userCard}><View style={styles.userAvatar}><Text style={styles.userAvatarText}>{String(item.fullName || item.email || 'U').charAt(0).toUpperCase()}</Text></View><View style={styles.userCopy}><Text style={styles.userName}>{item.fullName || 'Unnamed user'}</Text><Text style={styles.userMeta}>{item.email || item.phone || item.phoneNumber || 'No contact detail'}</Text><Text style={styles.userMeta}>{item.defaultCity || 'No default city'} · {item.role || 'user'}</Text><Text style={styles.userJoined}>Joined {joinedDate(item)}</Text></View></View>)}</ScrollView>;

  if (panel === 'troubleshooting') return <ScrollView contentContainerStyle={styles.content}><PanelHeader title="Business Troubleshooting" subtitle="Tester-safe diagnostics for the Business Directory." onBack={() => setPanel('overview')} /><View style={styles.infoCard}><Text style={styles.infoLabel}>DIAGNOSTIC SESSION</Text><Text selectable style={styles.infoValue}>{getDiagnosticSessionId()}</Text></View><View style={styles.infoCard}><Text style={styles.infoLabel}>DATA STATUS</Text><Text style={styles.infoValue}>{businesses.length} private listings · {promotions.length} promotions</Text><Text style={styles.infoText}>Crash reports exclude typed form contents, ABNs, phone numbers, email addresses and exact private addresses.</Text></View><View style={styles.infoCard}><Text style={styles.infoLabel}>TESTING POLICY</Text><Text style={styles.infoText}>This build is for authorised testers and fictional or authorised test listings only. Real public submissions stay disabled until store launch readiness is approved.</Text></View></ScrollView>;

  if (panel === 'tools') {
    const normalized = String(abn || '').replace(/\D/g, '').slice(0, 11);
    const valid = normalized.length === 11 && isValidAbn(normalized);
    const categoryOptions = categories.map(item => ({ value: item.id, label: `${item.icon}  ${item.label}` }));
    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PanelHeader title="Directory Tools" subtitle="Category management and official Australian Business Register access." onBack={() => setPanel('overview')} />

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>CATEGORY MANAGEMENT</Text>
          <Text style={styles.infoValue}>Add a Business Category</Text>
          <Text style={styles.infoText}>New categories appear in Directory search and the Add Business form. Existing categories cannot be deleted, protecting current listings.</Text>
          <View style={styles.formRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose category icon" onPress={() => setIconPickerOpen(true)} style={styles.iconChooser}><Text style={styles.iconChooserValue}>{newCategoryIcon || '🏷️'}</Text><Text style={styles.iconChooserLabel}>Choose icon</Text></Pressable>
            <TextInput value={newCategory} onChangeText={setNewCategory} maxLength={60} placeholder="Category name" placeholderTextColor={colors.muted} style={[styles.input, styles.flexInput]} />
          </View>
          <Pressable disabled={categoryBusy || newCategory.trim().length < 2} onPress={addCategory} style={[styles.primaryButton, (categoryBusy || newCategory.trim().length < 2) && styles.disabled]}>
            <Text style={styles.primaryButtonText}>{categoryBusy ? 'Saving...' : '＋ Add Category'}</Text>
          </Pressable>

          <View style={styles.divider} />
          <Text style={styles.infoValue}>Add a Subcategory</Text>
          <Text style={styles.infoText}>Choose its parent category first. Duplicate names under the same category are blocked.</Text>
          <View style={styles.selectWrap}>
            <CompactSelect options={categoryOptions} value={parentCategoryId} onChange={setParentCategoryId} placeholder="Choose parent category" />
          </View>
          <TextInput value={newSubcategory} onChangeText={setNewSubcategory} maxLength={80} placeholder="Subcategory name" placeholderTextColor={colors.muted} style={styles.input} />
          <Pressable disabled={categoryBusy || !parentCategoryId || newSubcategory.trim().length < 2} onPress={addSubcategory} style={[styles.primaryButton, (categoryBusy || !parentCategoryId || newSubcategory.trim().length < 2) && styles.disabled]}>
            <Text style={styles.primaryButtonText}>{categoryBusy ? 'Saving...' : '＋ Add Subcategory'}</Text>
          </Pressable>
          {categoryStatus ? <Text style={styles.categoryStatus}>{categoryStatus}</Text> : null}

          <View style={styles.categorySummary}>
            {categories.map(item => <View key={item.id} style={styles.categorySummaryRow}><Text style={styles.categorySummaryName}>{item.icon} {item.label}</Text><Text style={styles.categorySummaryCount}>{item.subcategories.length} subcategories</Text></View>)}
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>ABN LOOKUP</Text>
          <TextInput value={abn} onChangeText={value => setAbn(value.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder="11-digit ABN" placeholderTextColor={colors.muted} style={styles.input} />
          {normalized.length ? <Text style={[styles.validation, valid ? styles.valid : styles.invalid]}>{valid ? `✓ ${formatAbn(normalized)} passes the ABN checksum` : 'Enter a valid 11-digit ABN'}</Text> : null}
          <Pressable disabled={!valid} onPress={() => Linking.openURL(`https://abr.business.gov.au/ABN/View?abn=${normalized}`)} style={[styles.primaryButton, !valid && styles.disabled]}><Text style={styles.primaryButtonText}>Open Official ABR Record</Text></Pressable>
          <Text style={styles.infoText}>A checksum is not verification. Approval still requires an administrator to check the active ABR record and name match. No licence, identity, insurance or quality check is performed.</Text>
        </View>
        <Modal visible={iconPickerOpen} transparent animationType="fade" onRequestClose={() => setIconPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.iconModal}>
              <View style={styles.iconModalHeader}><View style={styles.flexInput}><Text style={styles.iconModalTitle}>Choose category icon</Text><Text style={styles.infoText}>Select a clear icon for Directory search and forms.</Text></View><Pressable onPress={() => setIconPickerOpen(false)} style={styles.modalClose}><Text style={styles.modalCloseText}>✕</Text></Pressable></View>
              <ScrollView contentContainerStyle={styles.iconGrid}>{CATEGORY_ICONS.map(icon => <Pressable key={icon} onPress={() => { setNewCategoryIcon(icon); setIconPickerOpen(false); }} style={[styles.iconOption, newCategoryIcon === icon && styles.iconOptionActive]}><Text style={styles.iconOptionText}>{icon}</Text></Pressable>)}</ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return <ScrollView contentContainerStyle={styles.content}><View style={styles.identity}><View style={styles.identityIcon}><Text style={styles.identityIconText}>{'🏪'}</Text></View><View style={styles.identityCopy}><Text style={styles.eyebrow}>COMMUNITY BUSINESSES AUSTRALIA</Text><Text style={styles.title}>{profile?.fullName || 'Business Admin'}</Text><Text style={styles.subtitle}>Approvals, businesses, promotions and directory support.</Text></View></View><View style={styles.metrics}>{metrics.map(([label, value, target], index) => <Pressable key={label} onPress={() => setPanel(target)} style={[styles.metric, styles[`metricTone${index % 4}`]]}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></Pressable>)}</View><Text style={styles.sectionTitle}>Management areas</Text><View style={styles.areas}>{AREAS.map(([key, icon, label, description]) => <Pressable key={key} onPress={() => setPanel(key)} style={({ pressed }) => [styles.area, pressed && styles.pressed]}><View style={styles.areaIcon}><Text style={styles.areaIconText}>{icon}</Text></View><View style={styles.areaCopy}><Text style={styles.areaTitle}>{label}</Text><Text style={styles.areaText}>{description}</Text></View><Text style={styles.chevron}>{'›'}</Text></Pressable>)}</View></ScrollView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { padding: spacing.lg, paddingBottom: 48 }, keyboardContent: { padding: spacing.lg, paddingBottom: 280 }, identity: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fff0f6', ...shadow }, identityIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#f7c6dc' }, identityIconText: { fontSize: 26 }, identityCopy: { flex: 1 }, eyebrow: { color: '#a33667', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { marginTop: 3, color: colors.navy, fontSize: 20, fontWeight: '900' }, subtitle: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, metric: { width: '31%', minWidth: 96, flexGrow: 1, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface }, metricTone0: { borderColor: '#f0d6e2' }, metricTone1: { borderColor: '#cce2f6' }, metricTone2: { borderColor: '#d7ead8' }, metricTone3: { borderColor: '#eadcc5' }, metricValue: { color: '#a33667', fontSize: 22, fontWeight: '900' }, metricLabel: { marginTop: 3, color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: '800' },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm, color: colors.navy, fontSize: 18, fontWeight: '900' }, areas: { gap: spacing.sm }, area: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, areaIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#fff0f6' }, areaIconText: { fontSize: 20 }, areaCopy: { flex: 1 }, areaTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' }, areaText: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 15 }, chevron: { color: '#a33667', fontSize: 23, fontWeight: '900' }, pressed: { opacity: 0.75 },
  panelHead: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fff0f6' }, backButton: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center' }, backText: { color: '#a33667', fontSize: 12, fontWeight: '900' }, panelTitle: { color: colors.navy, fontSize: 23, fontWeight: '900' }, panelSubtitle: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18 },
  input: { minHeight: 50, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 14 }, scopeTabs: { flexDirection: 'row', marginTop: spacing.md, padding: 3, borderRadius: radius.md, backgroundColor: '#edf2f1' }, scopeTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, scopeTabActive: { backgroundColor: colors.teal, ...shadow }, scopeText: { color: colors.muted, fontSize: 11, fontWeight: '900' }, scopeTextActive: { color: colors.surface }, resultCount: { marginTop: spacing.md, color: colors.muted, fontSize: 10, fontWeight: '900' }, userCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }, userAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.tealSoft }, userAvatarText: { color: colors.tealDark, fontSize: 17, fontWeight: '900' }, userCopy: { flex: 1 }, userName: { color: colors.navy, fontSize: 14, fontWeight: '900' }, userMeta: { marginTop: 3, color: colors.muted, fontSize: 11 }, userJoined: { marginTop: 5, color: '#a33667', fontSize: 9.5, fontWeight: '900' },
  infoCard: { marginBottom: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow }, infoLabel: { color: '#a33667', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 }, infoValue: { marginTop: 7, color: colors.navy, fontSize: 15, fontWeight: '900' }, infoText: { marginTop: spacing.sm, color: colors.muted, fontSize: 11, lineHeight: 17 }, validation: { marginTop: spacing.sm, fontSize: 11, fontWeight: '900' }, valid: { color: '#27753a' }, invalid: { color: colors.danger }, primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md, backgroundColor: '#a33667' }, primaryButtonText: { color: colors.surface, fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.4 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flexInput: { flex: 1 }, iconChooser: { width: 88, minHeight: 66, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.tealSoft }, iconChooserValue: { fontSize: 25 }, iconChooserLabel: { marginTop: 2, color: colors.tealDark, fontSize: 8.5, fontWeight: '900' }, divider: { height: 1, marginVertical: spacing.lg, backgroundColor: colors.border }, selectWrap: { marginTop: spacing.sm }, categoryStatus: { marginTop: spacing.md, color: colors.tealDark, fontSize: 11, lineHeight: 17, fontWeight: '800' }, categorySummary: { marginTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }, categorySummaryRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }, categorySummaryName: { flex: 1, color: colors.navy, fontSize: 11, fontWeight: '900' }, categorySummaryCount: { color: colors.muted, fontSize: 9, fontWeight: '800' }, modalBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(7,18,35,0.58)' }, iconModal: { maxHeight: '76%', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow }, iconModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, iconModalTitle: { color: colors.navy, fontSize: 19, fontWeight: '900' }, modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.tealSoft }, modalCloseText: { color: colors.tealDark, fontSize: 16, fontWeight: '900' }, iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, paddingBottom: spacing.sm }, iconOption: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: '#f8faf9' }, iconOptionActive: { borderColor: colors.teal, borderWidth: 2, backgroundColor: colors.tealSoft }, iconOptionText: { fontSize: 25 },
});
