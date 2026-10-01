import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import ScrollView from './KeyboardAwareScrollView';
import { colors, radius, spacing } from '../theme';
import { LEGAL_URLS, LEGAL_DOCUMENT_VERSION } from '../config/legal';
import { openExternalUrl } from '../utils/openExternalUrl';
import { cleanMemberName, cleanMemberEmail, validMemberName, validMemberEmail } from '../utils/memberProfile';

export default function CompleteProfileScreen({ user, profile, state, busy, error, onSave, onRetry, onSignOut }) {
  const [name, setName] = useState(profile?.fullName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [accepted, setAccepted] = useState(false);
  const [validation, setValidation] = useState('');
  const canComplete = state === 'complete-profile';
  const save = async () => {
    if (!validMemberName(name)) return setValidation('Enter your full name (2–120 characters).');
    if (!validMemberEmail(email)) return setValidation('Enter a valid email address.');
    if (!accepted) return setValidation('Please accept the Privacy Policy and Terms of Use.');
    setValidation('');
    await onSave({ fullName: cleanMemberName(name), email: cleanMemberEmail(email), privacyAccepted: true, termsAccepted: true, legalVersion: LEGAL_DOCUMENT_VERSION });
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{canComplete ? 'Complete your profile' : state === 'loading' ? 'Checking your profile…' : state === 'blocked' ? 'Account unavailable' : state === 'verify-phone' ? 'Verify your mobile number' : 'Profile could not be loaded'}</Text>
      <Text style={styles.copy}>{canComplete ? 'Before continuing, please add your name and email. The same profile is used for Events and Business Directory.' : state === 'blocked' ? 'This account is inactive. Please contact support.' : state === 'verify-phone' ? 'Please sign out and sign in with your mobile number to verify it.' : 'Your saved details must be checked before you can continue.'}</Text>
      {state === 'loading' && <ActivityIndicator color={colors.blue} />}
      {canComplete && <>
        <Text style={styles.label}>Verified mobile number</Text><Text style={styles.copy}>{user.phoneNumber}</Text>
        <Text style={styles.label}>Full name *</Text>
        <TextInput accessibilityLabel="Full name" testID="registration-full-name" value={name} onChangeText={setName} autoComplete="name" maxLength={120} editable={!busy} style={styles.input} />
        <Text style={styles.label}>Email address *</Text>
        <TextInput accessibilityLabel="Email address" testID="registration-email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!busy} style={styles.input} />
        <View style={styles.consent}><Switch accessibilityLabel="Accept Privacy Policy and Terms of Use" value={accepted} onValueChange={setAccepted} disabled={busy} trackColor={{ false: colors.border, true: colors.blue }} /><Text style={[styles.copy, { flex: 1 }]}>I agree to the Privacy Policy and Terms of Use.</Text></View>
        <View style={styles.links}><Pressable onPress={() => openExternalUrl(LEGAL_URLS.privacy)}><Text style={styles.link}>Privacy Policy</Text></Pressable><Pressable onPress={() => openExternalUrl(LEGAL_URLS.terms)}><Text style={styles.link}>Terms of Use</Text></Pressable></View>
      </>}
      {!!(validation || error) && <Text accessibilityRole="alert" style={styles.error}>{validation || error}</Text>}
      {canComplete && <Pressable accessibilityRole="button" testID="registration-save" disabled={busy} onPress={save} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save and continue'}</Text></Pressable>}
      {state === 'retry' && <Pressable accessibilityRole="button" disabled={busy} onPress={onRetry} style={styles.primary}><Text style={styles.primaryText}>Retry</Text></Pressable>}
      {state !== 'loading' && <Pressable accessibilityRole="button" disabled={busy} onPress={onSignOut} style={styles.secondary}><Text style={styles.link}>Sign out</Text></Pressable>}
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  card: { padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 23, fontWeight: '700', color: colors.navy, marginBottom: spacing.md },
  copy: { fontSize: 14, lineHeight: 21, color: colors.muted, marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '700', color: colors.navy, marginBottom: spacing.sm },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.background, marginBottom: spacing.md, fontSize: 16 },
  consent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginBottom: spacing.md },
  link: { color: colors.blueDark, fontSize: 14, fontWeight: '600' },
  primary: { minHeight: 50, justifyContent: 'center', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.blue },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' }, secondary: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 14, marginBottom: spacing.md }, disabled: { opacity: 0.6 },
});
