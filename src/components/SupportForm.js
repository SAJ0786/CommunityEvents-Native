import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import ScrollView from './KeyboardAwareScrollView';
import NativeBackButton from './NativeBackButton';
import { APP_SUPPORT_CATEGORIES, BUSINESS_REPORT_CATEGORIES, newSupportReference, submitSupportRequest } from '../services/support';
import { colors, radius, spacing } from '../theme';
import MemberPageHeader from './MemberPageHeader';

export default function SupportForm({ user, profile, business, onBack }) {
  const categories = business ? BUSINESS_REPORT_CATEGORIES : APP_SUPPORT_CATEGORIES;
  const [category, setCategory] = useState(categories[0]);
  const [name, setName] = useState(profile?.fullName || user?.displayName || '');
  const [email, setEmail] = useState(profile?.email || user?.email || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [sent, setSent] = useState(false);
  const pending = useRef(null);
  const submit = async () => {
    if (busy || sent) return;
    if (!name.trim() || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()) || message.trim().length < 10) {
      setStatus('Please enter your name, a valid email and at least 10 characters of detail.'); return;
    }
    const payload = { kind: business ? 'business-report' : 'app-feedback', businessId: business?.id || '', category, senderName: name.trim(), senderEmail: email.trim(), message: message.trim() };
    const fingerprint = JSON.stringify(payload);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: newSupportReference() };
    setBusy(true); setStatus('');
    try {
      const result = await submitSupportRequest({ ...payload, requestId: pending.current.requestId });
      setSent(true);
      setStatus(`Submitted for email delivery. Reference: ${result.reference.slice(0, 12)}. Replies will be handled by email.`);
    } catch (error) { setStatus(error?.message || 'Unable to submit. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <MemberPageHeader
          title={business ? 'Report a Problem' : 'Feedback & Report a Problem'}
          subtitle={business ? `${business.name}\nYour report is emailed privately to this business’s city admins and all super admins, not the business owner.` : 'App feedback, account issues and other problems are emailed to support@siza.info.'}
          icon="lifebuoy"
          tone="amber"
          onBack={() => { if (!busy) onBack?.(); }}
        />
        <Text style={styles.label}>Your name</Text>
        <TextInput accessibilityLabel="Your name" value={name} onChangeText={setName} editable={!busy && !sent} maxLength={100} style={styles.input} />
        <Text style={styles.label}>Your email</Text>
        <TextInput accessibilityLabel="Your email" value={email} onChangeText={setEmail} editable={!busy && !sent} maxLength={254} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
        <Text style={styles.label}>Category</Text>
        <View style={styles.categories}>{categories.map(item => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: category === item }} disabled={busy || sent} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.selected]}><Text style={category === item ? styles.selectedText : styles.text}>{item}</Text></Pressable>)}</View>
        <Text style={styles.label}>Details</Text>
        <TextInput accessibilityLabel="Report details" value={message} onChangeText={setMessage} editable={!busy && !sent} multiline maxLength={2500} placeholder="Describe the problem or share your feedback…" placeholderTextColor={colors.muted} style={[styles.input, styles.message]} />
        <Text style={styles.help}>Do not include passwords, verification codes or payment details. We keep a private submission and email-delivery record; no separate feedback inbox is created.</Text>
        {status ? <Text accessibilityRole="alert" style={[styles.status, sent && styles.success]}>{status}</Text> : null}
        {!sent ? <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[styles.button, busy && { opacity: 0.5 }]}><Text style={styles.selectedText}>{busy ? 'Submitting…' : 'Submit'}</Text></Pressable> : <Pressable onPress={onBack} style={styles.button}><Text style={styles.selectedText}>Done</Text></Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SupportModal({ visible, onClose, ...props }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaView style={styles.screen}>{visible ? <SupportForm {...props} onBack={onClose} /> : null}</SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: 48 },
  title: { color: colors.navy, fontSize: 25, fontWeight: '700', marginTop: 16 }, help: { color: colors.muted, fontSize: 13, lineHeight: 20, marginVertical: 12 },
  label: { color: colors.navy, fontWeight: '600', marginTop: 12, marginBottom: 7 }, input: { color: colors.text, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, minHeight: 46 }, message: { minHeight: 140, textAlignVertical: 'top' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, selected: { backgroundColor: colors.teal }, text: { color: colors.text }, selectedText: { color: '#fff', fontWeight: '600' }, button: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.teal, justifyContent: 'center', alignItems: 'center', marginTop: 16 }, status: { color: colors.danger, marginVertical: 10 }, success: { color: colors.tealDark },
});
