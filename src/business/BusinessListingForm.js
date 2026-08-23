import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import AddressAutocomplete from '../components/AddressAutocomplete';
import CompactSelect from '../components/CompactSelect';
import NativeDateTimeField from '../components/NativeDateTimeField';
import { classifyMetroArea } from '../utils/cities';
import { colors, radius, shadow, spacing } from '../theme';
import { BUSINESS_CATEGORIES } from './businessData';
import { formatAbn, isValidAbn, normalizeAbn, validateBusinessPayload } from '../services/businesses';

const IS_TEST_BUILD = Constants.expoConfig?.extra?.testBuild !== false;
const LISTING_TERMS_VERSION = 'draft-2026-08-20';

const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

function defaultHours() {
  return Object.fromEntries(DAYS.map(([key], index) => [key, {
    closed: index === 6,
    open: index === 6 ? '' : '09:00',
    close: index === 6 ? '' : index === 5 ? '15:00' : '17:00',
  }]));
}

function createFormState(business, defaultCity) {
  return {
    name: business?.name || '',
    abn: normalizeAbn(business?.abn),
    abnStatus: business?.abnStatus || (business?.abn ? 'has' : 'none'),
    categoryId: business?.categoryId || '',
    subcategoryIds: Array.isArray(business?.subcategoryIds) ? business.subcategoryIds : [],
    description: business?.description || '',
    logoUrl: business?.logoUrl || '',
    logoPath: business?.logoPath || '',
    coverUrl: business?.coverUrl || '',
    coverPath: business?.coverPath || '',
    contact: {
      phone: business?.contact?.phone || business?.phone || '',
      whatsapp: business?.contact?.whatsapp || business?.whatsapp || '',
      email: business?.contact?.email || '',
      website: business?.contact?.website || business?.website || '',
    },
    social: {
      facebook: business?.social?.facebook || '',
      instagram: business?.social?.instagram || '',
      twitter: business?.social?.twitter || business?.social?.x || '',
    },
    location: {
      placeId: business?.location?.placeId || '',
      fullAddress: business?.location?.fullAddress || business?.address || '',
      street: business?.location?.street || '',
      suburb: business?.location?.suburb || business?.suburb || '',
      state: business?.location?.state || '',
      postcode: business?.location?.postcode || '',
      latitude: business?.location?.latitude ?? null,
      longitude: business?.location?.longitude ?? null,
      city: business?.location?.city || business?.city || defaultCity || 'sydney',
      publicDisplay: business?.location?.publicDisplay || 'suburb',
    },
    hours: { ...defaultHours(), ...(business?.hours || {}) },
    hoursSummary: business?.hoursSummary || '',
  };
}

function Field({ label, optional = false, error, helper, children }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optional}>OPTIONAL</Text> : null}
      </View>
      {children}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function ImageField({ label, shape, image, existingUrl, error, onChoose, onRemove }) {
  const uri = image?.uri || existingUrl;
  return (
    <Field label={label} optional error={error}>
      {uri ? (
        <Image source={{ uri }} resizeMode="cover" style={shape === 'logo' ? styles.logoPreview : styles.coverPreview} />
      ) : (
        <View style={shape === 'logo' ? styles.logoPlaceholder : styles.coverPlaceholder}>
          <Text style={styles.imagePlaceholderIcon}>{shape === 'logo' ? '\u{1F3F7}\uFE0F' : '\u{1F5BC}\uFE0F'}</Text>
          <Text style={styles.imagePlaceholderText}>No {shape} selected</Text>
        </View>
      )}
      <View style={styles.imageActions}>
        <Pressable onPress={onChoose} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}>
          <Text style={styles.outlineButtonText}>{uri ? `Change ${shape}` : `Choose ${shape}`}</Text>
        </Pressable>
        {uri ? <Pressable onPress={onRemove} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></Pressable> : null}
      </View>
      <Text style={styles.helper}>JPG, PNG or WebP. Maximum size 5 MB.</Text>
    </Field>
  );
}

function HoursEditor({ hours, onChange }) {
  const update = (day, field, value) => onChange({
    ...hours,
    [day]: { ...hours[day], [field]: value },
  });
  return (
    <View style={styles.hoursList}>
      {DAYS.map(([key, label]) => {
        const row = hours[key] || {};
        return (
          <View key={key} style={styles.hoursRow}>
            <View style={styles.dayRow}>
              <Text style={styles.dayLabel}>{label}</Text>
              <View style={styles.closedToggle}>
                <Text style={styles.closedText}>{row.closed ? 'Closed' : 'Open'}</Text>
                <Switch
                  value={!row.closed}
                  onValueChange={value => update(key, 'closed', !value)}
                  trackColor={{ false: colors.border, true: colors.teal }}
                />
              </View>
            </View>
            {!row.closed ? (
              <View style={styles.timeRow}>
                <View style={styles.timeInput}><NativeDateTimeField compact mode="time" value={row.open} onChange={value => update(key, 'open', value)} accessibilityLabel={`Select ${label} opening time`} /></View>
                <Text style={styles.timeTo}>to</Text>
                <View style={styles.timeInput}><NativeDateTimeField compact mode="time" value={row.close} onChange={value => update(key, 'close', value)} accessibilityLabel={`Select ${label} closing time`} /></View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function BusinessListingForm({
  initialBusiness,
  defaultCity,
  canSubmit,
  submitting,
  error,
  success,
  onSubmit,
  onCancel,
  onRequireSignIn,
}) {
  const [form, setForm] = useState(() => createFormState(initialBusiness, defaultCity));
  const [localLogo, setLocalLogo] = useState(null);
  const [localCover, setLocalCover] = useState(null);
  const [pickerError, setPickerError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  useEffect(() => {
    setForm(createFormState(initialBusiness, defaultCity));
    setLocalLogo(null);
    setLocalCover(null);
    setAttempted(false);
    setDeclarationAccepted(false);
    setPickerError('');
  }, [defaultCity, initialBusiness?.id]);

  const categoryOptions = useMemo(() => BUSINESS_CATEGORIES.map(item => ({ value: item.id, label: `${item.icon}  ${item.label}` })), []);
  const selectedCategory = useMemo(() => BUSINESS_CATEGORIES.find(item => item.id === form.categoryId), [form.categoryId]);
  const payload = useMemo(() => {
    const selectedSubcategories = (selectedCategory?.subcategories || []).filter(item => form.subcategoryIds.includes(item.id));
    return {
      ...form,
      category: selectedCategory?.label || '',
      subcategories: selectedSubcategories.map(item => item.label),
      location: {
        ...form.location,
        city: form.location.city || classifyMetroArea(form.location),
      },
    };
  }, [form, selectedCategory]);
  const validation = useMemo(() => validateBusinessPayload({
    ...payload,
    listingDeclarationAccepted: declarationAccepted,
  }), [declarationAccepted, payload]);
  const abnLiveError = form.abnStatus === 'has' && form.abn.length === 11 && !isValidAbn(form.abn)
    ? 'This ABN does not pass the Australian ABN checksum.'
    : '';

  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const updateContact = (field, value) => setForm(current => ({ ...current, contact: { ...current.contact, [field]: value } }));
  const updateSocial = (field, value) => setForm(current => ({ ...current, social: { ...current.social, [field]: value } }));

  const chooseImage = async kind => {
    setPickerError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPickerError('Allow photo access to choose business images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize >= 5 * 1024 * 1024) {
        setPickerError('Business images must be smaller than 5 MB.');
        return;
      }
      const selected = { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' };
      if (kind === 'logo') {
        setLocalLogo(selected);
        setForm(current => ({ ...current, logoUrl: '', logoPath: '' }));
      } else {
        setLocalCover(selected);
        setForm(current => ({ ...current, coverUrl: '', coverPath: '' }));
      }
    } catch (pickError) {
      setPickerError(pickError?.message || 'Could not open your photo library.');
    }
  };

  const submit = () => {
    setAttempted(true);
    if (!canSubmit) {
      onRequireSignIn?.();
      return;
    }
    if (Object.keys(validation).length || !declarationAccepted) {
      const message = Object.values(validation)[0] || 'Accept the business listing declaration before submitting.';
      Alert.alert('Check business details', `${message}\n\nThe relevant field is highlighted in the form.`);
      return;
    }
    onSubmit?.({
      ...payload,
      listingDeclarationAccepted: true,
      listingTermsVersion: LISTING_TERMS_VERSION,
      listingConsentAtClient: new Date().toISOString(),
      _localLogoUri: localLogo?.uri || '',
      _localLogoMimeType: localLogo?.mimeType || 'image/jpeg',
      _localCoverUri: localCover?.uri || '',
      _localCoverMimeType: localCover?.mimeType || 'image/jpeg',
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {IS_TEST_BUILD ? (
        <View style={styles.testNotice}>
          <Text style={styles.testNoticeTitle}>TEST BUILD</Text>
          <Text style={styles.testNoticeText}>Use fictional or authorised test information only. Do not submit real business or personal data before the public store launch.</Text>
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>{initialBusiness?.id ? 'EDIT LISTING' : 'NEW LISTING'}</Text>
          <Text style={styles.title}>{initialBusiness?.id ? 'Update your business' : 'Add your business'}</Text>
          <Text style={styles.subtitle}>Listings are checked by Community Businesses Australia before becoming public. Only ABN status is verified where an ABN is supplied.</Text>
        </View>
        {onCancel ? <Pressable onPress={onCancel} style={styles.closeButton}><Text style={styles.closeText}>{'\u2715'}</Text></Pressable> : null}
      </View>

      {!canSubmit ? (
        <View style={styles.signInCard}>
          <Text style={styles.signInTitle}>Sign in required</Text>
          <Text style={styles.signInText}>Use your verified mobile account to submit and manage business listings.</Text>
          <Pressable onPress={onRequireSignIn} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Open Login / Create Account</Text></Pressable>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionIcon}>{'\u{1F3EA}'}</Text>
        <Text style={styles.sectionTitle}>Business information</Text>
        <Text style={styles.sectionSubtitle}>Tell the community who you are and what you provide.</Text>
        <Field label="Business name" error={attempted ? validation.name : ''}>
          <TextInput value={form.name} onChangeText={value => update('name', value)} placeholder="Registered or trading name" placeholderTextColor={colors.muted} style={[styles.input, attempted && validation.name && styles.inputInvalid]} />
        </Field>
        <Field label="Australian Business Number (ABN)" optional error={abnLiveError || (attempted ? validation.abn : '')} helper="Tell us your ABN status. Active ABNs are checked against the Australian Business Register during approval.">
          <CompactSelect
            options={[
              { value: 'has', label: 'I have an ABN' },
              { value: 'pending', label: 'ABN application is pending' },
              { value: 'none', label: 'I do not have an ABN' },
            ]}
            value={form.abnStatus}
            onChange={value => setForm(current => ({ ...current, abnStatus: value, abn: value === 'has' ? current.abn : '' }))}
          />
          {form.abnStatus === 'has' ? <TextInput value={formatAbn(form.abn)} onChangeText={value => update('abn', normalizeAbn(value))} keyboardType="number-pad" maxLength={14} placeholder="12 345 678 901" placeholderTextColor={colors.muted} style={[styles.input, (abnLiveError || (attempted && validation.abn)) && styles.inputInvalid]} /> : null}
          {form.abnStatus === 'has' && form.abn.length === 11 && isValidAbn(form.abn) ? <Text style={styles.validText}>{'\u2713'} Valid ABN format and checksum</Text> : null}
          {form.abnStatus !== 'has' ? <Text style={styles.helper}>A basic listing may be considered without an ABN, but it will not receive any verification badge. Community Businesses Australia does not verify identity, licences, qualifications or insurance.</Text> : null}
        </Field>
        <Field label="Category" error={attempted ? validation.categoryId : ''}>
          <CompactSelect options={categoryOptions} value={form.categoryId} onChange={value => setForm(current => ({ ...current, categoryId: value, subcategoryIds: [] }))} placeholder="Choose a category" />
        </Field>
        {selectedCategory ? <Field label="Services / Subcategories" error={attempted ? validation.subcategoryIds : ''} helper="Choose every service this business provides.">
          <View style={styles.subcategoryGrid}>
            {selectedCategory.subcategories.map(item => {
              const selected = form.subcategoryIds.includes(item.id);
              return <Pressable key={item.id} onPress={() => setForm(current => ({ ...current, subcategoryIds: selected ? current.subcategoryIds.filter(id => id !== item.id) : [...current.subcategoryIds, item.id] }))} style={[styles.subcategoryChip, selected && styles.subcategoryChipActive]}><Text style={[styles.subcategoryText, selected && styles.subcategoryTextActive]}>{selected ? '\u2713 ' : ''}{item.label}</Text></Pressable>;
            })}
          </View>
        </Field> : null}
        <Field label="About the business" error={attempted ? validation.description : ''}>
          <TextInput value={form.description} onChangeText={value => update('description', value)} multiline maxLength={1200} placeholder="Describe your services, customers and what makes the business useful to the community." placeholderTextColor={colors.muted} style={[styles.input, styles.textArea, attempted && validation.description && styles.inputInvalid]} />
          <Text style={styles.characterCount}>{form.description.length}/1200</Text>
        </Field>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionIcon}>{'\u{1F5BC}\uFE0F'}</Text>
        <Text style={styles.sectionTitle}>Logo and cover photo</Text>
        <Text style={styles.sectionSubtitle}>Images help the listing feel established and recognisable.</Text>
        <ImageField label="Business logo" shape="logo" image={localLogo} existingUrl={form.logoUrl} onChoose={() => chooseImage('logo')} onRemove={() => { setLocalLogo(null); setForm(current => ({ ...current, logoUrl: '', logoPath: '' })); }} />
        <ImageField label="Cover photo" shape="cover" image={localCover} existingUrl={form.coverUrl} onChoose={() => chooseImage('cover')} onRemove={() => { setLocalCover(null); setForm(current => ({ ...current, coverUrl: '', coverPath: '' })); }} />
        {pickerError ? <Text style={styles.errorText}>{pickerError}</Text> : null}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionIcon}>{'\u260E'}</Text>
        <Text style={styles.sectionTitle}>Contact details</Text>
        <Text style={styles.sectionSubtitle}>These details will appear on the approved public listing.</Text>
        <Field label="Business phone" error={attempted ? validation.phone : ''}>
          <TextInput value={form.contact.phone} onChangeText={value => updateContact('phone', value)} keyboardType="phone-pad" placeholder="02 9000 0000 or 04XX XXX XXX" placeholderTextColor={colors.muted} style={[styles.input, attempted && validation.phone && styles.inputInvalid]} />
        </Field>
        <Field label="WhatsApp" optional>
          <TextInput value={form.contact.whatsapp} onChangeText={value => updateContact('whatsapp', value)} keyboardType="phone-pad" placeholder="Australian mobile number" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="Business email" error={attempted ? validation.email : ''}>
          <TextInput value={form.contact.email} onChangeText={value => updateContact('email', value)} autoCapitalize="none" keyboardType="email-address" placeholder="contact@business.com.au" placeholderTextColor={colors.muted} style={[styles.input, attempted && validation.email && styles.inputInvalid]} />
        </Field>
        <Field label="Website" optional>
          <TextInput value={form.contact.website} onChangeText={value => updateContact('website', value)} autoCapitalize="none" keyboardType="url" placeholder="https://business.com.au" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="Instagram" optional>
          <TextInput value={form.social.instagram} onChangeText={value => updateSocial('instagram', value)} autoCapitalize="none" keyboardType="url" placeholder="Instagram profile URL" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="Facebook" optional>
          <TextInput value={form.social.facebook} onChangeText={value => updateSocial('facebook', value)} autoCapitalize="none" keyboardType="url" placeholder="Facebook page URL" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="X (Twitter)" optional>
          <TextInput value={form.social.twitter} onChangeText={value => updateSocial('twitter', value)} autoCapitalize="none" keyboardType="url" placeholder="X or Twitter profile URL" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
      </View>

      <View style={[styles.sectionCard, styles.addressCard]}>
        <Text style={styles.sectionIcon}>{'\u{1F4CD}'}</Text>
        <Text style={styles.sectionTitle}>Business location</Text>
        <Text style={styles.sectionSubtitle}>Select the complete Australian address for administration, then choose what the public may see.</Text>
        <Field label="Address" error={attempted ? validation.location : ''}>
          <AddressAutocomplete
            value={form.location}
            invalid={Boolean(attempted && validation.location)}
            placeholder="Start typing the full business address…"
            onChange={location => setForm(current => ({
              ...current,
              location: { ...location, city: classifyMetroArea(location) },
            }))}
          />
        </Field>
        <Field label="Public location display" helper="Suburb-only is recommended for home-based and mobile businesses.">
          <CompactSelect
            options={[
              { value: 'suburb', label: 'Suburb, state and postcode only' },
              { value: 'full', label: 'Full storefront address' },
            ]}
            value={form.location.publicDisplay}
            onChange={value => setForm(current => ({ ...current, location: { ...current.location, publicDisplay: value } }))}
          />
        </Field>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionIcon}>{'\u{1F552}'}</Text>
        <Text style={styles.sectionTitle}>Opening hours</Text>
        <Text style={styles.sectionSubtitle}>Tap each opening and closing time to select it.</Text>
        <HoursEditor hours={form.hours} onChange={hours => update('hours', hours)} />
        <Field label="Hours note" optional helper="Use this for appointment-only or variable opening arrangements.">
          <TextInput value={form.hoursSummary} onChangeText={value => update('hoursSummary', value)} placeholder="For example: Appointments available after hours" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
      </View>

      {error ? <View style={styles.messageError}><Text style={styles.messageErrorText}>{error}</Text></View> : null}
      {success ? <View style={styles.messageSuccess}><Text style={styles.messageSuccessText}>{success}</Text></View> : null}

      <View style={[styles.declaration, attempted && !declarationAccepted && styles.declarationInvalid]}>
        <Switch
          accessibilityLabel="Accept business listing declaration"
          value={declarationAccepted}
          onValueChange={setDeclarationAccepted}
          trackColor={{ false: colors.border, true: colors.teal }}
        />
        <View style={styles.declarationCopy}>
          <Text style={styles.declarationTitle}>{'\u{1F6E1}\uFE0F'} Submission declaration</Text>
          <Text style={styles.declarationText}>I confirm that I am authorised to submit this listing, the information is accurate, and I have permission to publish the supplied contact details and images. I understand that Community Businesses Australia is a directory only, checks ABN status only where an ABN is supplied, and does not verify identity, ownership, licences, qualifications, insurance, service quality or legal compliance.</Text>
          {attempted && !declarationAccepted ? <Text style={styles.errorText}>Accept this declaration before submitting.</Text> : null}
        </View>
      </View>
      <Pressable disabled={submitting} onPress={submit} style={({ pressed }) => [styles.submitButton, pressed && styles.pressed, submitting && styles.disabled]}>
        {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>{initialBusiness?.id ? 'Save Changes & Resubmit' : 'Submit Business for Review'}</Text>}
      </Pressable>
      {onCancel ? <Pressable disabled={submitting} onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  testNotice: { marginBottom: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: '#d99b28', borderRadius: radius.md, backgroundColor: '#fff7df' },
  testNoticeTitle: { color: '#7a4a00', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  testNoticeText: { marginTop: 4, color: '#6a4b13', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  titleCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { marginTop: 5, color: colors.navy, fontSize: 27, lineHeight: 32, fontWeight: '900' },
  subtitle: { marginTop: 7, color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  closeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.tealSoft },
  closeText: { color: colors.tealDark, fontSize: 17, fontWeight: '900' },
  signInCard: { marginBottom: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.tealSoft },
  signInTitle: { color: colors.navy, fontSize: 17, fontWeight: '900' },
  signInText: { marginTop: 5, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sectionCard: { marginBottom: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  addressCard: { zIndex: 10 },
  sectionIcon: { fontSize: 23 },
  sectionTitle: { marginTop: 6, color: colors.navy, fontSize: 19, fontWeight: '900' },
  sectionSubtitle: { marginTop: 4, marginBottom: spacing.sm, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  field: { marginTop: spacing.md, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { color: colors.navy, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  optional: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 15, fontWeight: '600' },
  inputInvalid: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  textArea: { minHeight: 132, paddingTop: spacing.md, textAlignVertical: 'top' },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  validText: { color: '#2d7d43', fontSize: 11, fontWeight: '900' },
  subcategoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  subcategoryChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 99, backgroundColor: colors.surface },
  subcategoryChipActive: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  subcategoryText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  subcategoryTextActive: { color: colors.tealDark, fontWeight: '900' },
  characterCount: { alignSelf: 'flex-end', color: colors.muted, fontSize: 10, fontWeight: '700' },
  logoPreview: { width: 104, height: 104, borderRadius: 24, backgroundColor: colors.tealSoft },
  coverPreview: { width: '100%', height: 170, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  logoPlaceholder: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 24, backgroundColor: '#f7faf9' },
  coverPlaceholder: { width: '100%', height: 132, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#f7faf9' },
  imagePlaceholderIcon: { fontSize: 25 },
  imagePlaceholderText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  imageActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  outlineButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.surface },
  outlineButtonText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  removeButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  hoursList: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  hoursRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dayLabel: { color: colors.navy, fontSize: 13, fontWeight: '900' },
  closedToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  closedText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  timeInput: { flex: 1, minWidth: 0, minHeight: 44, textAlign: 'center' },
  timeTo: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  messageError: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff0f0' },
  messageErrorText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  messageSuccess: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#eaf7ed' },
  messageSuccessText: { color: '#2d7d43', fontSize: 12, lineHeight: 18, fontWeight: '800' },
  declaration: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.lg, backgroundColor: colors.tealSoft },
  declarationInvalid: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  declarationCopy: { flex: 1, minWidth: 0 },
  declarationTitle: { color: colors.navy, fontSize: 13, fontWeight: '900' },
  declarationText: { marginTop: 5, color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal },
  primaryButtonText: { color: colors.surface, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  submitButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal },
  submitText: { color: colors.surface, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
});
