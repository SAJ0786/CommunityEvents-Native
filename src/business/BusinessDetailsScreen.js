import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors, radius, shadow, spacing } from '../theme';
import { sendBusinessMessage } from '../services/messaging';

const fallbackBusinessImage = require('../../assets/business-placeholder.png');

function DetailAction({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Text maxFontSizeMultiplier={1} style={styles.actionIcon}>{icon}</Text>
      <Text maxFontSizeMultiplier={1} style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function SocialBrandIcon({ brand }) {
  if (brand === 'facebook') {
    return <View style={[styles.brandTile, styles.facebookTile]}><FontAwesome name="facebook-f" size={29} color="#ffffff" /></View>;
  }
  if (brand === 'instagram') {
    return <View style={[styles.brandTile, styles.instagramTile]}><FontAwesome name="instagram" size={28} color="#ffffff" /></View>;
  }
  if (brand === 'x') return <View style={[styles.brandTile, styles.xTile]}><Text maxFontSizeMultiplier={1} style={styles.xMark}>X</Text></View>;
  return <View style={[styles.brandTile, styles.websiteTile]}><FontAwesome name="globe" size={25} color={colors.tealDark} /></View>;
}

function InfoRow({ icon, title, text, onPress }) {
  const content = <>
      <View style={styles.infoIconWrap}><Text style={styles.infoIcon}>{icon}</Text></View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoText}>{text}</Text>
      </View>
      {onPress ? <Text style={styles.infoChevron}>{'›'}</Text> : null}
    </>;
  if (onPress) return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.infoRow, pressed && styles.pressed]}>{content}</Pressable>;
  return <View style={styles.infoRow}>{content}</View>;
}

function formatVerificationDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BusinessDetailsScreen({ business, promotions = [], saved = false, onBack, onToggleSaved, isGuest = true, user, profile, onRequireSignIn, onTrackAction }) {
  const [tab, setTab] = useState('about');
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactText, setContactText] = useState('');
  const [contactStatus, setContactStatus] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const screenRef = useRef(null);
  const promotionPulse = useRef(new Animated.Value(1)).current;
  const businessPromotions = useMemo(() => promotions.filter(item => item.businessId === business?.id), [business?.id, promotions]);
  const offeredServices = useMemo(() => {
    const supplied = Array.isArray(business?.subcategories) ? business.subcategories : [];
    if (supplied.length) return supplied.map(item => typeof item === 'string' ? item : item?.label).filter(Boolean);
    return (business?.subcategoryIds || []).map(value => String(value).split('-').map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' '));
  }, [business?.subcategories, business?.subcategoryIds]);
  const hoursRows = useMemo(() => {
    const days = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
    if (!business?.hours || !Object.keys(business.hours).length) return [];
    return days.map(([key, label]) => {
      const row = business.hours[key] || {};
      return [label, row.closed ? 'Closed' : [row.open, row.close].filter(Boolean).join(' – ') || 'Hours not supplied'];
    });
  }, [business?.hours]);
  useEffect(() => {
    if (!businessPromotions.length) {
      promotionPulse.setValue(1);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(promotionPulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      Animated.timing(promotionPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [businessPromotions.length, promotionPulse]);
  if (!business) return null;

  const openExternal = async (url, unavailableMessage) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Unsupported link');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Not available', unavailableMessage);
    }
  };

  const openTrackedExternal = (action, url, unavailableMessage) => {
    onTrackAction?.(action);
    return openExternal(url, unavailableMessage);
  };

  const shareBusiness = async () => {
    onTrackAction?.('share');
    await Share.share({
      title: business.name,
      message: [
        business.name,
        business.category,
        business.description,
        `Location: ${business.address}`,
        `Phone: ${business.phone}`,
        business.website,
        '',
        'Shared from Community Businesses Australia',
      ].filter(Boolean).join('\n'),
    });
  };

  const contactBusiness = async () => {
    if (isGuest) { onRequireSignIn?.(); return; }
    setContactBusy(true); setContactStatus('');
    try {
      const result = await sendBusinessMessage({ business, user, profile, text: contactText });
      if (result?.isNew) onTrackAction?.('message_enquiry', { threadId: result.threadId });
      setContactText('');
      setContactStatus('Message sent. Follow the conversation from Business Inbox.');
    } catch (error) {
      setContactStatus(error?.message || 'Could not send this message.');
    } finally { setContactBusy(false); }
  };

  return (
    <ScrollView ref={screenRef} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>{'\u2039'} Back</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={saved ? 'Remove business from Favourites' : 'Add business to Favourites'}
          onPress={onToggleSaved}
          style={({ pressed }) => [styles.saveButton, saved && styles.saveButtonActive, pressed && styles.pressed]}
        >
          <Text style={[styles.saveIcon, saved && styles.saveIconActive]}>{saved ? '\u2665' : '\u2661'}</Text>
        </Pressable>
      </View>

      <View style={[styles.cover, { backgroundColor: business.coverColor || colors.teal }]}> 
        <View style={styles.coverOrb} />
        <Image source={!coverFailed && business.coverUrl ? { uri: business.coverUrl } : fallbackBusinessImage} onError={() => setCoverFailed(true)} resizeMode="cover" style={[styles.coverImage, (!business.coverUrl || coverFailed) && styles.coverFallback]} />
      </View>
      <View style={[styles.logo, { borderColor: business.coverColor || colors.teal }]}>
        <Image source={!logoFailed && business.logoUrl ? { uri: business.logoUrl } : fallbackBusinessImage} onError={() => setLogoFailed(true)} resizeMode="contain" style={styles.logoImage} />
      </View>

      <View style={styles.badgeRow}>
        {business.tier !== 'free' ? (
          <View style={[styles.badge, business.tier === 'featured' && styles.featuredBadge]}>
            <Text style={[styles.badgeText, business.tier === 'featured' && styles.featuredText]}>
              {business.tier === 'featured' ? '\u2605 SPONSORED' : 'STANDARD'}
            </Text>
          </View>
        ) : null}
        {business.verificationBadge && business.abnVerified !== true ? <View style={styles.badge}><Text style={styles.badgeText}>{business.verificationBadge}</Text></View> : null}
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{business.name}</Text>
        {businessPromotions.length ? <Pressable accessibilityLabel="View active promotions" onPress={() => { onTrackAction?.('promotions'); setTab('promotions'); setTimeout(() => screenRef.current?.scrollTo({ y: 540, animated: true }), 50); }}><Animated.View style={[styles.promotionPulse, { opacity: promotionPulse }]}><Text style={styles.promotionPulseIcon}>🏷️</Text><Text style={styles.promotionPulseText}>PROMO</Text></Animated.View></Pressable> : null}
      </View>
      <Text style={styles.metaSummary}>{[(business.categories || [business.category]).filter(Boolean).join(', '), business.suburb, business.distanceKm != null ? `${business.distanceKm} km away` : ''].filter(Boolean).join(' · ')}</Text>
      {business.abnVerified === true ? (
        <View style={styles.verified}><Text style={styles.verifiedText}>{'\u2713'} ABN Verified{formatVerificationDate(business.abnCheckedAt || business.approvedAt) ? ` · Checked ${formatVerificationDate(business.abnCheckedAt || business.approvedAt)}` : ''}</Text></View>
      ) : null}

      <View style={styles.disclaimerCard}>
        <Text style={styles.disclaimerTitle}>{'\u24D8'} Verification scope</Text>
        <Text style={styles.disclaimerText}>ABN verification confirms ABN status only. Ownership, identity, licences, insurance and service quality are not verified. Check credentials independently.</Text>
      </View>

      <View style={styles.actionGrid}>
        <DetailAction icon={'\u{1F4AC}'} label="Contact" onPress={() => { onTrackAction?.('contact'); isGuest ? onRequireSignIn?.() : setContactOpen(true); }} />
        {business.phone ? <DetailAction icon={'\u{1F4DE}'} label="Call" onPress={() => openTrackedExternal('call', `tel:${business.phone}`, 'Calling is not available on this device.')} /> : null}
        {business.whatsapp ? <DetailAction icon={'\u{1F4F1}'} label="WhatsApp" onPress={() => openTrackedExternal('whatsapp', `https://wa.me/${business.whatsapp.replace(/\D/g, '')}`, 'WhatsApp is not installed or unavailable.')} /> : null}
        {business.address ? <DetailAction icon={'\u{1F5FA}\uFE0F'} label="Directions" onPress={() => openTrackedExternal('directions', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`, 'Maps could not open this address.')} /> : null}
        <DetailAction icon={'\u{1F4E4}'} label="Share" onPress={shareBusiness} />
      </View>

      {(business.website || business.social?.facebook || business.social?.instagram || business.social?.twitter || business.social?.x) ? <View style={styles.socialRow}>
        {business.website ? <Pressable accessibilityLabel="Open website" onPress={() => openTrackedExternal('website', business.website, 'The website could not be opened.')} style={styles.socialButton}><SocialBrandIcon brand="website" /></Pressable> : null}
        {business.social?.facebook ? <Pressable accessibilityLabel="Open Facebook" onPress={() => openTrackedExternal('facebook', business.social.facebook, 'Facebook could not be opened.')} style={styles.socialButton}><SocialBrandIcon brand="facebook" /></Pressable> : null}
        {business.social?.instagram ? <Pressable accessibilityLabel="Open Instagram" onPress={() => openTrackedExternal('instagram', business.social.instagram, 'Instagram could not be opened.')} style={styles.socialButton}><SocialBrandIcon brand="instagram" /></Pressable> : null}
        {(business.social?.twitter || business.social?.x) ? <Pressable accessibilityLabel="Open X" onPress={() => openTrackedExternal('x', business.social.twitter || business.social.x, 'X could not be opened.')} style={styles.socialButton}><SocialBrandIcon brand="x" /></Pressable> : null}
      </View> : null}

      <View style={styles.tabs} accessibilityRole="tablist">
        {[
          { id: 'about', label: 'About' },
          { id: 'hours', label: 'Hours' },
          { id: 'promotions', label: `Promotions${businessPromotions.length ? ` (${businessPromotions.length})` : ''}` },
        ].map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.id }}
            onPress={() => { if (item.id === 'hours') onTrackAction?.('hours'); if (item.id === 'promotions') onTrackAction?.('promotions'); setTab(item.id); }}
            style={[styles.tab, tab === item.id && styles.activeTab]}
          >
            <Text style={[styles.tabText, tab === item.id && styles.activeTabText]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'about' ? (
        <View style={styles.section}>
          <Text style={styles.description}>{business.description}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: servicesExpanded }} onPress={() => { if (!servicesExpanded) onTrackAction?.('services'); setServicesExpanded(value => !value); }} style={({ pressed }) => [styles.servicesAction, pressed && styles.pressed]}>
            <View style={styles.servicesActionIcon}><Text style={styles.servicesActionIconText}>{'\u{1F6CD}\uFE0F'}</Text></View>
            <View style={styles.servicesActionCopy}><Text style={styles.servicesActionTitle}>Services & Products Offered</Text><Text style={styles.servicesActionText}>{offeredServices.length} selected {offeredServices.length === 1 ? 'item' : 'items'}</Text></View>
            <Text style={styles.servicesActionChevron}>{servicesExpanded ? '\u2303' : '\u2304'}</Text>
          </Pressable>
          {servicesExpanded ? <View style={styles.servicesPanel}>{offeredServices.length ? offeredServices.map(service => <View key={service} style={styles.serviceChip}><Text style={styles.serviceChipText}>{'\u2713'} {service}</Text></View>) : <Text style={styles.servicesEmpty}>No services or products were supplied.</Text>}</View> : null}
          <InfoRow icon={'\u{1F4CD}'} title={business.suburb} text={business.address} onPress={() => openTrackedExternal('directions', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`, 'Maps could not open this address.')} />
          <InfoRow icon={'\u{1F552}'} title={business.hoursSummary || 'Opening hours'} text="Opening hours may change on public holidays." onPress={() => { onTrackAction?.('hours'); setTab('hours'); }} />
          {business.website ? <InfoRow icon={'\u{1F310}'} title="Website" text={business.website.replace(/^https?:\/\//, '')} onPress={() => openTrackedExternal('website', business.website, 'The website could not be opened.')} /> : null}
        </View>
      ) : null}

      {tab === 'hours' ? (
        <View style={styles.section}>
          {hoursRows.length ? hoursRows.map(([day, hours]) => (
            <View key={day} style={styles.hoursRow}>
              <Text style={styles.hoursDay}>{day}</Text>
              <Text style={styles.hoursValue}>{hours}</Text>
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Hours not supplied</Text>
              <Text style={styles.emptyText}>Contact the business to confirm its opening hours.</Text>
            </View>
          )}
        </View>
      ) : null}

      {tab === 'promotions' ? (
        <View style={styles.section}>
          {businessPromotions.length ? businessPromotions.map(promotion => (
            <View key={promotion.id} style={styles.promotionCard}>
              <Text style={styles.promotionEyebrow}>{promotion.boosted ? 'SPONSORED OFFER' : 'BUSINESS-SUPPLIED OFFER'}</Text>
              <Text style={styles.promotionTitle}>{promotion.title}</Text>
              <Text style={styles.promotionOffer}>{promotion.discountText || promotion.briefText}</Text>
              <Text style={styles.promotionDetails}>{promotion.fullDetails}</Text>
              <Text style={styles.promotionEnd}>Available {promotion.startDate} to {promotion.endDate}</Text>
            </View>
          )) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No active promotions</Text>
              <Text style={styles.emptyText}>Check back later for new business promotions.</Text>
            </View>
          )}
        </View>
      ) : null}

      <Modal transparent visible={contactOpen} animationType="fade" onRequestClose={() => setContactOpen(false)}>
        <View style={styles.contactModal}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setContactOpen(false)} />
          <View style={styles.contactCard}>
            <Text style={styles.contactTitle}>Contact {business.name}</Text>
            <Text style={styles.contactHelp}>Your message will be delivered through the app to the listing owner. Do not share passwords, verification codes, financial details or sensitive identity information.</Text>
            <TextInput value={contactText} onChangeText={setContactText} multiline maxLength={2000} placeholder="Write your message..." placeholderTextColor={colors.muted} style={styles.contactInput} />
            {contactStatus ? <Text style={styles.contactStatus}>{contactStatus}</Text> : null}
            <Pressable disabled={contactBusy || !contactText.trim()} onPress={contactBusiness} style={[styles.contactSend, (contactBusy || !contactText.trim()) && styles.disabled]}><Text style={styles.contactSendText}>{contactBusy ? 'Sending...' : 'Send Message'}</Text></Pressable>
            <Pressable onPress={() => setContactOpen(false)} style={styles.contactCancel}><Text style={styles.contactCancelText}>Close</Text></Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  backButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 },
  backText: { color: colors.tealDark, fontSize: 15, fontWeight: '900' },
  saveButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  saveButtonActive: { backgroundColor: '#fff0f4', borderColor: '#f1c7d4' },
  saveIcon: { color: colors.muted, fontSize: 27, fontWeight: '900' },
  saveIconActive: { color: '#d43867' },
  cover: { height: 188, marginHorizontal: -spacing.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverOrb: { position: 'absolute', width: 210, height: 210, right: -70, bottom: -115, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.12)' },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverFallback: { padding: 40, backgroundColor: '#dff3ef' },
  coverInitials: { color: '#ffffff', fontSize: 58, fontWeight: '900', letterSpacing: 2 },
  logo: { width: 76, height: 76, marginTop: -38, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderRadius: 22, backgroundColor: colors.surface, ...shadow },
  logoText: { fontSize: 23, fontWeight: '900' },
  logoImage: { width: '100%', height: '100%', borderRadius: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  badge: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.tealSoft },
  featuredBadge: { backgroundColor: '#fff0d4' },
  badgeText: { color: colors.tealDark, fontSize: 10, fontWeight: '900' },
  featuredText: { color: '#9a5c05' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  title: { flex: 1, minWidth: 0, color: colors.navy, fontSize: 27, lineHeight: 32, fontWeight: '900' },
  promotionPulse: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 99, backgroundColor: '#fff0d4' },
  promotionPulseIcon: { fontSize: 13 },
  promotionPulseText: { color: '#9a5c05', fontSize: 8, fontWeight: '900' },
  metaSummary: { marginTop: 5, color: colors.muted, fontSize: 13, fontWeight: '700' },
  verified: { alignSelf: 'flex-start', marginTop: spacing.sm, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#eaf5ea' },
  verifiedText: { color: '#337641', fontSize: 11, fontWeight: '900' },
  disclaimerCard: { marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: '#bfded7', borderRadius: radius.md, backgroundColor: colors.tealSoft },
  disclaimerTitle: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  disclaimerText: { marginTop: 4, color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  actionGrid: { flexDirection: 'row', gap: 7, marginTop: spacing.lg },
  action: { flex: 1, minWidth: 0, minHeight: 68, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  actionIcon: { color: colors.tealDark, fontSize: 20, fontWeight: '900' },
  actionLabel: { marginTop: 4, color: colors.tealDark, fontSize: 10, fontWeight: '900' },
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  socialButton: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, ...shadow },
  brandTile: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, overflow: 'hidden' },
  facebookTile: { backgroundColor: '#1877F2' },
  instagramTile: { backgroundColor: '#D62976', borderColor: '#F9CE34', borderWidth: 2 },
  xTile: { backgroundColor: '#050505' },
  xMark: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  websiteTile: { backgroundColor: colors.tealSoft },
  tabs: { flexDirection: 'row', marginTop: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: colors.teal },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  activeTabText: { color: colors.tealDark, fontWeight: '900' },
  section: { paddingVertical: spacing.lg },
  description: { marginBottom: spacing.lg, color: colors.text, fontSize: 15, lineHeight: 23, fontWeight: '600' },
  servicesAction: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: '#b9ddd6', borderRadius: radius.md, backgroundColor: colors.tealSoft },
  servicesActionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surface },
  servicesActionIconText: { fontSize: 20 },
  servicesActionCopy: { flex: 1, minWidth: 0 },
  servicesActionTitle: { color: colors.tealDark, fontSize: 13, fontWeight: '900' },
  servicesActionText: { marginTop: 2, color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  servicesActionChevron: { color: colors.tealDark, fontSize: 20, fontWeight: '900' },
  servicesPanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#f7fbfa' },
  serviceChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  serviceChipText: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  servicesEmpty: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  infoRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#edf2f1' },
  infoIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.tealSoft },
  infoIcon: { color: colors.tealDark, fontSize: 17, fontWeight: '900' },
  infoCopy: { flex: 1, minWidth: 0 },
  infoTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  infoText: { marginTop: 3, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  infoChevron: { alignSelf: 'center', color: colors.tealDark, fontSize: 22, fontWeight: '900' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#edf2f1' },
  hoursDay: { color: colors.navy, fontSize: 13, fontWeight: '800' },
  hoursValue: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  promotionCard: { marginBottom: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: '#f0d6aa', borderRadius: radius.md, backgroundColor: '#fff7e9' },
  promotionEyebrow: { color: '#9a5c05', fontSize: 10, fontWeight: '900' },
  promotionTitle: { marginTop: 5, color: colors.navy, fontSize: 17, fontWeight: '900' },
  promotionOffer: { marginTop: 4, color: '#aa6507', fontSize: 14, fontWeight: '900' },
  promotionDetails: { marginTop: spacing.sm, color: colors.text, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  promotionEnd: { marginTop: spacing.sm, color: colors.muted, fontSize: 11, fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  emptyTitle: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  emptyText: { marginTop: spacing.sm, color: colors.muted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  contactModal: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(15,23,42,0.46)' },
  contactCard: { width: '100%', maxWidth: 440, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  contactTitle: { color: colors.navy, fontSize: 20, fontWeight: '900' }, contactHelp: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18 },
  contactInput: { minHeight: 130, marginTop: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, textAlignVertical: 'top' },
  contactStatus: { marginTop: spacing.sm, color: colors.tealDark, fontSize: 12, fontWeight: '800' },
  contactSend: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.teal }, contactSendText: { color: colors.surface, fontWeight: '900' },
  contactCancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, contactCancelText: { color: colors.tealDark, fontWeight: '900' }, disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76 },
});
