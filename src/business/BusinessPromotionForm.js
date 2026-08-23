import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import CompactSelect from '../components/CompactSelect';
import NativeDateTimeField from '../components/NativeDateTimeField';
import { validateBusinessPromotion } from '../services/businesses';
import { colors, radius, shadow, spacing } from '../theme';

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function Field({ label, error, optional, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{optional ? <Text style={styles.optional}>  OPTIONAL</Text> : null}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function BusinessPromotionForm({
  businesses = [],
  initialPromotion,
  submitting = false,
  error = '',
  onSubmit,
  onCancel,
}) {
  const [attempted, setAttempted] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [localImage, setLocalImage] = useState(null);
  const [form, setForm] = useState({
    businessId: initialPromotion?.businessId || businesses[0]?.id || '',
    title: initialPromotion?.title || '',
    briefText: initialPromotion?.briefText || '',
    discountText: initialPromotion?.discountText || '',
    fullDetails: initialPromotion?.fullDetails || '',
    startDate: initialPromotion?.startDate || isoDate(),
    endDate: initialPromotion?.endDate || isoDate(30),
    imageUrl: initialPromotion?.imageUrl || '',
    imagePath: initialPromotion?.imagePath || '',
  });
  const businessOptions = useMemo(() => businesses.map(business => ({ value: business.id, label: business.name })), [businesses]);
  const validation = validateBusinessPromotion(form);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const chooseImage = async () => {
    setPickerError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPickerError('Allow photo access to choose a promotion image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (Number(asset.fileSize || 0) > 5 * 1024 * 1024) {
        setPickerError('Promotion images must be smaller than 5 MB.');
        return;
      }
      setLocalImage({ uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' });
    } catch (nextError) {
      setPickerError(nextError?.message || 'Could not open your photo library.');
    }
  };

  const submit = () => {
    setAttempted(true);
    if (!form.businessId || Object.keys(validation).length) return;
    onSubmit?.({
      ...form,
      _localImageUri: localImage?.uri || '',
      _localImageMimeType: localImage?.mimeType || '',
    });
  };

  const imageUri = localImage?.uri || form.imageUrl;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>BUSINESS PROMOTION</Text>
          <Text style={styles.title}>{initialPromotion?.id ? 'Edit promotion' : 'Create promotion'}</Text>
          <Text style={styles.subtitle}>Promotions remain private until approved by the central admin team.</Text>
        </View>
        <Pressable onPress={onCancel} style={styles.close}><Text style={styles.closeText}>{'\u2715'}</Text></Pressable>
      </View>

      <View style={styles.card}>
        <Field label="Business" error={attempted && !form.businessId ? 'Choose an approved business.' : ''}>
          <CompactSelect options={businessOptions} value={form.businessId} onChange={value => update('businessId', value)} placeholder="Choose a business" />
        </Field>
        <Field label="Promotion title" error={attempted ? validation.title : ''}>
          <TextInput value={form.title} onChangeText={value => update('title', value)} maxLength={90} placeholder="For example: Community catering special" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="Short summary" error={attempted ? validation.briefText : ''}>
          <TextInput value={form.briefText} onChangeText={value => update('briefText', value)} maxLength={180} placeholder="A short line shown in the Promotions feed" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="Offer or discount" optional>
          <TextInput value={form.discountText} onChangeText={value => update('discountText', value)} maxLength={100} placeholder="For example: 15% off orders over $150" placeholderTextColor={colors.muted} style={styles.input} />
        </Field>
        <Field label="Full details and conditions" error={attempted ? validation.fullDetails : ''}>
          <TextInput value={form.fullDetails} onChangeText={value => update('fullDetails', value)} multiline maxLength={1200} placeholder="Explain the offer, eligibility and how customers redeem it." placeholderTextColor={colors.muted} style={[styles.input, styles.textArea]} />
        </Field>
        <View style={styles.dateRow}>
          <View style={styles.dateField}><Field label="Start date" error={attempted ? validation.startDate : ''}><NativeDateTimeField value={form.startDate} onChange={value => update('startDate', value)} minimumDate={new Date()} accessibilityLabel="Select promotion start date" /></Field></View>
          <View style={styles.dateField}><Field label="End date" error={attempted ? validation.endDate : ''}><NativeDateTimeField value={form.endDate} onChange={value => update('endDate', value)} minimumDate={new Date(`${form.startDate}T12:00:00`)} accessibilityLabel="Select promotion end date" /></Field></View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Promotion image</Text>
        <Text style={styles.sectionText}>Optional. A clear landscape image works best.</Text>
        {imageUri ? <Image source={{ uri: imageUri }} resizeMode="cover" style={styles.image} /> : <View style={styles.imageEmpty}><Text style={styles.imageEmptyIcon}>{'\u{1F3F7}\uFE0F'}</Text><Text style={styles.imageEmptyText}>No promotion image selected</Text></View>}
        <View style={styles.imageActions}>
          <Pressable onPress={chooseImage} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{imageUri ? 'Change image' : 'Choose image'}</Text></Pressable>
          {imageUri ? <Pressable onPress={() => { setLocalImage(null); update('imageUrl', ''); update('imagePath', ''); }} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></Pressable> : null}
        </View>
        {pickerError ? <Text style={styles.fieldError}>{pickerError}</Text> : null}
      </View>

      <View style={styles.notice}><Text style={styles.noticeTitle}>{'\u{1F6E1}\uFE0F'} Promotion declaration</Text><Text style={styles.noticeText}>You confirm that this promotion is accurate, lawful and can be honoured for the displayed period.</Text></View>
      {error ? <Text style={styles.formError}>{error}</Text> : null}
      <Pressable disabled={submitting} onPress={submit} style={[styles.submit, submitting && styles.disabled]}>
        {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.submitText}>{initialPromotion?.id ? 'Save & Resubmit Promotion' : 'Submit Promotion for Review'}</Text>}
      </Pressable>
      <Pressable disabled={submitting} onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.tealDark, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 4, color: colors.navy, fontSize: 25, fontWeight: '900' },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.tealSoft },
  closeText: { color: colors.tealDark, fontSize: 18, fontWeight: '900' },
  card: { marginBottom: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow },
  field: { marginBottom: spacing.md },
  label: { marginBottom: 6, color: colors.navy, fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
  optional: { color: colors.muted, fontSize: 8.5 },
  input: { minHeight: 50, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 14, fontWeight: '600' },
  textArea: { minHeight: 116, paddingTop: spacing.md, textAlignVertical: 'top' },
  fieldError: { marginTop: 5, color: colors.danger, fontSize: 10.5, lineHeight: 15, fontWeight: '800' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateField: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.navy, fontSize: 16, fontWeight: '900' },
  sectionText: { marginTop: 4, color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  image: { width: '100%', height: 160, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  imageEmpty: { height: 132, alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  imageEmptyIcon: { fontSize: 30 },
  imageEmptyText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  imageActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  secondaryButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  removeButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  removeText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  notice: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.tealSoft },
  noticeTitle: { color: colors.navy, fontSize: 13, fontWeight: '900' },
  noticeText: { marginTop: 5, color: colors.text, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  formError: { marginTop: spacing.md, color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  submit: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, borderRadius: radius.md, backgroundColor: colors.teal },
  submitText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  cancel: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.muted, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});
