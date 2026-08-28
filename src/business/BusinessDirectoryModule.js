import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import BusinessCard from './BusinessCard';
import BusinessDetailsScreen from './BusinessDetailsScreen';
import BusinessListingForm from './BusinessListingForm';
import BusinessOwnerScreen from './BusinessOwnerScreen';
import BusinessPromotionForm from './BusinessPromotionForm';
import DirectoryBottomNavigation from './DirectoryBottomNavigation';
import BusinessAdminDashboard from './BusinessAdminDashboard';
import BusinessInboxScreen from './BusinessInboxScreen';
import BusinessSupportInboxScreen from './BusinessSupportInboxScreen';
import BusinessNotificationsScreen from './BusinessNotificationsScreen';
import {
  BUSINESS_CATEGORIES,
  filterAndRankBusinesses,
} from './businessData';
import { cityLabel, normalizeCity } from '../utils/cities';
import { colors, radius, shadow, spacing } from '../theme';
import {
  assertBusinessSubmissionConnectivity,
  createBusinessPromotion,
  createBusinessSubmission,
  deleteBusinessPromotion,
  listenActiveBusinessPromotions,
  listenApprovedBusinesses,
  listenOwnerBusinessPromotions,
  listenOwnerBusinesses,
  updateBusinessPromotion,
  updateBusinessSubmission,
} from '../services/businesses';
import { deleteBusinessImage, uploadBusinessImage } from '../services/images';
import { toggleSavedBusiness } from '../services/users';
import { friendlyError } from '../utils/errors';
import CitySelector from '../components/CitySelector';
import CompactSelect from '../components/CompactSelect';
import { sendFeedbackMessage } from '../services/messaging';
import { listenBusinessCategories } from '../services/businessCategoryAdmin';

function SectionHeading({ title, subtitle, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <Text style={styles.textButtonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CardGrid({ businesses, savedIds, onOpen, onToggleSaved }) {
  const rows = [];
  for (let index = 0; index < businesses.length; index += 2) rows.push(businesses.slice(index, index + 2));
  return rows.map((row, index) => (
    <View key={`business-row-${index}`} style={styles.cardRow}>
      {row.map(business => (
        <BusinessCard
          key={business.id}
          business={business}
          saved={savedIds.includes(business.id)}
          onPress={() => onOpen(business)}
          onToggleSaved={() => onToggleSaved(business)}
        />
      ))}
      {row.length === 1 ? <View style={styles.cardSpacer} /> : null}
    </View>
  ));
}

function businessOpenState(hours = {}) {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const row = hours?.[keys[new Date().getDay()]];
  if (!row) return null;
  if (row.closed) return false;
  if (!/^\d{2}:\d{2}$/.test(row.open || '') || !/^\d{2}:\d{2}$/.test(row.close || '')) return null;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [openHour, openMinute] = row.open.split(':').map(Number);
  const [closeHour, closeMinute] = row.close.split(':').map(Number);
  const open = openHour * 60 + openMinute;
  const close = closeHour * 60 + closeMinute;
  return close < open ? current >= open || current <= close : current >= open && current <= close;
}

function distanceKm(from, to) {
  if (!Number.isFinite(Number(from?.latitude)) || !Number.isFinite(Number(from?.longitude))
    || !Number.isFinite(Number(to?.latitude)) || !Number.isFinite(Number(to?.longitude))) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(Number(to.latitude) - Number(from.latitude));
  const longitudeDelta = radians(Number(to.longitude) - Number(from.longitude));
  const startLatitude = radians(Number(from.latitude));
  const endLatitude = radians(Number(to.latitude));
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

function publicBusinessRecord(business = {}, userLocation = null) {
  const name = business.name || 'Community Business';
  return {
    ...business,
    initials: business.initials || name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(),
    category: business.category || 'Other',
    city: business.location?.city || business.city || 'rest-of-australia',
    suburb: business.location?.suburb || business.suburb || '',
    address: business.location?.fullAddress || business.address || '',
    phone: business.contact?.phone || business.phone || '',
    whatsapp: business.contact?.whatsapp || business.whatsapp || '',
    website: business.contact?.website || business.website || '',
    distanceKm: userLocation ? distanceKm(userLocation, business.location) : business.distanceKm ?? null,
    openNow: typeof business.openNow === 'boolean' ? business.openNow : businessOpenState(business.hours),
    verified: business.abnVerified === true,
    verificationBadge: business.abnVerified === true ? 'ABN Verified' : '',
    coverColor: business.coverColor || colors.teal,
  };
}

function DirectoryHome({ businesses, categories, city, savedIds, loading, error, initialFilter, onInitialFilterConsumed, onCityChange, onLocationResolved, onOpenBusiness, onToggleSaved }) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const selectedCategory = categories.find(category => category.id === categoryId);

  useEffect(() => {
    if (!initialFilter?.nonce) return;
    setCategoryId(initialFilter.categoryId || 'all');
    setSubcategoryId(initialFilter.subcategoryId || '');
    setQuery('');
    setOpenOnly(false);
    onInitialFilterConsumed?.();
  }, [initialFilter?.nonce, onInitialFilterConsumed]);

  const cityBusinesses = useMemo(() => filterAndRankBusinesses({
    businesses,
    categoryId,
    subcategoryId,
    city,
    query,
    openOnly,
  }), [businesses, categoryId, city, openOnly, query, subcategoryId]);
  const featured = cityBusinesses.filter(business => business.tier === 'featured');

  return (
    <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>COMMUNITY BUSINESS DIRECTORY</Text>
          <Text style={styles.heroTitle}>Discover local businesses</Text>
          <Text style={styles.heroSubtitle}>{cityLabel(city)}</Text>
        </View>
        <View style={styles.heroIconWrap}><Text style={styles.heroIcon}>{'\u{1F3EA}'}</Text></View>
      </View>

      <View style={styles.directoryControls}>
      <CitySelector selectedCity={city} onChange={onCityChange} onLocationResolved={onLocationResolved} allowCurrentLocation />
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>{'\u2315'}</Text>
          <TextInput
            accessibilityLabel="Search businesses"
            value={query}
            onChangeText={setQuery}
            placeholder="Search businesses or services"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
        <Pressable
          accessibilityLabel="Only show businesses open now"
          accessibilityRole="button"
          accessibilityState={{ selected: openOnly }}
          onPress={() => setOpenOnly(current => !current)}
          style={({ pressed }) => [styles.openButton, openOnly && styles.openButtonActive, pressed && styles.pressed]}
        >
          <Text style={[styles.openButtonText, openOnly && styles.openButtonTextActive]}>OPEN</Text>
        </Pressable>
      </View>

      <SectionHeading title="Categories" subtitle={subcategoryId ? `Filtered: ${selectedCategory?.subcategories.find(item => item.id === subcategoryId)?.label || 'Selected service'}` : 'Browse by service'} actionLabel={categoryId === 'all' && !subcategoryId ? '' : 'Clear'} onAction={() => { setCategoryId('all'); setSubcategoryId(''); }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
        <Pressable onPress={() => { setCategoryId('all'); setSubcategoryId(''); }} style={[styles.category, categoryId === 'all' && styles.categoryActive]}>
          <Text style={[styles.categoryIcon, categoryId === 'all' && styles.categoryIconActive]}>{'\u2726'}</Text>
          <Text style={[styles.categoryLabel, categoryId === 'all' && styles.categoryLabelActive]}>All</Text>
        </Pressable>
        {categories.map(category => {
          const active = categoryId === category.id;
          return (
            <Pressable key={category.id} onPress={() => { setCategoryId(category.id); setSubcategoryId(''); }} style={[styles.category, active && styles.categoryActive]}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text numberOfLines={2} style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{category.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedCategory ? (
        <View style={styles.subcategoryPanel}>
          <Text style={styles.subcategoryLabel}>SELECT SERVICE</Text>
          <CompactSelect
            options={[{ value: '', label: `All ${selectedCategory.label}` }, ...selectedCategory.subcategories.map(item => ({ value: item.id, label: item.label }))]}
            value={subcategoryId}
            onChange={setSubcategoryId}
            placeholder={`All ${selectedCategory.label}`}
          />
        </View>
      ) : null}
      </View>

      {subcategoryId === 'niaz-preparation-and-supply' ? (
        <View style={styles.serviceFilter}>
          <Text style={styles.serviceFilterIcon}>{'\u{1F372}'}</Text>
          <View style={styles.serviceFilterCopy}>
            <Text style={styles.serviceFilterTitle}>Niaz Arrangement</Text>
            <Text style={styles.serviceFilterText}>Niaz preparation and supply in {cityLabel(city).replace(', Australia', '')}</Text>
          </View>
        </View>
      ) : null}

      {featured.length ? (
        <>
          <SectionHeading title="Featured this week" subtitle="Promoted community businesses" />
          <CardGrid businesses={featured} savedIds={savedIds} onOpen={onOpenBusiness} onToggleSaved={onToggleSaved} />
        </>
      ) : null}

      <SectionHeading
        title={categoryId === 'all' ? 'All businesses' : categories.find(category => category.id === categoryId)?.label || 'Businesses'}
        subtitle={`${cityBusinesses.length} result${cityBusinesses.length === 1 ? '' : 's'} in ${cityLabel(city).replace(', Australia', '')}`}
      />
      {loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\u231B'}</Text>
          <Text style={styles.emptyTitle}>Loading businesses</Text>
          <Text style={styles.emptyText}>Checking approved listings for {cityLabel(city).replace(', Australia', '')}.</Text>
        </View>
      ) : error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Directory unavailable</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : cityBusinesses.length ? (
        <View style={styles.businessList}>
          {cityBusinesses.map(business => (
            <Pressable key={business.id} onPress={() => onOpenBusiness(business)} style={({ pressed }) => [styles.businessRow, pressed && styles.pressed]}>
              <View style={[styles.rowLogo, { backgroundColor: '#eaf7f5' }]}>
                <Image source={business.logoUrl ? { uri: business.logoUrl } : require('../../assets/business-placeholder.png')} resizeMode="cover" style={styles.rowLogoImage} />
              </View>
              <View style={styles.rowCopy}>
                <View style={styles.rowTitleLine}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{business.name}</Text>
                  {business.tier === 'featured' ? <Text style={styles.featuredStar}>{'\u2605'}</Text> : null}
                </View>
                <Text numberOfLines={1} style={styles.rowMeta}>{business.category} · {business.suburb}</Text>
                <View style={styles.rowStatusLine}>
                  {business.distanceKm != null ? <Text style={styles.rowMeta}>{business.distanceKm} km</Text> : null}
                  {typeof business.openNow === 'boolean' ? <Text style={[styles.rowMeta, business.openNow ? styles.openText : styles.closedText]}>{business.openNow ? 'Open now' : 'Closed'}</Text> : null}
                  {business.distanceKm == null && typeof business.openNow !== 'boolean' ? <Text style={styles.rowMeta}>View business details</Text> : null}
                </View>
              </View>
              <Text style={styles.chevron}>{'\u203A'}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\u2315'}</Text>
          <Text style={styles.emptyTitle}>No businesses found</Text>
          <Text style={styles.emptyText}>Try another search, category or city.</Text>
          <Pressable onPress={() => { setQuery(''); setCategoryId('all'); setOpenOnly(false); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Clear filters</Text>
          </Pressable>
        </View>
      )}

    </ScrollView>
  );
}

function PromotionsScreen({ city, businesses, promotions, ownerPromotions = [], loading, error, onOpenBusiness }) {
  const selectedCity = city ? normalizeCity(city) : '';
  const today = new Date().toISOString().slice(0, 10);
  const ownedActiveIds = new Set(ownerPromotions.filter(item => item.status === 'active'
    && item.hidden !== true
    && (!item.startDate || item.startDate <= today)
    && (!item.endDate || item.endDate >= today)).map(item => item.id));
  const rows = promotions
    .map(promotion => ({ ...promotion, business: businesses.find(business => business.id === promotion.businessId) }))
    .filter(item => {
      if (!item.business) return false;
      const businessCity = item.business.city || item.business.location?.city;
      return ownedActiveIds.has(item.id) || !selectedCity || !businessCity || normalizeCity(businessCity) === selectedCity;
    })
    .sort((left, right) => Number(ownedActiveIds.has(right.id)) - Number(ownedActiveIds.has(left.id)) || Number(right.boosted) - Number(left.boosted));
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.eyebrow}>COMMUNITY OFFERS</Text>
      <Text style={styles.pageTitle}>Promotions</Text>
      <Text style={styles.pageSubtitle}>Your active promotions appear first, followed by current offers for {cityLabel(city).replace(', Australia', '')}. Tap an offer to view the business.</Text>
      {loading ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Loading promotions</Text></View> : null}
      {error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Promotions unavailable</Text><Text style={styles.errorText}>{error}</Text></View> : null}
      {!loading && !error && !rows.length ? <View style={styles.emptyCard}><Text style={styles.emptyIcon}>{'\u{1F3F7}\uFE0F'}</Text><Text style={styles.emptyTitle}>No active promotions</Text><Text style={styles.emptyText}>Approved community offers will appear here.</Text></View> : null}
      <View style={styles.promotionList}>
        {rows.map(item => (
          <Pressable key={item.id} onPress={() => onOpenBusiness(item.business)} style={({ pressed }) => [styles.promotionCard, pressed && styles.pressed]}>
            <View style={styles.promotionVisual}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} resizeMode="cover" style={styles.promotionImage} /> : <Text style={styles.promotionIcon}>{'\u{1F3F7}\uFE0F'}</Text>}
              {item.boosted ? <View style={styles.boostedPill}><Text style={styles.boostedText}>{'\u2605'} FEATURED</Text></View> : null}
            </View>
            <View style={styles.promotionCopy}>
              <Text style={styles.promotionTitle}>{item.title}</Text>
              <Text style={styles.promotionOffer}>{item.discountText || item.briefText}</Text>
              <View style={styles.promotionFooter}>
                <Text numberOfLines={1} style={styles.promotionBusiness}>{item.business.name}</Text>
                <Text style={styles.promotionEnd}>Ends {item.endDate}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function FavouritesScreen({ businesses, savedIds, onOpenBusiness, onToggleSaved, onBrowse }) {
  const savedBusinesses = businesses.filter(business => savedIds.includes(business.id));
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.eyebrow}>SAVED FOR LATER</Text>
      <Text style={styles.pageTitle}>Business Favourites</Text>
      <Text style={styles.pageSubtitle}>Your event Favourites remain available in the Events module.</Text>
      {savedBusinesses.length ? (
        <CardGrid businesses={savedBusinesses} savedIds={savedIds} onOpen={onOpenBusiness} onToggleSaved={onToggleSaved} />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\u2661'}</Text>
          <Text style={styles.emptyTitle}>No saved businesses yet</Text>
          <Text style={styles.emptyText}>Tap the heart on a business to save it here across your signed-in devices.</Text>
          <Pressable onPress={onBrowse} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Browse businesses</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function AddBusinessPreview({ onOpenAccount }) {
  return (
    <ScrollView contentContainerStyle={styles.pageContent}>
      <Text style={styles.eyebrow}>BUSINESS OWNERS</Text>
      <Text style={styles.pageTitle}>List your business</Text>
      <Text style={styles.pageSubtitle}>Sign in with your verified mobile account to submit and manage a business listing.</Text>
      <View style={styles.stepsCard}>
        {[
          ['1', 'Business details', 'Name, category, services and ABN status'],
          ['2', 'Contact & location', 'Phone, Google address and opening hours'],
          ['3', 'Photos & approval', 'Logo, gallery and owner declaration'],
        ].map(([number, title, text]) => (
          <View key={number} style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
            <View style={styles.stepCopy}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepText}>{text}</Text></View>
          </View>
        ))}
      </View>
      <Pressable onPress={onOpenAccount} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Login / Create Account</Text>
      </Pressable>
    </ScrollView>
  );
}

function DirectorySupportScreen({ mode, onBack, businesses = [], user, profile, city }) {
  const report = mode === 'report';
  const [businessId, setBusinessId] = useState('');
  const [topic, setTopic] = useState(report ? 'Incorrect information' : 'Directory support');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const selectedBusiness = businesses.find(item => item.id === businessId);

  const submit = async () => {
    setStatus('');
    if (report && !selectedBusiness) {
      setStatus('Choose the business you are reporting.');
      return;
    }
    if (message.trim().length < 10) {
      setStatus('Add at least 10 characters explaining the issue.');
      return;
    }
    setBusy(true);
    try {
      const heading = report
        ? `BUSINESS REPORT\nBusiness: ${selectedBusiness.name}\nBusiness ID: ${selectedBusiness.id}\nReason: ${topic}`
        : `BUSINESS DIRECTORY CONTACT\nTopic: ${topic}`;
      await sendFeedbackMessage({
        user,
        profile,
        city,
        target: 'cityAdmins',
        module: 'business',
        category: report ? 'business-report' : 'directory-contact',
        subject: report ? `${topic}: ${selectedBusiness.name}` : topic,
        businessId: selectedBusiness?.id || '',
        businessName: selectedBusiness?.name || '',
        text: `${heading}\n\n${message.trim()}`,
      });
      setMessage('');
      if (report) setBusinessId('');
      setStatus(report ? 'Report submitted to the directory team.' : 'Message sent to the directory team.');
    } catch (error) {
      setStatus(friendlyError(error, 'Could not send this message.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{'\u2039'} Back to Directory</Text></Pressable>
      <Text style={styles.eyebrow}>COMMUNITY BUSINESSES AUSTRALIA</Text>
      <Text style={styles.pageTitle}>{report ? 'Report a Business' : 'Contact Us'}</Text>
      <Text style={styles.pageSubtitle}>{report
        ? 'Report inaccurate, unsafe, unlawful or inappropriate business information to the directory team.'
        : 'Contact the Community Businesses Australia team for directory assistance.'}</Text>
      <View style={styles.supportCard}>
        <Text style={styles.sectionIcon}>{report ? '\u{1F6A9}' : '\u{1F4AC}'}</Text>
        {report ? <>
          <Text style={styles.supportLabel}>BUSINESS</Text>
          <CompactSelect options={businesses.map(item => ({ value: item.id, label: `${item.name} · ${item.suburb || item.location?.suburb || 'Australia'}` }))} value={businessId} onChange={setBusinessId} placeholder="Choose the business" />
        </> : null}
        <Text style={styles.supportLabel}>{report ? 'REPORT REASON' : 'TOPIC'}</Text>
        <CompactSelect
          options={(report
            ? ['Incorrect information', 'Misleading or unsafe conduct', 'Suspected fraud or impersonation', 'Inappropriate content', 'Business closed', 'Other']
            : ['Directory support', 'Business listing question', 'Privacy or legal question', 'Technical problem', 'Partnership enquiry', 'Other'])
            .map(value => ({ value, label: value }))}
          value={topic}
          onChange={setTopic}
        />
        <Text style={styles.supportLabel}>DETAILS</Text>
        <TextInput value={message} onChangeText={value => { setMessage(value); setStatus(''); }} multiline maxLength={2500} placeholder={report ? 'Explain what is wrong and include facts the directory team can check…' : 'How can we help?'} placeholderTextColor={colors.muted} style={styles.supportInput} textAlignVertical="top" />
        <Text style={styles.supportSafety}>Do not include passwords, verification codes, bank details or identity documents. For immediate danger or suspected crime, contact the appropriate Australian authority.</Text>
        {status ? <Text style={status.startsWith('Report submitted') || status.startsWith('Message sent') ? styles.supportSuccess : styles.supportError}>{status}</Text> : null}
        <Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.primaryButtonText}>{busy ? 'Sending…' : report ? 'Submit Report' : 'Send Message'}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

export default function BusinessDirectoryModule({
  activeTab = 'home',
  onTabChange,
  selectedBusinessId = '',
  onSelectBusiness,
  selectedCity,
  isGuest = false,
  currentUser,
  profile,
  onOpenAccount,
  onEditingStateChange,
  onCityChange,
  initialFilter,
  onInitialFilterConsumed,
}) {
  const [savedIds, setSavedIds] = useState([]);
  const [approvedBusinesses, setApprovedBusinesses] = useState([]);
  const [businessCategories, setBusinessCategories] = useState(BUSINESS_CATEGORIES);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState('');
  const [activePromotions, setActivePromotions] = useState([]);
  const [promotionsLoading, setPromotionsLoading] = useState(true);
  const [promotionsError, setPromotionsError] = useState('');
  const [ownerBusinesses, setOwnerBusinesses] = useState([]);
  const [ownerPromotions, setOwnerPromotions] = useState([]);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [ownerError, setOwnerError] = useState('');
  const [ownerPromotionError, setOwnerPromotionError] = useState('');
  const [listingFormOpen, setListingFormOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [listingBusy, setListingBusy] = useState(false);
  const [listingError, setListingError] = useState('');
  const [listingSuccess, setListingSuccess] = useState('');
  const [promotionFormOpen, setPromotionFormOpen] = useState(false);
  const [promotionBusinessId, setPromotionBusinessId] = useState('');
  const [editingPromotion, setEditingPromotion] = useState(null);
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [promotionFormError, setPromotionFormError] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const activePromotionBusinessIds = useMemo(() => new Set(activePromotions.map(item => item.businessId)), [activePromotions]);
  const directoryBusinesses = useMemo(() => approvedBusinesses.map(business => ({
    ...publicBusinessRecord(business, userLocation),
    hasActivePromotion: activePromotionBusinessIds.has(business.id),
  })), [activePromotionBusinessIds, approvedBusinesses, userLocation]);
  const selectedBusiness = directoryBusinesses.find(business => business.id === selectedBusinessId);

  useEffect(() => {
    setSavedIds(Array.isArray(profile?.savedBusinesses) ? profile.savedBusinesses : []);
  }, [currentUser?.uid, profile?.savedBusinesses]);

  useEffect(() => listenApprovedBusinesses(
    businesses => {
      setApprovedBusinesses(businesses);
      setPublicLoading(false);
      setPublicError('');
    },
    error => {
      setApprovedBusinesses([]);
      setPublicLoading(false);
      setPublicError(friendlyError(error, 'Could not load approved businesses.'));
    }
  ), []);

  useEffect(() => listenBusinessCategories(
    setBusinessCategories,
    () => setBusinessCategories(BUSINESS_CATEGORIES)
  ), []);

  useEffect(() => listenActiveBusinessPromotions(
    promotions => {
      setActivePromotions(promotions);
      setPromotionsLoading(false);
      setPromotionsError('');
    },
    error => {
      setActivePromotions([]);
      setPromotionsLoading(false);
      setPromotionsError(friendlyError(error, 'Could not load active promotions.'));
    }
  ), []);

  useEffect(() => {
    onEditingStateChange?.(listingFormOpen || promotionFormOpen);
    return () => onEditingStateChange?.(false);
  }, [listingFormOpen, onEditingStateChange, promotionFormOpen]);

  useEffect(() => {
    if (activeTab === 'add') return;
    setListingFormOpen(false);
    setPromotionFormOpen(false);
    setEditingBusiness(null);
    setEditingPromotion(null);
    setPromotionBusinessId('');
    setListingError('');
    setListingSuccess('');
    setPromotionFormError('');
  }, [activeTab]);

  useEffect(() => {
    if (isGuest || !currentUser?.uid) {
      setOwnerBusinesses([]);
      setOwnerPromotions([]);
      setOwnerLoading(false);
      setOwnerError('');
      setOwnerPromotionError('');
      return undefined;
    }
    setOwnerLoading(true);
    setOwnerError('');
    const unsubscribe = listenOwnerBusinesses(
      currentUser.uid,
      businesses => {
        setOwnerBusinesses(businesses);
        setOwnerLoading(false);
        setOwnerError('');
      },
      error => {
        setOwnerLoading(false);
        setOwnerError(friendlyError(error, 'Could not load your business listings.'));
      }
    );
    const unsubscribePromotions = listenOwnerBusinessPromotions(
      currentUser.uid,
      promotions => {
        setOwnerPromotions(promotions);
        setOwnerPromotionError('');
      },
      error => setOwnerPromotionError(friendlyError(error, 'Could not load your promotions.'))
    );
    return () => {
      unsubscribe?.();
      unsubscribePromotions?.();
    };
  }, [currentUser?.uid, isGuest]);

  const openBusiness = business => onSelectBusiness?.(business?.id || '');
  const toggleSaved = async business => {
    if (isGuest) {
      Alert.alert('Sign in required', 'Sign in or create an account to save business Favourites.');
      onOpenAccount?.();
      return;
    }
    const shouldSave = !savedIds.includes(business.id);
    setSavedIds(current => shouldSave
      ? [...new Set([...current, business.id])]
      : current.filter(id => id !== business.id));
    try {
      await toggleSavedBusiness(currentUser.uid, business.id, shouldSave);
    } catch (error) {
      setSavedIds(current => shouldSave
        ? current.filter(id => id !== business.id)
        : [...new Set([...current, business.id])]);
      Alert.alert('Could not update Favourites', friendlyError(error, 'Please try again.'));
    }
  };
  const changeTab = nextTab => {
    if (nextTab === 'profile') {
      onOpenAccount?.();
      return;
    }
    onSelectBusiness?.('');
    if (nextTab !== 'add') {
      setListingFormOpen(false);
      setPromotionFormOpen(false);
      setEditingBusiness(null);
      setEditingPromotion(null);
      setListingError('');
      setListingSuccess('');
      setPromotionFormError('');
    }
    if (nextTab === 'add' && !isGuest) {
      setEditingBusiness(null);
      setListingError('');
      setListingSuccess('');
      setListingFormOpen(true);
    }
    onTabChange?.(nextTab);
  };

  const openNewListing = () => {
    setEditingBusiness(null);
    setListingError('');
    setListingSuccess('');
    setListingFormOpen(true);
    onTabChange?.('add');
  };

  const openEditListing = business => {
    setEditingBusiness(business);
    setListingError('');
    setListingSuccess('');
    setListingFormOpen(true);
    onTabChange?.('add');
  };

  const saveListing = async payload => {
    if (!currentUser?.uid || isGuest) {
      onOpenAccount?.();
      return;
    }
    setListingBusy(true);
    setListingError('');
    setListingSuccess('');
    const uploadedPaths = [];
    try {
      await assertBusinessSubmissionConnectivity();
      const {
        _localLogoUri,
        _localLogoMimeType,
        _localCoverUri,
        _localCoverMimeType,
        ...businessPayload
      } = payload;
      const uploadReference = editingBusiness?.id || `new-${Date.now()}`;
      const logo = _localLogoUri
        ? await uploadBusinessImage(_localLogoUri, currentUser.uid, uploadReference, 'logo', _localLogoMimeType)
        : null;
      if (logo?.imagePath) uploadedPaths.push(logo.imagePath);
      const cover = _localCoverUri
        ? await uploadBusinessImage(_localCoverUri, currentUser.uid, uploadReference, 'cover', _localCoverMimeType)
        : null;
      if (cover?.imagePath) uploadedPaths.push(cover.imagePath);
      const submission = {
        ...businessPayload,
        ...(logo ? { logoUrl: logo.imageUrl, logoPath: logo.imagePath } : {}),
        ...(cover ? { coverUrl: cover.imageUrl, coverPath: cover.imagePath } : {}),
      };
      if (editingBusiness?.id) {
        await updateBusinessSubmission(editingBusiness.id, submission);
        const oldPaths = [editingBusiness.logoPath, editingBusiness.coverPath].filter(Boolean);
        const retainedPaths = new Set([submission.logoPath, submission.coverPath].filter(Boolean));
        await Promise.allSettled(oldPaths.filter(path => !retainedPaths.has(path)).map(deleteBusinessImage));
        setListingSuccess('Business updated and resubmitted for approval.');
      } else {
        const reference = await createBusinessSubmission(submission);
        setListingSuccess(`Business submitted for approval. Reference: ${reference}`);
      }
      setListingFormOpen(false);
      setEditingBusiness(null);
      onTabChange?.('my-businesses');
      Alert.alert('Submission received', editingBusiness?.id
        ? 'Your changes are now waiting for approval.'
        : 'Your business listing is now waiting for central approval.');
    } catch (error) {
      await Promise.allSettled(uploadedPaths.map(deleteBusinessImage));
      const message = friendlyError(error, 'Could not save the business listing.');
      setListingError(message);
      Alert.alert('Business not submitted', message);
    } finally {
      setListingBusy(false);
    }
  };

  const approvedOwnerBusinesses = ownerBusinesses.filter(business => business.status === 'approved' && business.hidden !== true);

  const openNewPromotion = business => {
    setPromotionBusinessId(business?.id || approvedOwnerBusinesses[0]?.id || '');
    setEditingPromotion(null);
    setPromotionFormError('');
    setPromotionFormOpen(true);
    onTabChange?.('add');
  };

  const openEditPromotion = promotion => {
    setPromotionBusinessId(promotion.businessId);
    setEditingPromotion(promotion);
    setPromotionFormError('');
    setPromotionFormOpen(true);
    onTabChange?.('add');
  };

  const savePromotion = async payload => {
    setPromotionBusy(true);
    setPromotionFormError('');
    let uploadedImage = null;
    try {
      const { businessId, _localImageUri, _localImageMimeType, ...promotionPayload } = payload;
      if (_localImageUri) {
        uploadedImage = await uploadBusinessImage(
          _localImageUri,
          currentUser.uid,
          editingPromotion?.id || `promotion-${Date.now()}`,
          'promotion',
          _localImageMimeType
        );
      }
      const submission = {
        ...promotionPayload,
        ...(uploadedImage ? { imageUrl: uploadedImage.imageUrl, imagePath: uploadedImage.imagePath } : {}),
      };
      if (editingPromotion?.id) {
        await updateBusinessPromotion(editingPromotion.id, submission);
        if (editingPromotion.imagePath && editingPromotion.imagePath !== submission.imagePath) {
          await Promise.allSettled([deleteBusinessImage(editingPromotion.imagePath)]);
        }
      } else {
        await createBusinessPromotion(businessId, submission);
      }
      setPromotionFormOpen(false);
      setEditingPromotion(null);
      setPromotionBusinessId('');
      onTabChange?.('my-businesses');
      Alert.alert('Promotion submitted', 'The promotion is private until the central admin team approves it.');
    } catch (error) {
      if (uploadedImage?.imagePath) await Promise.allSettled([deleteBusinessImage(uploadedImage.imagePath)]);
      setPromotionFormError(friendlyError(error, 'Could not save the promotion.'));
    } finally {
      setPromotionBusy(false);
    }
  };

  const confirmDeletePromotion = promotion => {
    Alert.alert('Delete promotion?', 'This permanently removes the promotion.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBusinessPromotion(promotion.id);
            if (promotion.imagePath) await Promise.allSettled([deleteBusinessImage(promotion.imagePath)]);
          } catch (error) {
            Alert.alert('Could not delete promotion', friendlyError(error, 'Please try again.'));
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.module}>
      <View style={styles.moduleBody}>
        {selectedBusiness ? (
          <BusinessDetailsScreen
            business={selectedBusiness}
            promotions={activePromotions}
            saved={savedIds.includes(selectedBusiness.id)}
            onBack={() => onSelectBusiness?.('')}
            onToggleSaved={() => toggleSaved(selectedBusiness)}
            isGuest={isGuest}
            user={currentUser}
            profile={profile}
            onRequireSignIn={onOpenAccount}
          />
        ) : activeTab === 'admin' ? (
          <BusinessAdminDashboard user={currentUser} profile={profile} categories={businessCategories} />
        ) : activeTab === 'inbox' ? (
          <BusinessInboxScreen user={currentUser} profile={profile} onBack={() => changeTab('home')} />
        ) : activeTab === 'feedback' ? (
          <BusinessSupportInboxScreen user={currentUser} profile={profile} onBack={() => changeTab('home')} />
        ) : activeTab === 'notifications' ? (
          <BusinessNotificationsScreen user={currentUser} onBack={() => changeTab('profile')} />
        ) : activeTab === 'report' ? (
          <DirectorySupportScreen mode="report" businesses={directoryBusinesses} user={currentUser} profile={profile} city={selectedCity} onBack={() => changeTab('home')} />
        ) : activeTab === 'contact' ? (
          <DirectorySupportScreen mode="contact" businesses={directoryBusinesses} user={currentUser} profile={profile} city={selectedCity} onBack={() => changeTab('home')} />
        ) : activeTab === 'home' ? (
          <DirectoryHome businesses={directoryBusinesses} categories={businessCategories} city={selectedCity} savedIds={savedIds} loading={publicLoading} error={publicError} initialFilter={initialFilter} onInitialFilterConsumed={onInitialFilterConsumed} onCityChange={city => { setUserLocation(null); onCityChange?.(city); }} onLocationResolved={setUserLocation} onOpenBusiness={openBusiness} onToggleSaved={toggleSaved} />
        ) : activeTab === 'promotions' ? (
          <PromotionsScreen city={selectedCity} businesses={directoryBusinesses} promotions={activePromotions} ownerPromotions={ownerPromotions} loading={promotionsLoading || publicLoading} error={promotionsError || publicError} onOpenBusiness={openBusiness} />
        ) : activeTab === 'add' && isGuest ? (
          <AddBusinessPreview onOpenAccount={onOpenAccount} />
        ) : activeTab === 'add' && promotionFormOpen ? (
          <BusinessPromotionForm
            businesses={approvedOwnerBusinesses}
            initialPromotion={editingPromotion || { businessId: promotionBusinessId }}
            submitting={promotionBusy}
            error={promotionFormError}
            onSubmit={savePromotion}
            onCancel={() => {
              setPromotionFormOpen(false);
              setEditingPromotion(null);
              setPromotionBusinessId('');
              setPromotionFormError('');
              onTabChange?.('my-businesses');
            }}
          />
        ) : activeTab === 'add' && listingFormOpen ? (
          <BusinessListingForm
            categories={businessCategories}
            initialBusiness={editingBusiness}
            defaultCity={selectedCity}
            canSubmit={!isGuest}
            submitting={listingBusy}
            error={listingError}
            success={listingSuccess}
            onSubmit={saveListing}
            onCancel={() => {
              setListingFormOpen(false);
              setEditingBusiness(null);
              setListingError('');
              onTabChange?.('my-businesses');
            }}
            onRequireSignIn={onOpenAccount}
          />
        ) : activeTab === 'my-businesses' ? (
          <BusinessOwnerScreen
            businesses={ownerBusinesses}
            promotions={ownerPromotions}
            loading={ownerLoading}
            error={ownerError}
            promotionError={ownerPromotionError}
            onAdd={openNewListing}
            onEdit={openEditListing}
            onAddPromotion={openNewPromotion}
            onEditPromotion={openEditPromotion}
            onDeletePromotion={confirmDeletePromotion}
          />
        ) : (
          <DirectoryHome businesses={directoryBusinesses} categories={businessCategories} city={selectedCity} savedIds={savedIds} loading={publicLoading} error={publicError} initialFilter={initialFilter} onInitialFilterConsumed={onInitialFilterConsumed} onCityChange={city => { setUserLocation(null); onCityChange?.(city); }} onLocationResolved={setUserLocation} onOpenBusiness={openBusiness} onToggleSaved={toggleSaved} />
        )}
      </View>
      {!listingFormOpen && !promotionFormOpen ? <DirectoryBottomNavigation activeTab={activeTab} onChange={changeTab} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  module: { flex: 1, backgroundColor: colors.background },
  moduleBody: { flex: 1 },
  directoryBar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  directoryBarEyebrow: { color: colors.tealDark, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  directoryBarTitle: { marginTop: 2, color: colors.navy, fontSize: 14, fontWeight: '900' },
  readOnlyPill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.tealSoft },
  readOnlyText: { color: colors.tealDark, fontSize: 9, fontWeight: '900' },
  pageContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  hero: { minHeight: 142, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.tealSoft, overflow: 'hidden' },
  directoryControls: { marginTop: spacing.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  heroCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { marginTop: 7, color: colors.navy, fontSize: 25, lineHeight: 29, fontWeight: '900' },
  heroSubtitle: { marginTop: spacing.sm, color: colors.tealDark, fontSize: 13, fontWeight: '800' },
  heroIconWrap: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface, transform: [{ rotate: '3deg' }], ...shadow },
  heroIcon: { fontSize: 36 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  searchBox: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  searchIcon: { color: colors.muted, fontSize: 22, fontWeight: '900', transform: [{ rotate: '-20deg' }] },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, fontWeight: '700' },
  openButton: { width: 58, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  openButtonActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  openButtonText: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  openButtonTextActive: { color: colors.surface },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.navy, fontSize: 18, fontWeight: '900' },
  sectionSubtitle: { marginTop: 2, color: colors.muted, fontSize: 11, fontWeight: '700' },
  textButton: { padding: 6 },
  textButtonLabel: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  categoryRail: { gap: spacing.sm, paddingRight: spacing.lg },
  category: { width: 86, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 7, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  categoryActive: { borderColor: colors.teal, backgroundColor: colors.teal },
  categoryIcon: { fontSize: 20 },
  categoryIconActive: { color: colors.surface },
  categoryLabel: { color: colors.text, fontSize: 9.5, lineHeight: 12, fontWeight: '800', textAlign: 'center' },
  categoryLabelActive: { color: colors.surface },
  subcategoryPanel: { marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  subcategoryLabel: { marginBottom: 7, color: colors.tealDark, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  serviceFilter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: '#e5c66a', borderRadius: radius.md, backgroundColor: '#fff8df' },
  serviceFilterIcon: { fontSize: 24 },
  serviceFilterCopy: { flex: 1, minWidth: 0 },
  serviceFilterTitle: { color: '#745009', fontSize: 13, fontWeight: '900' },
  serviceFilterText: { marginTop: 2, color: '#80631e', fontSize: 10.5, fontWeight: '700' },
  cardRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  cardSpacer: { flex: 1 },
  businessList: { gap: spacing.sm },
  businessRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow },
  rowLogo: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  rowLogoImage: { width: 48, height: 48, borderRadius: 12 },
  rowLogoText: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowTitle: { flexShrink: 1, color: colors.navy, fontSize: 14, fontWeight: '900' },
  featuredStar: { color: '#a76609', fontSize: 13 },
  rowMeta: { marginTop: 3, color: colors.muted, fontSize: 10.5, fontWeight: '700' },
  rowStatusLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  openText: { color: '#318342' },
  closedText: { color: colors.danger },
  chevron: { color: colors.tealDark, fontSize: 26, fontWeight: '900' },
  pageTitle: { marginTop: 5, color: colors.navy, fontSize: 28, fontWeight: '900' },
  pageSubtitle: { marginTop: spacing.sm, marginBottom: spacing.lg, color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  promotionList: { gap: spacing.md },
  promotionCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  promotionVisual: { height: 102, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff0d9' },
  promotionImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  promotionIcon: { fontSize: 32 },
  boostedPill: { position: 'absolute', left: spacing.md, top: spacing.md, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f4b54a' },
  boostedText: { color: '#5d3902', fontSize: 9, fontWeight: '900' },
  promotionCopy: { padding: spacing.lg },
  promotionTitle: { color: colors.navy, fontSize: 17, fontWeight: '900' },
  promotionOffer: { marginTop: 4, color: '#aa6507', fontSize: 14, fontWeight: '900' },
  promotionFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  promotionBusiness: { flex: 1, color: colors.text, fontSize: 11, fontWeight: '900' },
  promotionEnd: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  emptyCard: { alignItems: 'center', padding: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  errorCard: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#fff0f0' },
  errorTitle: { color: colors.danger, fontSize: 15, fontWeight: '900' },
  errorText: { marginTop: 4, color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  emptyIcon: { color: colors.tealDark, fontSize: 42, fontWeight: '900' },
  emptyTitle: { marginTop: spacing.sm, color: colors.navy, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  emptyText: { marginTop: spacing.sm, color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  supportCard: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  sectionIcon: { fontSize: 32, marginBottom: spacing.sm },
  supportLabel: { marginTop: spacing.md, marginBottom: 7, color: colors.navy, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  supportInput: { minHeight: 132, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 14, lineHeight: 20 },
  supportSafety: { marginTop: spacing.sm, color: colors.muted, fontSize: 10.5, lineHeight: 16, fontWeight: '700' },
  supportSuccess: { marginTop: spacing.md, color: '#2f7740', fontSize: 12, lineHeight: 18, fontWeight: '900' },
  supportError: { marginTop: spacing.md, color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '900' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal },
  primaryButtonText: { color: colors.surface, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.surface },
  secondaryButtonText: { color: colors.tealDark, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  stepsCard: { paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: '#edf2f1' },
  stepNumber: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.tealSoft },
  stepNumberText: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  stepCopy: { flex: 1 },
  stepTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' },
  stepText: { marginTop: 3, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
});
