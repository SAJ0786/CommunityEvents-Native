import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getModuleExperience, MODULE_EXPERIENCE_LIST } from '../config/moduleExperience';
import { colors, radius, shadow, spacing } from '../theme';
import AuthLandingScreen from './AuthLandingScreen';

const cappedText = { maxFontSizeMultiplier: 1.12 };

export default function ModuleEntryScreen({
  logoSource,
  preferredModule = 'events',
  busy = false,
  error = '',
  onPreferredModuleChange,
  onSendPhoneCode,
  onVerifyPhoneCode,
  onContinueGuest,
  onClearError,
}) {
  const [stage, setStage] = useState('module');
  const experience = useMemo(() => getModuleExperience(preferredModule), [preferredModule]);

  if (stage === 'login') {
    return (
      <AuthLandingScreen
        logoSource={logoSource}
        preferredModule={preferredModule}
        productTitle={experience.productTitle}
        productSubtitle={experience.loginDescription}
        showModuleChoice={false}
        busy={busy}
        error={error}
        onBack={() => {
          onClearError?.();
          setStage('module');
        }}
        onPreferredModuleChange={onPreferredModuleChange}
        onSendPhoneCode={onSendPhoneCode}
        onVerifyPhoneCode={onVerifyPhoneCode}
        onContinueGuest={onContinueGuest}
        onClearError={onClearError}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.ambientGold} pointerEvents="none" />
      <View style={styles.ambientTeal} pointerEvents="none" />

      <View style={styles.brand}>
        <View style={styles.logoShell}>
          <Image source={logoSource} resizeMode="contain" style={styles.logo} />
        </View>
        <View style={styles.brandCopy}>
          <Text {...cappedText} style={styles.brandMain}>Community Connect Australia</Text>
          <Text {...cappedText} style={styles.brandSub}>ONE COMMUNITY · TWO EXPERIENCES</Text>
        </View>
      </View>

      <View style={styles.intro}>
        <Text {...cappedText} style={styles.eyebrow}>WHERE WOULD YOU LIKE TO START?</Text>
        <Text {...cappedText} style={styles.title}>Your community,{`\n`}your way.</Text>
        <Text {...cappedText} style={styles.subtitle}>Choose an experience now. You can switch between both at any time after entering the app.</Text>
      </View>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {MODULE_EXPERIENCE_LIST.map(item => {
          const selected = item.id === preferredModule;
          return (
            <Pressable
              key={item.id}
              accessibilityLabel={`${item.choiceTitle}. ${item.choiceDescription}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onPreferredModuleChange?.(item.id);
                onClearError?.();
              }}
              style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
            >
              <View style={[styles.optionIcon, { backgroundColor: item.iconBackground }]}>
                <MaterialCommunityIcons color={item.iconColor} name={item.icon} size={34} />
              </View>
              <View style={styles.optionCopy}>
                <Text {...cappedText} style={styles.optionTitle}>{item.choiceTitle}</Text>
                <Text {...cappedText} style={styles.optionDescription}>{item.choiceDescription}</Text>
              </View>
              <View style={[styles.check, selected && styles.checkSelected]}>
                {selected ? <MaterialCommunityIcons color="#ffffff" name="check" size={17} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={() => setStage('login')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Text {...cappedText} style={styles.primaryText}>Continue to {experience.choiceTitle}</Text>
      </Pressable>
      <Pressable disabled={busy} onPress={onContinueGuest} style={({ pressed }) => [styles.guest, pressed && styles.pressed, busy && styles.disabled]}>
        <Text {...cappedText} style={styles.guestText}>Browse {experience.choiceTitle} as guest</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    position: 'relative',
    flexGrow: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
  ambientGold: {
    position: 'absolute',
    top: -85,
    right: -70,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#fff0b9',
    opacity: 0.65,
  },
  ambientTeal: {
    position: 'absolute',
    top: 210,
    left: -120,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: colors.tealSoft,
    opacity: 0.9,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  logoShell: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.surface,
    ...shadow,
  },
  logo: { width: 43, height: 43 },
  brandCopy: { flexShrink: 1 },
  brandMain: { color: colors.navy, fontSize: 17, lineHeight: 21, fontWeight: '800' },
  brandSub: { marginTop: 2, color: colors.tealDark, fontSize: 8.5, lineHeight: 12, letterSpacing: 1.2, fontWeight: '900' },
  intro: { alignItems: 'center', marginBottom: spacing.xl },
  eyebrow: { color: colors.tealDark, fontSize: 10, lineHeight: 15, letterSpacing: 1.7, fontWeight: '900', textAlign: 'center' },
  title: { marginTop: 7, color: colors.navy, fontSize: 32, lineHeight: 35, letterSpacing: -0.9, fontWeight: '900', textAlign: 'center' },
  subtitle: { maxWidth: 340, marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  options: { gap: spacing.md },
  option: {
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  optionSelected: { borderColor: colors.teal },
  optionIcon: { width: 64, height: 64, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { color: colors.navy, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  optionDescription: { marginTop: 5, color: colors.muted, fontSize: 12, lineHeight: 17 },
  check: { width: 25, height: 25, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.background },
  checkSelected: { borderColor: colors.teal, backgroundColor: colors.teal },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.teal, ...shadow },
  primaryText: { color: '#ffffff', fontSize: 14, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  guest: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  guestText: { color: colors.tealDark, fontSize: 12, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.5 },
});
