import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  approveBusinessListing,
  formatAbn,
  isValidAbn,
  listenBusinessesForAdmin,
  rejectBusinessListing,
  setBusinessVisibility,
  syncApprovedBusinessProjections,
  verifyBusinessAbn,
} from '../services/businesses';
import { friendlyError } from '../utils/errors';
import { colors, radius, shadow, spacing } from '../theme';
import BusinessPromotionApprovalPanel from './BusinessPromotionApprovalPanel';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Changes Required' },
  { value: 'all', label: 'All' },
];

const TIERS = ['free', 'standard', 'featured'];

function statusLabel(status) {
  if (status === 'approved') return 'APPROVED';
  if (status === 'rejected') return 'CHANGES REQUIRED';
  return 'PENDING REVIEW';
}

function BusinessReviewCard({ business, selected, busy, onToggle, onApprove, onReject, onVisibility, onVerify }) {
  const [tier, setTier] = useState(business.tier || 'free');
  const [foundingMember, setFoundingMember] = useState(Boolean(business.foundingMember || business.foundingMemberCandidate));
  const [publishWithoutAbn, setPublishWithoutAbn] = useState(false);
  const [reason, setReason] = useState(business.rejectionReason || '');
  const imageUrl = business.logoUrl || business.coverUrl;
  const initials = String(business.name || 'Business').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const validAbn = isValidAbn(business.abn);
  const hasAbn = Boolean(String(business.abn || '').replace(/\D/g, ''));
  const abrVerified = business.abnVerified === true && business.abrVerification?.status === 'verified';
  const approvalReady = hasAbn ? validAbn && abrVerified : publishWithoutAbn;

  useEffect(() => {
    setTier(business.tier || 'free');
    setFoundingMember(Boolean(business.foundingMember || business.foundingMemberCandidate));
    setPublishWithoutAbn(false);
    setReason(business.rejectionReason || '');
  }, [business.abnVerified, business.foundingMember, business.foundingMemberCandidate, business.id, business.rejectionReason, business.tier]);

  const confirmApproval = () => {
    if (hasAbn && !validAbn) {
      Alert.alert('ABN cannot be verified', 'Reject this listing and ask the owner to correct its ABN.');
      return;
    }
    if (hasAbn && !abrVerified) {
      Alert.alert('Official ABR verification required', 'Tap Verify with ABR first. Approval remains unavailable until the server confirms an active ABN and matching entity or business name.');
      return;
    }
    Alert.alert(
      business.status === 'approved' ? 'Update approval?' : 'Approve business?',
      `${business.name} will be visible in the public Business Directory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => onApprove?.(business, { tier: hasAbn ? tier : 'free', foundingMember, publishWithoutAbn: !hasAbn && publishWithoutAbn }) },
      ]
    );
  };

  const confirmRejection = () => {
    if (reason.trim().length < 10) {
      Alert.alert('Add a reason', 'Enter a clear reason of at least 10 characters so the owner knows what to change.');
      return;
    }
    Alert.alert(
      'Request changes?',
      'The listing will remain private and the owner will see your reason.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request Changes', style: 'destructive', onPress: () => onReject?.(business, reason.trim()) },
      ]
    );
  };

  return (
    <View style={[styles.card, selected && styles.cardSelected]}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}>
        {imageUrl ? <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.logo} /> : <View style={styles.logoFallback}><Text style={styles.logoText}>{initials}</Text></View>}
        <View style={styles.headerCopy}>
          <Text numberOfLines={2} style={styles.businessName}>{business.name}</Text>
          <Text style={styles.businessMeta}>{business.category || business.categoryId} · {business.location?.suburb || business.location?.city || 'Australia'}</Text>
          <View style={[styles.statusBadge, business.status === 'approved' && styles.statusApproved, business.status === 'rejected' && styles.statusRejected]}>
            <Text style={[styles.statusText, business.status === 'approved' && styles.statusTextApproved, business.status === 'rejected' && styles.statusTextRejected]}>{statusLabel(business.status)}</Text>
          </View>
        </View>
        <Text style={styles.expandIcon}>{selected ? '−' : '+'}</Text>
      </Pressable>

      {selected ? (
        <View style={styles.reviewBody}>
          {business.coverUrl ? <Image source={{ uri: business.coverUrl }} resizeMode="cover" style={styles.cover} /> : null}
          <Text style={styles.description}>{business.description}</Text>

          <View style={styles.detailGrid}>
            <View style={styles.detailItem}><Text style={styles.detailLabel}>ABN</Text><Text style={styles.detailValue}>{hasAbn ? formatAbn(business.abn) : 'Not provided'}</Text>{hasAbn ? <Text style={validAbn ? styles.valid : styles.invalid}>{validAbn ? '✓ Checksum valid' : '✕ Invalid checksum'}</Text> : <Text style={styles.invalid}>No verification badge</Text>}</View>
            <View style={styles.detailItem}><Text style={styles.detailLabel}>SERVICES</Text><Text style={styles.detailValue}>{(business.subcategories || []).join(', ') || business.category || 'Not supplied'}</Text></View>
            <View style={styles.detailItem}><Text style={styles.detailLabel}>OWNER</Text><Text numberOfLines={2} style={styles.detailValue}>{business.ownerEmail || business.ownerPhone || business.ownerId}</Text></View>
            <View style={styles.detailItem}><Text style={styles.detailLabel}>ADDRESS</Text><Text style={styles.detailValue}>{business.location?.fullAddress || 'Not supplied'}</Text></View>
            <View style={styles.detailItem}><Text style={styles.detailLabel}>PHONE</Text><Text style={styles.detailValue}>{business.contact?.phone || 'Not supplied'}</Text></View>
            <View style={styles.detailItem}><Text style={styles.detailLabel}>EMAIL</Text><Text style={styles.detailValue}>{business.contact?.email || 'Not supplied'}</Text></View>
          </View>

          {hasAbn ? <View style={styles.abrReview}>
            <View style={styles.abrCopy}>
              <Text style={styles.abrTitle}>Official ABR verification</Text>
              <Text style={styles.abrText}>{abrVerified
                ? `Verified automatically: ${business.abrVerification?.matchedName || business.abrVerification?.entityName || business.name}`
                : business.abrVerification?.status === 'name_review_required'
                  ? `Name does not match the ABR record: ${[business.abrVerification?.entityName, ...(business.abrVerification?.businessNames || []), ...(business.abrVerification?.tradingNames || [])].filter(Boolean).join(', ')}`
                  : 'The secure server checks that the ABN is active and the submitted name matches an ABR entity, registered business or current trading name.'}</Text>
              <Pressable onPress={() => Linking.openURL(`https://abr.business.gov.au/ABN/View?abn=${String(business.abn || '').replace(/\D/g, '')}`)} style={styles.abrLink}><Text style={styles.abrLinkText}>Open ABR record ↗</Text></Pressable>
              <Pressable disabled={busy || !validAbn} onPress={() => onVerify?.(business)} style={[styles.abrVerifyButton, (busy || !validAbn) && styles.disabled]}>
                {busy ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.abrVerifyText}>{abrVerified ? 'Recheck with ABR' : 'Verify with ABR'}</Text>}
              </Pressable>
            </View>
            <View style={[styles.abrStatus, abrVerified && styles.abrStatusVerified]}><Text style={[styles.abrStatusText, abrVerified && styles.abrStatusTextVerified]}>{abrVerified ? 'VERIFIED' : 'NOT VERIFIED'}</Text></View>
          </View> : <View style={styles.abrReview}>
            <View style={styles.abrCopy}>
              <Text style={styles.abrTitle}>Publish without ABN</Text>
              <Text style={styles.abrText}>Confirm only that this basic directory listing may be published without an ABN. It will receive no verification badge. Do not describe this as an identity, licence, insurance or quality check.</Text>
            </View>
            <Switch value={publishWithoutAbn} onValueChange={setPublishWithoutAbn} trackColor={{ false: colors.border, true: colors.teal }} />
          </View>}

          <Text style={styles.controlLabel}>LISTING TIER</Text>
          <View style={styles.tierRow}>
            {TIERS.map(value => (
              <Pressable key={value} onPress={() => setTier(value)} style={[styles.tierButton, tier === value && styles.tierButtonActive]}>
                <Text style={[styles.tierText, tier === value && styles.tierTextActive]}>{value.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.foundingRow}>
            <View style={styles.foundingCopy}><Text style={styles.foundingTitle}>Founding Member</Text><Text style={styles.foundingText}>Reserve future founding-member pricing for this business.</Text></View>
            <Switch value={foundingMember} onValueChange={setFoundingMember} trackColor={{ false: colors.border, true: colors.teal }} />
          </View>

          <Text style={styles.controlLabel}>CHANGES REQUIRED REASON</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="Explain exactly what the owner must correct…"
            placeholderTextColor={colors.muted}
            style={styles.reasonInput}
          />

          <View style={styles.actionRow}>
            <Pressable disabled={busy || !approvalReady} onPress={confirmApproval} style={({ pressed }) => [styles.approveButton, (busy || !approvalReady) && styles.disabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.approveText}>✓ Approve & Publish</Text>}
            </Pressable>
            <Pressable disabled={busy} onPress={confirmRejection} style={({ pressed }) => [styles.rejectButton, busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.rejectText}>Request Changes</Text>
            </Pressable>
          </View>

          {business.status === 'approved' ? (
            <Pressable disabled={busy} onPress={() => onVisibility?.(business, !business.hidden)} style={styles.visibilityButton}>
              <Text style={styles.visibilityText}>{business.hidden ? 'Restore Public Listing' : 'Temporarily Hide Listing'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function BusinessApprovalPanel({ mode = 'approvals', onBack }) {
  const isManagement = mode === 'management';
  const [queueType, setQueueType] = useState('businesses');
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [queryText, setQueryText] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setQueueType('businesses');
    setFilter(isManagement ? 'all' : 'pending');
    setQueryText('');
    setSelectedId('');
  }, [isManagement]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = listenBusinessesForAdmin(
      rows => {
        setBusinesses(rows);
        setLoading(false);
        setError('');
      },
      nextError => {
        setLoading(false);
        setError(friendlyError(nextError, 'Could not load the business approval queue.'));
      }
    );
    return unsubscribe;
  }, []);

  const counts = useMemo(() => ({
    all: businesses.length,
    pending: businesses.filter(item => item.status === 'pending').length,
    approved: businesses.filter(item => item.status === 'approved').length,
    rejected: businesses.filter(item => item.status === 'rejected').length,
  }), [businesses]);

  const filtered = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return businesses.filter(item => filter === 'all' || item.status === filter).filter(item => {
      if (!query) return true;
      return [item.name, item.abn, item.category, ...(item.subcategoryIds || []), item.location?.suburb, item.ownerEmail]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [businesses, filter, queryText]);

  const approve = async (business, options) => {
    setBusyId(business.id);
    setError('');
    try {
      await approveBusinessListing(business.id, options);
      setSelectedId('');
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not approve this business.'));
    } finally {
      setBusyId('');
    }
  };

  const verifyAbn = async business => {
    setBusyId(business.id);
    setError('');
    try {
      const result = await verifyBusinessAbn(business.id);
      if (result.verified) {
        Alert.alert('ABN verified', `${result.matchedName || result.entityName}\nABN status: ${result.abnStatus || 'Active'}`);
      } else {
        const officialNames = [result.entityName, ...(result.businessNames || []), ...(result.tradingNames || [])].filter(Boolean).join(', ');
        Alert.alert('ABN not verified', result.status === 'name_review_required'
          ? `The ABN is active, but the submitted name does not match: ${officialNames || 'No official name returned'}.`
          : 'The ABR service did not confirm an active matching ABN. The listing remains private.');
      }
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not verify this ABN with the Australian Business Register.'));
    } finally {
      setBusyId('');
    }
  };

  const reject = async (business, reason) => {
    setBusyId(business.id);
    setError('');
    try {
      await rejectBusinessListing(business.id, reason);
      setSelectedId('');
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not request changes for this business.'));
    } finally {
      setBusyId('');
    }
  };

  const changeVisibility = async (business, hidden) => {
    setBusyId(business.id);
    setError('');
    try {
      await setBusinessVisibility(business.id, hidden);
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not change business visibility.'));
    } finally {
      setBusyId('');
    }
  };

  const syncPublicDirectory = async () => {
    setSyncing(true);
    setError('');
    try {
      const result = await syncApprovedBusinessProjections();
      Alert.alert('Public directory repaired', `${result.businesses} approved business listing(s) and ${result.promotions} active promotion(s) were safely republished.`);
    } catch (nextError) {
      setError(friendlyError(nextError, 'Could not repair the public directory.'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleCopy}>
          <Text style={styles.eyebrow}>BUSINESS DIRECTORY</Text>
          <Text style={styles.panelTitle}>{isManagement ? 'Business Management' : 'Business Approvals'}</Text>
          <Text style={styles.panelSubtitle}>{isManagement
            ? 'Search and manage every business listing, including approved, draft, pending and rejected records.'
            : queueType === 'promotions'
              ? 'Review promotion content, dates and featured placement.'
              : 'Review pending business details and ABNs before publishing listings.'}</Text>
        </View>
        <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backButtonText}>Back</Text></Pressable>
      </View>

      {!isManagement ? <View style={styles.queueTabs}>
        <Pressable onPress={() => setQueueType('businesses')} style={[styles.queueTab, queueType === 'businesses' && styles.queueTabActive]}><Text style={[styles.queueTabText, queueType === 'businesses' && styles.queueTabTextActive]}>Business Listings</Text></Pressable>
        <Pressable onPress={() => setQueueType('promotions')} style={[styles.queueTab, queueType === 'promotions' && styles.queueTabActive]}><Text style={[styles.queueTabText, queueType === 'promotions' && styles.queueTabTextActive]}>Promotions</Text></Pressable>
      </View> : null}

      {queueType === 'promotions' ? <BusinessPromotionApprovalPanel /> : <>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{counts.pending}</Text><Text style={styles.metricLabel}>PENDING</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{counts.approved}</Text><Text style={styles.metricLabel}>APPROVED</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{counts.rejected}</Text><Text style={styles.metricLabel}>CHANGES</Text></View>
      </View>
      <Pressable disabled={syncing} onPress={syncPublicDirectory} style={({ pressed }) => [styles.syncButton, syncing && styles.disabled, pressed && styles.pressed]}>
        {syncing ? <ActivityIndicator color={colors.tealDark} size="small" /> : <Text style={styles.syncButtonText}>↻ Repair / Republish Approved Listings</Text>}
      </Pressable>

      <TextInput value={queryText} onChangeText={setQueryText} placeholder="Search name, ABN, suburb or owner" placeholderTextColor={colors.muted} style={styles.search} />
      <View style={styles.filters}>
        {FILTERS.map(item => (
          <Pressable key={item.value} onPress={() => setFilter(item.value)} style={[styles.filterButton, filter === item.value && styles.filterButtonActive]}>
            <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label} ({counts[item.value]})</Text>
          </Pressable>
        ))}
      </View>

      {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <View style={styles.loadingCard}><ActivityIndicator color={colors.teal} /><Text style={styles.loadingText}>Loading approval queue…</Text></View> : null}
      {!loading && !filtered.length ? <View style={styles.emptyCard}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>{isManagement ? 'No matching businesses' : 'Queue is clear'}</Text><Text style={styles.emptyText}>No business listings match this view.</Text></View> : null}
      <View style={styles.list}>
        {filtered.map(business => (
          <BusinessReviewCard
            key={business.id}
            business={business}
            selected={selectedId === business.id}
            busy={busyId === business.id}
            onToggle={() => setSelectedId(current => current === business.id ? '' : business.id)}
            onApprove={approve}
            onReject={reject}
            onVisibility={changeVisibility}
            onVerify={verifyAbn}
          />
        ))}
      </View>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  panelTitleCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  panelTitle: { marginTop: 4, color: colors.navy, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  panelSubtitle: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  backButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  backButtonText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  queueTabs: { flexDirection: 'row', padding: 3, borderRadius: radius.md, backgroundColor: '#edf2f1' },
  queueTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  queueTabActive: { backgroundColor: colors.surface, ...shadow },
  queueTabText: { color: colors.muted, fontSize: 11, fontWeight: '900' },
  queueTabTextActive: { color: colors.tealDark },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  metricValue: { color: colors.navy, fontSize: 23, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: colors.muted, fontSize: 8.5, fontWeight: '900' },
  syncButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  syncButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  search: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 14, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 99, backgroundColor: colors.surface },
  filterButtonActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  filterTextActive: { color: colors.surface },
  list: { gap: spacing.md },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  cardSelected: { borderColor: colors.teal },
  cardHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.tealSoft },
  logoFallback: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.teal },
  logoText: { color: colors.surface, fontSize: 17, fontWeight: '900' },
  headerCopy: { flex: 1, minWidth: 0 },
  businessName: { color: colors.navy, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  businessMeta: { marginTop: 3, color: colors.muted, fontSize: 10, fontWeight: '700' },
  statusBadge: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: '#fff2d8' },
  statusApproved: { backgroundColor: '#e7f5ea' },
  statusRejected: { backgroundColor: '#ffeded' },
  statusText: { color: '#8b5c08', fontSize: 8, fontWeight: '900' },
  statusTextApproved: { color: '#2f7740' },
  statusTextRejected: { color: colors.danger },
  expandIcon: { width: 32, color: colors.tealDark, fontSize: 24, fontWeight: '700', textAlign: 'center' },
  reviewBody: { padding: spacing.md, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.border },
  cover: { height: 150, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  description: { marginTop: spacing.md, color: colors.text, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  detailItem: { width: '48%', minWidth: 130, padding: spacing.sm, borderRadius: 10, backgroundColor: '#f4f7f6' },
  detailLabel: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  detailValue: { marginTop: 3, color: colors.navy, fontSize: 10.5, lineHeight: 15, fontWeight: '800' },
  valid: { marginTop: 3, color: '#2f7740', fontSize: 9, fontWeight: '900' },
  invalid: { marginTop: 3, color: colors.danger, fontSize: 9, fontWeight: '900' },
  abrReview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#edf8f5' },
  abrCopy: { flex: 1, minWidth: 0 },
  abrTitle: { color: colors.navy, fontSize: 12, fontWeight: '900' },
  abrText: { marginTop: 3, color: colors.text, fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  abrLink: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', marginTop: 5 },
  abrLinkText: { color: colors.tealDark, fontSize: 10, fontWeight: '900', textDecorationLine: 'underline' },
  abrVerifyButton: { alignSelf: 'flex-start', minHeight: 38, minWidth: 120, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: spacing.md, borderRadius: 10, backgroundColor: colors.teal },
  abrVerifyText: { color: colors.surface, fontSize: 10, fontWeight: '900' },
  abrStatus: { maxWidth: 78, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: '#ffeded' },
  abrStatusVerified: { backgroundColor: '#dff4e5' },
  abrStatusText: { color: colors.danger, fontSize: 7.5, lineHeight: 10, fontWeight: '900', textAlign: 'center' },
  abrStatusTextVerified: { color: '#2f7740' },
  controlLabel: { marginTop: spacing.md, marginBottom: 6, color: colors.navy, fontSize: 10, fontWeight: '900' },
  tierRow: { flexDirection: 'row', gap: 6 },
  tierButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  tierButtonActive: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  tierText: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  tierTextActive: { color: colors.tealDark },
  foundingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  foundingCopy: { flex: 1, minWidth: 0 },
  foundingTitle: { color: colors.navy, fontSize: 12, fontWeight: '900' },
  foundingText: { marginTop: 2, color: colors.text, fontSize: 9.5, lineHeight: 14, fontWeight: '700' },
  reasonInput: { minHeight: 90, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 12, textAlignVertical: 'top' },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  approveButton: { flex: 1.2, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.teal },
  approveText: { color: colors.surface, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  rejectButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: '#e2b5b5', borderRadius: radius.md, backgroundColor: '#fff5f5' },
  rejectText: { color: colors.danger, fontSize: 10.5, fontWeight: '900', textAlign: 'center' },
  visibilityButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  visibilityText: { color: colors.muted, fontSize: 10.5, fontWeight: '900' },
  errorCard: { padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff0f0' },
  errorText: { color: colors.danger, fontSize: 11, lineHeight: 17, fontWeight: '800' },
  loadingCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  loadingText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  emptyIcon: { color: '#2f7740', fontSize: 35, fontWeight: '900' },
  emptyTitle: { marginTop: spacing.sm, color: colors.navy, fontSize: 17, fontWeight: '900' },
  emptyText: { marginTop: 4, color: colors.muted, fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});
