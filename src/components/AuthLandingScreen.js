import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

export default function AuthLandingScreen({
  logoSource,
  preferredModule = 'events',
  productTitle = 'Community Connect Australia',
  productSubtitle = 'Sign in for all features, or continue as a guest to browse public listings.',
  showModuleChoice = true,
  busy = false,
  error = '',
  onBack,
  onPreferredModuleChange,
  onSendPhoneCode,
  onVerifyPhoneCode,
  onContinueGuest,
  onClearError,
}) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [step, setStep] = useState('phone');
  const [accepted, setAccepted] = useState(false);
  const [validation, setValidation] = useState('');
  const selectedModuleLabel = preferredModule === 'directory' ? 'Business Directory' : 'Community Events';

  const sendCode = async () => {
    if (!accepted) {
      setValidation('Please accept the Privacy Policy and Terms of Use.');
      return;
    }
    setValidation('');
    const result = await onSendPhoneCode?.(phone);
    if (!result) return;
    setConfirmation(result);
    setOtp('');
    setStep('otp');
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setValidation('Enter the 6-digit verification code.');
      return;
    }
    setValidation('');
    await onVerifyPhoneCode?.(confirmation, otp);
  };

  const updatePhone = value => {
    setPhone(value);
    setValidation('');
    onClearError?.();
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {onBack ? (
        <Pressable accessibilityLabel="Change selected module" onPress={onBack} style={styles.backButton}>
          <Text maxFontSizeMultiplier={1.1} style={styles.backText}>{'\u2039'} Change module</Text>
        </Pressable>
      ) : null}
      <View style={styles.brand}>
        <Image source={logoSource} resizeMode="contain" style={styles.logo} />
        <View style={styles.brandCopy}>
          <Text style={styles.brandLine}>Community Connect</Text>
          <Text style={styles.brandLine}>Australia</Text>
        </View>
      </View>

      <View style={styles.welcome}>
        <Text maxFontSizeMultiplier={1.1} style={styles.eyebrow}>WELCOME</Text>
        <Text maxFontSizeMultiplier={1.12} style={styles.title}>{productTitle}</Text>
        <Text maxFontSizeMultiplier={1.12} style={styles.subtitle}>{productSubtitle}</Text>
      </View>

      {showModuleChoice ? <View style={styles.moduleCard}>
        <Text style={styles.fieldLabel}>OPEN AFTER SIGN IN</Text>
        <View style={styles.moduleChoice}>
          {[
            ['events', '\u{1F4C5}', 'Events'],
            ['directory', '\u{1F3EA}', 'Business Directory'],
          ].map(([value, icon, label]) => {
            const selected = preferredModule === value;
            return (
              <Pressable
                key={value}
                accessibilityState={{ selected }}
                onPress={() => onPreferredModuleChange?.(value)}
                style={[styles.moduleButton, selected && styles.moduleButtonActive]}
              >
                <Text style={styles.moduleIcon}>{icon}</Text>
                <Text style={[styles.moduleText, selected && styles.moduleTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View> : null}

      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.phoneIcon}><Text style={styles.phoneIconText}>{'\u{1F4F1}'}</Text></View>
          <View style={styles.cardHeadingCopy}>
            <Text style={styles.cardTitle}>{step === 'otp' ? 'Verification code' : 'Mobile sign in'}</Text>
            <Text style={styles.cardSubtitle}>{step === 'otp' ? `Code sent to ${phone}` : 'Australian mobile numbers only'}</Text>
          </View>
        </View>

        {step === 'phone' ? (
          <>
            <View style={styles.consentRow}>
              <Switch
                value={accepted}
                onValueChange={value => {
                  setAccepted(value);
                  setValidation('');
                }}
                trackColor={{ false: colors.border, true: colors.teal }}
              />
              <View style={styles.consentCopy}>
                <Text style={styles.consentText}>I agree to the Privacy Policy and Terms of Use.</Text>
                <View style={styles.legalLinks}>
                  <Pressable onPress={() => Linking.openURL('https://communityevents.siza.info/privacy.html')}><Text style={styles.legalLink}>Privacy Policy</Text></Pressable>
                  <Pressable onPress={() => Linking.openURL('https://communityevents.siza.info/terms.html')}><Text style={styles.legalLink}>Terms of Use</Text></Pressable>
                </View>
              </View>
            </View>
            <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
            <TextInput
              autoComplete="tel"
              keyboardType="phone-pad"
              placeholder="04XX XXX XXX"
              placeholderTextColor={colors.muted}
              value={phone}
              onChangeText={updatePhone}
              style={styles.input}
            />
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>6-DIGIT CODE</Text>
            <TextInput
              autoComplete="sms-otp"
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              value={otp}
              onChangeText={value => {
                setOtp(value.replace(/\D/g, ''));
                setValidation('');
                onClearError?.();
              }}
              style={[styles.input, styles.otpInput]}
            />
          </>
        )}

        {validation ? <Text accessibilityRole="alert" style={styles.error}>{validation}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <Pressable disabled={busy} onPress={step === 'otp' ? verifyCode : sendCode} style={({ pressed }) => [styles.primary, pressed && styles.pressed, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{step === 'otp' ? 'Verify and continue' : 'Send verification code'}</Text>}
        </Pressable>
        {step === 'otp' ? (
          <View style={styles.otpActions}>
            <Pressable disabled={busy} onPress={sendCode}><Text style={styles.textAction}>Resend code</Text></Pressable>
            <Pressable disabled={busy} onPress={() => { setStep('phone'); setConfirmation(null); setOtp(''); setValidation(''); onClearError?.(); }}><Text style={styles.textAction}>Change number</Text></Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.or}>OR</Text><View style={styles.divider} /></View>
      <Pressable disabled={busy} onPress={onContinueGuest} style={({ pressed }) => [styles.guestButton, pressed && styles.pressed, busy && styles.disabled]}>
        <Text style={styles.guestIcon}>{'\u{1F50E}'}</Text>
        <View style={styles.guestCopy}>
          <Text maxFontSizeMultiplier={1.12} style={styles.guestTitle}>Browse {selectedModuleLabel} as guest</Text>
          <Text maxFontSizeMultiplier={1.12} style={styles.guestText}>Open the selected public experience without signing in</Text>
        </View>
        <Text style={styles.chevron}>{'\u203A'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl, backgroundColor: colors.background },
  backButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginBottom: spacing.sm },
  backText: { color: colors.tealDark, fontSize: 12, lineHeight: 17, fontWeight: '900' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  logo: { width: 62, height: 62 }, brandCopy: { minWidth: 0 }, brandLine: { color: colors.navy, fontSize: 25, lineHeight: 27, fontWeight: '900' },
  welcome: { alignItems: 'center', marginBottom: spacing.lg }, eyebrow: { color: colors.tealDark, fontSize: 10, letterSpacing: 1.6, fontWeight: '900' },
  title: { marginTop: 5, color: colors.navy, fontSize: 25, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  subtitle: { maxWidth: 420, marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  moduleCard: { marginBottom: spacing.md }, fieldLabel: { marginBottom: 7, color: colors.navy, fontSize: 10, letterSpacing: 0.7, fontWeight: '900' },
  moduleChoice: { flexDirection: 'row', gap: spacing.sm }, moduleButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  moduleButtonActive: { borderColor: colors.teal, backgroundColor: colors.tealSoft }, moduleIcon: { fontSize: 17 }, moduleText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, moduleTextActive: { color: colors.tealDark, fontWeight: '900' },
  card: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, backgroundColor: colors.surface, ...shadow },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }, phoneIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.tealSoft }, phoneIconText: { fontSize: 23 },
  cardHeadingCopy: { flex: 1 }, cardTitle: { color: colors.navy, fontSize: 20, fontWeight: '900' }, cardSubtitle: { marginTop: 2, color: colors.muted, fontSize: 11, fontWeight: '700' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  consentCopy: { flex: 1 }, consentText: { color: colors.navy, fontSize: 11, lineHeight: 16, fontWeight: '800' }, legalLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 5 }, legalLink: { color: colors.tealDark, fontSize: 10, fontWeight: '900', textDecorationLine: 'underline' },
  input: { minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#ffffff', color: colors.navy, fontSize: 17 }, otpInput: { letterSpacing: 8, textAlign: 'center', fontWeight: '900' },
  error: { marginTop: spacing.sm, color: colors.danger, fontSize: 11, lineHeight: 16, fontWeight: '800' },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, borderRadius: radius.md, backgroundColor: colors.teal }, primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }, textAction: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg }, divider: { flex: 1, height: 1, backgroundColor: colors.border }, or: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  guestButton: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface }, guestIcon: { fontSize: 24 }, guestCopy: { flex: 1 }, guestTitle: { color: colors.navy, fontSize: 14, fontWeight: '900' }, guestText: { marginTop: 2, color: colors.muted, fontSize: 10, lineHeight: 14 }, chevron: { color: colors.tealDark, fontSize: 28, lineHeight: 30 },
  pressed: { opacity: 0.76 }, disabled: { opacity: 0.5 },
});
