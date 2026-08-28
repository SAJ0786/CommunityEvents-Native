import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BUSINESS_STATUSES, formatAbn } from '../services/businesses';
import { colors, radius, shadow, spacing } from '../theme';

function StatusBadge({ status }) {
  const config = BUSINESS_STATUSES[status] || BUSINESS_STATUSES.pending;
  return (
    <View style={[
      styles.statusBadge,
      config.tone === 'green' && styles.statusGreen,
      config.tone === 'red' && styles.statusRed,
    ]}>
      <Text style={[
        styles.statusText,
        config.tone === 'green' && styles.statusTextGreen,
        config.tone === 'red' && styles.statusTextRed,
      ]}>{config.label}</Text>
    </View>
  );
}

function OwnerBusinessCard({ business, onEdit, onAddPromotion }) {
  const imageUrl = business.logoUrl || business.coverUrl;
  const isPublic = business.status === 'approved' || business.hasPublishedVersion === true;
  return (
    <View style={styles.businessCard}>
      <View style={styles.businessTop}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} resizeMode="cover" style={styles.businessLogo} />
        ) : (
          <Image source={require('../../assets/business-placeholder.png')} resizeMode="cover" style={styles.businessLogo} />
        )}
        <View style={styles.businessCopy}>
          <Text numberOfLines={2} style={styles.businessName}>{business.name}</Text>
          <Text style={styles.businessMeta}>{business.category || 'Business'} · {business.location?.suburb || business.location?.city || 'Australia'}</Text>
        </View>
        <StatusBadge status={business.status} />
      </View>
      <View style={styles.infoStrip}>
        <View style={styles.infoItem}><Text style={styles.infoLabel}>ABN</Text><Text style={styles.infoValue}>{formatAbn(business.abn)}</Text></View>
        <View style={styles.infoItem}><Text style={styles.infoLabel}>TIER</Text><Text style={styles.infoValue}>{String(business.tier || 'free').toUpperCase()}</Text></View>
        <View style={styles.infoItem}><Text style={styles.infoLabel}>SERVICES</Text><Text numberOfLines={1} style={styles.infoValue}>{business.subcategoryIds?.length || 0} selected</Text></View>
      </View>
      {business.status === 'pending' ? (
        <View style={styles.reviewNotice}><Text style={styles.reviewNoticeText}>{business.hasPublishedVersion ? 'Your existing approved listing remains public while the directory team reviews these proposed changes.' : 'Your new listing is private while the directory team reviews it. Only ABN status is checked, and only when an ABN is supplied.'}</Text></View>
      ) : null}
      {business.status === 'rejected' ? (
        <View style={styles.rejectionNotice}>
          <Text style={styles.rejectionTitle}>Changes requested</Text>
          <Text style={styles.rejectionText}>{business.rejectionReason || 'Review the listing details and resubmit it for approval.'}</Text>
        </View>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable onPress={() => onEdit?.(business)} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
          <Text style={styles.editIcon}>{'\u270E'}</Text>
          <Text style={styles.editText}>Edit listing</Text>
        </Pressable>
        {isPublic && !business.hidden ? (
          <Pressable onPress={() => onAddPromotion?.(business)} style={({ pressed }) => [styles.promotionButton, pressed && styles.pressed]}>
            <Text style={styles.promotionButtonIcon}>{'\u{1F3F7}\uFE0F'}</Text>
            <Text style={styles.promotionButtonText}>Add promotion</Text>
          </Pressable>
        ) : null}
        <View style={styles.publicState}>
          <Text style={styles.publicStateIcon}>{isPublic ? '\u{1F310}' : '\u{1F512}'}</Text>
          <Text style={styles.publicStateText}>{isPublic ? 'Public' : 'Not public'}</Text>
        </View>
      </View>
    </View>
  );
}

function OwnerPromotionCard({ promotion, businessName, onEdit, onDelete }) {
  const active = promotion.status === 'active' && promotion.hidden !== true;
  return (
    <View style={styles.promotionCard}>
      <View style={styles.promotionTop}>
        <View style={styles.promotionCopy}>
          <Text numberOfLines={2} style={styles.promotionTitle}>{promotion.title}</Text>
          <Text numberOfLines={1} style={styles.promotionBusiness}>{businessName || 'Business'}</Text>
        </View>
        <View style={[styles.promotionStatus, active && styles.promotionStatusActive, promotion.status === 'rejected' && styles.promotionStatusRejected]}>
          <Text style={[styles.promotionStatusText, active && styles.promotionStatusTextActive, promotion.status === 'rejected' && styles.promotionStatusTextRejected]}>
            {active ? 'ACTIVE' : promotion.status === 'rejected' ? 'CHANGES' : 'PENDING'}
          </Text>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.promotionSummary}>{promotion.discountText || promotion.briefText}</Text>
      <Text style={styles.promotionDates}>{promotion.startDate} to {promotion.endDate}</Text>
      {promotion.status === 'rejected' ? <Text style={styles.promotionReason}>{promotion.rejectionReason || 'Review the promotion and resubmit it.'}</Text> : null}
      <View style={styles.promotionActions}>
        <Pressable onPress={() => onEdit?.(promotion)} style={styles.promotionEdit}><Text style={styles.promotionEditText}>Edit</Text></Pressable>
        <Pressable onPress={() => onDelete?.(promotion)} style={styles.promotionDelete}><Text style={styles.promotionDeleteText}>Delete</Text></Pressable>
      </View>
    </View>
  );
}

export default function BusinessOwnerScreen({
  businesses = [],
  promotions = [],
  loading,
  error,
  promotionError,
  onAdd,
  onEdit,
  onAddPromotion,
  onEditPromotion,
  onDeletePromotion,
}) {
  const approved = businesses.filter(item => item.status === 'approved').length;
  const pending = businesses.filter(item => item.status === 'pending').length;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>BUSINESS OWNER</Text>
          <Text style={styles.title}>Your businesses</Text>
          <Text style={styles.subtitle}>Create listings, follow their approval status and keep business information current.</Text>
        </View>
        <View style={styles.heroIcon}><Text style={styles.heroIconText}>{'\u{1F4BC}'}</Text></View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{businesses.length}</Text><Text style={styles.summaryLabel}>LISTINGS</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{approved}</Text><Text style={styles.summaryLabel}>APPROVED</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{pending}</Text><Text style={styles.summaryLabel}>IN REVIEW</Text></View>
      </View>

      {!businesses.length ? <Pressable onPress={onAdd} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
        <Text style={styles.addIcon}>＋</Text>
        <View style={styles.addCopy}><Text style={styles.addTitle}>Add your business</Text><Text style={styles.addText}>Submit a directory listing for review</Text></View>
        <Text style={styles.chevron}>{'\u203A'}</Text>
      </Pressable> : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your listings</Text>
        {businesses.length ? <Text style={styles.sectionCount}>{businesses.length}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.loadingCard}><ActivityIndicator color={colors.teal} /><Text style={styles.loadingText}>Loading your business listings…</Text></View>
      ) : error ? (
        <View style={styles.errorCard}><Text style={styles.errorTitle}>Could not load listings</Text><Text style={styles.errorText}>{error}</Text></View>
      ) : businesses.length ? (
        <View style={styles.list}>{businesses.map(business => <OwnerBusinessCard key={business.id} business={business} onEdit={onEdit} onAddPromotion={onAddPromotion} />)}</View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\u{1F3EA}'}</Text>
          <Text style={styles.emptyTitle}>No business listings yet</Text>
          <Text style={styles.emptyText}>Add your first business to join Community Businesses Australia.</Text>
          <Pressable onPress={onAdd} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Add Your First Business</Text></Pressable>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your promotions</Text>
        {promotions.length ? <Text style={styles.sectionCount}>{promotions.length}</Text> : null}
      </View>
      {promotionError ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Could not load promotions</Text><Text style={styles.errorText}>{promotionError}</Text></View> : null}
      {promotions.length ? (
        <View style={styles.list}>
          {promotions.map(promotion => (
            <OwnerPromotionCard
              key={promotion.id}
              promotion={promotion}
              businessName={businesses.find(business => business.id === promotion.businessId)?.name}
              onEdit={onEditPromotion}
              onDelete={onDeletePromotion}
            />
          ))}
        </View>
      ) : (
        <View style={styles.promotionEmpty}>
          <Text style={styles.promotionEmptyText}>Approved businesses can publish promotions from their listing card.</Text>
        </View>
      )}

      <View style={styles.processCard}>
        <Text style={styles.processTitle}>How approval works</Text>
        {[
          ['1', 'Submit', 'Complete the business profile and provide an ABN if available.'],
          ['2', 'Review', 'The directory team reviews the listing and checks ABN status only when supplied.'],
          ['3', 'Publish', 'Approved listings appear in search and promotions.'],
        ].map(([number, title, copy]) => (
          <View key={number} style={styles.processRow}>
            <View style={styles.processNumber}><Text style={styles.processNumberText}>{number}</Text></View>
            <View style={styles.processCopy}><Text style={styles.processRowTitle}>{title}</Text><Text style={styles.processText}>{copy}</Text></View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.tealSoft },
  heroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 5, color: colors.navy, fontSize: 25, fontWeight: '900' },
  subtitle: { marginTop: 5, color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  heroIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.surface, ...shadow },
  heroIconText: { fontSize: 30 },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  summaryCard: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  summaryValue: { color: colors.navy, fontSize: 22, fontWeight: '900' },
  summaryLabel: { marginTop: 3, color: colors.muted, fontSize: 8.5, fontWeight: '900' },
  addButton: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.teal },
  addIcon: { color: colors.surface, fontSize: 28, fontWeight: '600' },
  addCopy: { flex: 1, minWidth: 0 },
  addTitle: { color: colors.surface, fontSize: 14, fontWeight: '900' },
  addText: { marginTop: 2, color: '#d8f3ef', fontSize: 10.5, fontWeight: '700' },
  chevron: { color: colors.surface, fontSize: 28, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { color: colors.navy, fontSize: 19, fontWeight: '900' },
  sectionCount: { minWidth: 24, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: colors.tealSoft, color: colors.tealDark, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  list: { gap: spacing.md },
  businessCard: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  businessTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  businessLogo: { width: 54, height: 54, borderRadius: 15, backgroundColor: colors.tealSoft },
  businessLogoFallback: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.teal },
  businessLogoText: { color: colors.surface, fontSize: 17, fontWeight: '900' },
  businessCopy: { flex: 1, minWidth: 0 },
  businessName: { color: colors.navy, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  businessMeta: { marginTop: 3, color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  statusBadge: { maxWidth: 88, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, backgroundColor: '#fff2d8' },
  statusGreen: { backgroundColor: '#e7f5ea' },
  statusRed: { backgroundColor: '#ffeded' },
  statusText: { color: '#8b5c08', fontSize: 8.5, fontWeight: '900', textAlign: 'center' },
  statusTextGreen: { color: '#2f7740' },
  statusTextRed: { color: colors.danger },
  infoStrip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  infoItem: { flex: 1, minWidth: 0 },
  infoLabel: { color: colors.muted, fontSize: 7.5, fontWeight: '900' },
  infoValue: { marginTop: 3, color: colors.text, fontSize: 9.5, fontWeight: '900' },
  reviewNotice: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: 10, backgroundColor: '#fff8e9' },
  reviewNoticeText: { color: '#785516', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  rejectionNotice: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: 10, backgroundColor: '#fff0f0' },
  rejectionTitle: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  rejectionText: { marginTop: 3, color: colors.text, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  editButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  editIcon: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  editText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  promotionButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: '#fff3df' },
  promotionButtonIcon: { fontSize: 13 },
  promotionButtonText: { color: '#92590a', fontSize: 10, fontWeight: '900' },
  publicState: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  publicStateIcon: { fontSize: 13 },
  publicStateText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  loadingCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surface },
  loadingText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  errorCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#fff0f0' },
  errorTitle: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  errorText: { marginTop: 4, color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  promotionCard: { padding: spacing.md, borderWidth: 1, borderColor: '#ecd5ad', borderRadius: radius.md, backgroundColor: '#fffaf1' },
  promotionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  promotionCopy: { flex: 1, minWidth: 0 },
  promotionTitle: { color: colors.navy, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  promotionBusiness: { marginTop: 3, color: colors.muted, fontSize: 10, fontWeight: '800' },
  promotionStatus: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 99, backgroundColor: '#fff0cf' },
  promotionStatusActive: { backgroundColor: '#e7f5ea' },
  promotionStatusRejected: { backgroundColor: '#ffeded' },
  promotionStatusText: { color: '#8b5c08', fontSize: 8, fontWeight: '900' },
  promotionStatusTextActive: { color: '#2f7740' },
  promotionStatusTextRejected: { color: colors.danger },
  promotionSummary: { marginTop: spacing.sm, color: colors.text, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  promotionDates: { marginTop: 4, color: colors.muted, fontSize: 9.5, fontWeight: '700' },
  promotionReason: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: 9, backgroundColor: '#ffeded', color: colors.danger, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  promotionActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  promotionEdit: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  promotionEditText: { color: colors.tealDark, fontSize: 10.5, fontWeight: '900' },
  promotionDelete: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md },
  promotionDeleteText: { color: colors.danger, fontSize: 10.5, fontWeight: '900' },
  promotionEmpty: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: '#fffaf1' },
  promotionEmptyText: { color: colors.muted, fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  emptyCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  emptyIcon: { fontSize: 38 },
  emptyTitle: { marginTop: spacing.sm, color: colors.navy, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal },
  primaryButtonText: { color: colors.surface, fontSize: 12, fontWeight: '900' },
  processCard: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  processTitle: { paddingTop: spacing.lg, color: colors.navy, fontSize: 15, fontWeight: '900' },
  processRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  processNumber: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.tealSoft },
  processNumberText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  processCopy: { flex: 1, minWidth: 0 },
  processRowTitle: { color: colors.navy, fontSize: 12, fontWeight: '900' },
  processText: { marginTop: 2, color: colors.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  pressed: { opacity: 0.78 },
});
