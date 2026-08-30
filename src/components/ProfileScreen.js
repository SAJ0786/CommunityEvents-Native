import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import { cityLabel, DEFAULT_CITY, normalizeCity } from '../utils/cities';
import CitySelector from './CitySelector';
import { STORE_SHARE_LINES } from '../utils/storeLinks';
import * as Clipboard from 'expo-clipboard';
import { getDiagnosticSessionId } from '../services/diagnostics';
import {
  ensureDeviceNotificationsEnabled,
  getDeviceNotificationPermission,
  openDeviceNotificationSettings,
  setPrayerRemindersEnabled,
} from '../services/reminders';
import { getPrayerLocation } from '../utils/prayerLocations';

const sizaLogo = require('../../assets/siza-apps.jpg');

function ProfileRow({ label, value, subtle = false }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text maxFontSizeMultiplier={1.2} style={styles.rowLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={1.2} style={[styles.rowValue, subtle && styles.rowValueSubtle]}>{String(value)}</Text>
    </View>
  );
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function roleLabel(value) {
  if (value === 'superAdmin') return 'Super Admin';
  if (value === 'admin') return 'Admin';
  return 'User';
}

export default function ProfileScreen({
  user,
  profile,
  loading,
  error,
  message,
  authBusy = false,
  profileBusy = false,
  onSendPhoneCode,
  onVerifyPhoneCode,
  onSaveProfile,
  onDeleteAccount,
  appVersion = '',
  appBuild = '',
  preferredModule = 'events',
  onPreferredModuleChange,
}) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [authStep, setAuthStep] = useState('phone');
  const [accepted, setAccepted] = useState(false);
  const [authValidation, setAuthValidation] = useState('');
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [contactEmail, setContactEmail] = useState(profile?.email || '');
  const [defaultCity, setDefaultCity] = useState(normalizeCity(profile?.defaultCity || DEFAULT_CITY));
  const [profileValidation, setProfileValidation] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [deleteStep, setDeleteStep] = useState(null);
  const [archiveEventsNow, setArchiveEventsNow] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(profile?.pushNotificationsEnabled !== false);
  const [smsEnabled, setSmsEnabled] = useState(profile?.smsNotificationsEnabled === true);
  const [emailEnabled, setEmailEnabled] = useState(profile?.emailNotificationsEnabled !== false);
  const [eventNotifications, setEventNotifications] = useState(profile?.eventNotificationsEnabled !== false);
  const [businessNotifications, setBusinessNotifications] = useState(profile?.businessNotificationsEnabled !== false);
  const [prayerReminders, setPrayerReminders] = useState(profile?.prayerRemindersEnabled !== false);
  const [deviceNotificationsAllowed, setDeviceNotificationsAllowed] = useState(null);
  const isGuest = !user || user.isAnonymous;

  useEffect(() => {
    setFullName(profile?.fullName || '');
    setContactEmail(profile?.email || '');
    setDefaultCity(normalizeCity(profile?.defaultCity || DEFAULT_CITY));
    setProfileValidation('');
    setEditingProfile(false);
  }, [profile?.defaultCity, profile?.email, profile?.fullName]);

  useEffect(() => {
    setPushEnabled(profile?.pushNotificationsEnabled !== false);
    setSmsEnabled(profile?.smsNotificationsEnabled === true);
    setEmailEnabled(profile?.emailNotificationsEnabled !== false);
    setEventNotifications(profile?.eventNotificationsEnabled !== false);
    setBusinessNotifications(profile?.businessNotificationsEnabled !== false);
    setPrayerReminders(profile?.prayerRemindersEnabled !== false);
  }, [profile?.businessNotificationsEnabled, profile?.emailNotificationsEnabled, profile?.eventNotificationsEnabled, profile?.prayerRemindersEnabled, profile?.pushNotificationsEnabled, profile?.smsNotificationsEnabled]);

  useEffect(() => {
    let alive = true;
    const refreshPermission = () => {
      getDeviceNotificationPermission()
        .then(value => { if (alive) setDeviceNotificationsAllowed(value); })
        .catch(() => { if (alive) setDeviceNotificationsAllowed(false); });
    };
    refreshPermission();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshPermission();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  const profileDirty = useMemo(() => (
    fullName.trim() !== String(profile?.fullName || '').trim()
      || contactEmail.trim().toLowerCase() !== String(profile?.email || '').trim().toLowerCase()
      || defaultCity !== normalizeCity(profile?.defaultCity || DEFAULT_CITY)
  ), [contactEmail, defaultCity, fullName, profile?.defaultCity, profile?.email, profile?.fullName]);

  const sendCode = async () => {
    if (!accepted) {
      setAuthValidation('Please accept the Privacy Policy and Terms of Use.');
      return;
    }
    setAuthValidation('');
    const result = await onSendPhoneCode?.(phone);
    if (!result) return;
    setConfirmation(result);
    setOtp('');
    setAuthStep('otp');
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setAuthValidation('Enter the 6-digit verification code.');
      return;
    }
    setAuthValidation('');
    await onVerifyPhoneCode?.(confirmation, otp);
  };

  const saveProfile = async () => {
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      setProfileValidation('Enter your full name.');
      return;
    }
    const email = contactEmail.trim().toLowerCase();
    if (!validEmail(email)) {
      setProfileValidation('Enter a valid email address.');
      return;
    }
    setProfileValidation('');
    const saved = await onSaveProfile?.({
      fullName: name,
      email,
      defaultCity,
      privacyAccepted: true,
      termsAccepted: true,
    });
    if (saved !== false) {
      setEditingProfile(false);
    }
  };

  const shareApp = async () => {
    const message = [
      '🌙 *Community Connect Australia*',
      '_Community events and local businesses in one app_',
      '*Features:*',
      '📅 Browse upcoming Majalis, Milads & community events',
      '🔔 Get push notifications before events',
      '📲 Install as an app on iPhone & Android',
      '📤 Share events to WhatsApp instantly',
      '🗺️ Get directions to any event',
      '🌙 Hijri dates on every event',
      '📅 Sync events to your phone calendar',
      '🤖 AI Search — ask anything about events',
      '⭐ Save your favourite events',
      '➕ Add & manage your own events',
      '',
      ...STORE_SHARE_LINES,
      '',
      '_Download Community Connect Australia to stay connected with your community_',
    ].join('\n');
    try {
      await Share.share({ title: 'Share the App', message });
    } catch {
      setProfileValidation('Could not open sharing on this device.');
    }
  };

  const confirmAccountDeletion = async () => {
    const deleted = await onDeleteAccount?.(Boolean(archiveEventsNow));
    if (!deleted) return;
    setDeleteStep(null);
    setArchiveEventsNow(null);
  };

  const saveNotifications = async () => {
    setProfileValidation('');
    try {
      if (pushEnabled || prayerReminders) {
        const allowed = await ensureDeviceNotificationsEnabled();
        setDeviceNotificationsAllowed(allowed);
        if (!allowed) {
          throw new Error('Phone notifications are blocked in Android settings. Enable them before saving push notifications or reminders.');
        }
      }
      await setPrayerRemindersEnabled(prayerReminders, getPrayerLocation(defaultCity));
      await onSaveProfile?.({
        pushNotificationsEnabled: pushEnabled,
        smsNotificationsEnabled: smsEnabled,
        emailNotificationsEnabled: emailEnabled,
        eventNotificationsEnabled: eventNotifications,
        businessNotificationsEnabled: businessNotifications,
        prayerRemindersEnabled: prayerReminders,
      });
    } catch (nextError) {
      setProfileValidation(nextError?.message || 'Could not save notification settings.');
    }
  };

  const choosePreferredModule = module => {
    onPreferredModuleChange?.(module);
    if (!isGuest) onSaveProfile?.({ defaultModule: module });
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text maxFontSizeMultiplier={1.2} style={styles.title}>Profile &amp; Settings</Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.subtitle}>Your account and app preferences</Text>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : null}

      {!loading && isGuest ? (
        <View style={styles.card}>
          <View style={styles.statusPill}><Text style={styles.statusText}>GUEST MODE</Text></View>
          <Text style={styles.inputLabel}>OPEN AFTER SIGN IN</Text>
          <View style={styles.moduleChoice}>
            {[['events', 'Events'], ['directory', 'Business Directory']].map(([value, label]) => (
              <Pressable key={value} onPress={() => choosePreferredModule(value)} style={[styles.moduleChoiceButton, preferredModule === value && styles.moduleChoiceButtonActive]}>
                <Text style={[styles.moduleChoiceText, preferredModule === value && styles.moduleChoiceTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.cardTitle}>{authStep === 'otp' ? 'Enter Verification Code' : 'Mobile Sign In'}</Text>
          <Text style={styles.body}>
            {authStep === 'otp'
              ? `A 6-digit code was sent to ${phone}.`
              : 'Use your Australian mobile number to continue.'}
          </Text>

          {authStep === 'phone' ? (
            <>
              <View style={styles.consentRow}>
                <Switch
                  value={accepted}
                  onValueChange={value => {
                    setAccepted(value);
                    setAuthValidation('');
                  }}
                  trackColor={{ false: colors.border, true: colors.teal }}
                />
                <View style={styles.consentCopy}>
                  <Text style={styles.consentText}>I agree to the Privacy Policy and Terms of Use.</Text>
                  <View style={styles.legalLinks}>
                    <Pressable onPress={() => Linking.openURL('https://communityevents.siza.info/privacy.html')}>
                      <Text style={styles.legalLink}>Privacy Policy</Text>
                    </Pressable>
                    <Pressable onPress={() => Linking.openURL('https://communityevents.siza.info/terms.html')}>
                      <Text style={styles.legalLink}>Terms of Use</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mobile number</Text>
                <TextInput
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  placeholder="04XX XXX XXX"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={phone}
                  onChangeText={value => {
                    setPhone(value);
                    setAuthValidation('');
                  }}
                />
                <Text style={styles.bodySmall}>Australian mobiles only (+61). SMS rates may apply.</Text>
              </View>
            </>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>6-digit code</Text>
              <TextInput
                autoComplete="sms-otp"
                keyboardType="number-pad"
                maxLength={6}
                placeholder="847291"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.otpInput]}
                value={otp}
                onChangeText={value => {
                  setOtp(value.replace(/\D/g, ''));
                  setAuthValidation('');
                }}
              />
            </View>
          )}

          {authValidation ? <Text accessibilityRole="alert" style={styles.inlineError}>{authValidation}</Text> : null}

          <View style={styles.buttonRow}>
            <Pressable
              disabled={authBusy}
              onPress={authStep === 'otp' ? verifyCode : sendCode}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, authBusy && styles.buttonDisabled]}
            >
              {authBusy ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>{authStep === 'otp' ? 'Verify' : 'Send Verification Code'}</Text>
              )}
            </Pressable>
            {authStep === 'otp' ? (
              <>
                <Pressable disabled={authBusy} onPress={sendCode} style={styles.linkButton}>
                  <Text style={styles.linkText}>Resend code</Text>
                </Pressable>
                <Pressable
                  disabled={authBusy}
                  onPress={() => {
                    setAuthStep('phone');
                    setConfirmation(null);
                    setOtp('');
                    setAuthValidation('');
                  }}
                  style={styles.linkButton}
                >
                  <Text style={styles.linkText}>Change mobile number</Text>
                </Pressable>
              </>
            ) : null}
          </View>

        </View>
      ) : null}

      {!loading && !isGuest ? (
        <>
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.sectionTitle}>My Profile</Text>
                <Text style={styles.sectionHint}>Manage your details, default city and account.</Text>
              </View>
              <Pressable
                disabled={profileBusy || (!editingProfile && false) || (editingProfile && !profileDirty)}
                onPress={editingProfile ? saveProfile : () => setEditingProfile(true)}
                style={({ pressed }) => [
                  styles.inlineAction,
                  editingProfile && styles.inlineActionPrimary,
                  pressed && styles.buttonPressed,
                  (profileBusy || (editingProfile && !profileDirty)) && styles.buttonDisabled,
                ]}
              >
                {profileBusy && editingProfile ? (
                  <ActivityIndicator color={editingProfile ? colors.surface : colors.tealDark} size="small" />
                ) : (
                  <Text style={[styles.inlineActionText, editingProfile && styles.inlineActionTextPrimary]}>
                    {editingProfile ? 'Save' : 'Edit'}
                  </Text>
                )}
              </Pressable>
            </View>

            {!editingProfile ? (
              <>
                <ProfileRow label="Name" value={profile?.fullName || user.displayName || '-'} />
                <ProfileRow label="Mobile" value={profile?.phone || user.phoneNumber || '-'} />
                <ProfileRow label="Email" value={profile?.email || user.email || '-'} subtle={!profile?.email && !user.email} />
                <ProfileRow label="Role" value={roleLabel(profile?.role)} />
                <ProfileRow label="Default city" value={cityLabel(defaultCity)} />
              </>
            ) : (
              <>
                <ProfileRow label="Mobile" value={profile?.phone || user.phoneNumber || '-'} />
                <ProfileRow label="Role" value={roleLabel(profile?.role)} />

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full name</Text>
                  <TextInput
                    autoComplete="name"
                    maxLength={100}
                    placeholder="Your full name"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email address</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    maxLength={254}
                    placeholder="name@example.com"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    value={contactEmail}
                    onChangeText={setContactEmail}
                  />
                  <Text style={styles.bodySmall}>Used for event reminders and profile contact details.</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Default city</Text>
                  <CitySelector selectedCity={defaultCity} onChange={setDefaultCity} allowCurrentLocation />
                </View>

                {profileValidation ? <Text accessibilityRole="alert" style={styles.inlineError}>{profileValidation}</Text> : null}

                <View style={styles.editActions}>
                  <Pressable
                    disabled={profileBusy}
                    onPress={() => {
                      setFullName(profile?.fullName || '');
                      setContactEmail(profile?.email || '');
                      setDefaultCity(normalizeCity(profile?.defaultCity || DEFAULT_CITY));
                      setProfileValidation('');
                      setEditingProfile(false);
                    }}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, profileBusy && styles.buttonDisabled]}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            )}

            <View style={styles.deleteWrap}>
              <Text style={styles.deleteHeading}>Delete profile</Text>
              <Text style={styles.deleteBody}>This permanently removes your account. Your events can either stay active until expiry or be made inactive now.</Text>

              {deleteStep === null ? (
                <Pressable onPress={() => setDeleteStep('askEvents')} style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.dangerButtonText}>Delete My Profile</Text>
                </Pressable>
              ) : null}

              {deleteStep === 'askEvents' ? (
                <View style={styles.deletePanel}>
                  <Text style={styles.deleteTitle}>What should happen to your events?</Text>
                  <Pressable onPress={() => { setArchiveEventsNow(false); setDeleteStep('confirm'); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
                    <Text style={styles.primaryButtonText}>Keep Active Until Expiry</Text>
                  </Pressable>
                  <Pressable onPress={() => { setArchiveEventsNow(true); setDeleteStep('confirm'); }} style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed]}>
                    <Text style={styles.dangerButtonText}>Make Inactive Now</Text>
                  </Pressable>
                  <Pressable onPress={() => { setDeleteStep(null); setArchiveEventsNow(null); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}

              {deleteStep === 'confirm' ? (
                <View style={styles.deletePanel}>
                  <Text style={styles.deleteTitle}>This cannot be undone</Text>
                  <Text style={styles.deleteBody}>
                    Your account will be permanently deleted. {archiveEventsNow
                      ? 'Active events will be moved to inactive archive now.'
                      : 'Your events will remain active until their normal expiry date.'}
                  </Text>
                  <Pressable
                    disabled={authBusy}
                    onPress={confirmAccountDeletion}
                    style={({ pressed }) => [styles.dangerButton, pressed && styles.buttonPressed, authBusy && styles.buttonDisabled]}
                  >
                    {authBusy ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.dangerButtonText}>Yes, Delete My Profile</Text>}
                  </Pressable>
                  <Pressable
                    disabled={authBusy}
                    onPress={() => { setDeleteStep(null); setArchiveEventsNow(null); }}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, authBusy && styles.buttonDisabled]}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <Text style={styles.sectionHint}>Control how Events and Business Directory updates reach you.</Text>
            {[
              ['Push notifications', pushEnabled, setPushEnabled],
              ['SMS notifications', smsEnabled, setSmsEnabled],
              ['Email notifications', emailEnabled, setEmailEnabled],
              ['Community Events updates', eventNotifications, setEventNotifications],
              ['Prayer-time reminders', prayerReminders, setPrayerReminders],
              ['Business Directory updates', businessNotifications, setBusinessNotifications],
            ].map(([label, value, setter]) => (
              <View key={label} style={styles.preferenceRow}><Text style={styles.preferenceLabel}>{label}</Text><Switch value={value} onValueChange={setter} trackColor={{ false: colors.border, true: colors.teal }} /></View>
            ))}
            {deviceNotificationsAllowed === false ? (
              <View style={styles.notificationWarning}>
                <Text style={styles.notificationWarningText}>Android is blocking notifications for this app. The switches above cannot deliver alerts until phone permission is enabled.</Text>
                <Pressable onPress={() => openDeviceNotificationSettings()} style={styles.notificationSettingsButton}>
                  <Text style={styles.notificationSettingsButtonText}>Open Phone Settings</Text>
                </Pressable>
              </View>
            ) : null}
            <Text style={styles.inputLabel}>DEFAULT HOME MODULE</Text>
            <View style={styles.moduleChoice}>
              {[['events', 'Events'], ['directory', 'Business Directory']].map(([value, label]) => (
                <Pressable key={value} onPress={() => choosePreferredModule(value)} style={[styles.moduleChoiceButton, preferredModule === value && styles.moduleChoiceButtonActive]}><Text style={[styles.moduleChoiceText, preferredModule === value && styles.moduleChoiceTextActive]}>{label}</Text></Pressable>
              ))}
            </View>
            <Pressable disabled={profileBusy} onPress={saveNotifications} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save Notification Settings</Text></Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Share App</Text>
            <Text style={styles.bodySmall}>Invite your community to join Community Connect Australia.</Text>
            <Pressable onPress={shareApp} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.primaryButtonText}>Share the App</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Help &amp; Policies</Text>
            <View style={styles.diagnosticCard}>
              <View style={styles.diagnosticCopy}><Text style={styles.diagnosticLabel}>DIAGNOSTIC SESSION ID</Text><Text selectable style={styles.diagnosticValue}>{getDiagnosticSessionId()}</Text></View>
              <Pressable onPress={() => Clipboard.setStringAsync(getDiagnosticSessionId())} style={styles.copyButton}><Text style={styles.copyButtonText}>Copy</Text></Pressable>
            </View>
            {[
              ['Shia Majlis and Muharram programs across Australia', 'https://communityevents.siza.info/shia-events-australia.html'],
              ['User Guide', 'https://communityevents.siza.info/docs/user-guide.html'],
              ['Privacy Policy', 'https://communityevents.siza.info/privacy.html'],
              ['Terms of Use', 'https://communityevents.siza.info/terms.html'],
              ['Support & Contact', 'https://communityevents.siza.info/support.html'],
              ['Account Deletion Policy', 'https://communityevents.siza.info/delete-account.html'],
            ].map(([label, url]) => (
              <Pressable
                key={url}
                onPress={() => Linking.openURL(url).catch(() => setProfileValidation('Could not open this link.'))}
                style={({ pressed }) => [styles.policyLink, pressed && styles.buttonPressed]}
              >
                <Text style={styles.policyText}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>About</Text>
            <Image source={sizaLogo} resizeMode="contain" style={styles.sizaLogo} />
            <Text style={styles.aboutBrand}>SIZA</Text>
            <Text style={styles.aboutTagline}>{'CREATE \u2022 SHARE \u2022 CONNECT'}</Text>
            <Text style={styles.aboutTitle}>Community Connect Australia</Text>
            <Text style={styles.aboutBody}>{'An initiative by SIZA Apps, offered as a service to the community \u2014 helping build stronger, more connected communities.'}</Text>
            {appVersion ? <Text style={styles.buildText}>Version {appVersion}{appBuild ? ` \u00B7 Build ${appBuild}` : ''}</Text> : null}
          </View>
        </>
      ) : null}

      {profileValidation && !editingProfile && !loading && !isGuest ? <Text accessibilityRole="alert" style={styles.error}>{profileValidation}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  title: { color: colors.navy, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: -spacing.sm, marginBottom: spacing.xs },
  card: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.tealSoft },
  statusText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  cardTitle: { color: colors.navy, fontSize: 22, fontWeight: '900', marginTop: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { color: colors.navy, fontSize: 20, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
  bodySmall: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md },
  loadingText: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  inputGroup: { marginTop: spacing.md },
  inputLabel: { color: colors.navy, fontSize: 12, fontWeight: '900', marginBottom: 6, textTransform: 'uppercase' },
  moduleChoice: { flexDirection: 'row', padding: 3, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: '#edf2f1' },
  moduleChoiceButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 11 },
  moduleChoiceButtonActive: { backgroundColor: colors.surface, ...shadow },
  moduleChoiceText: { color: colors.muted, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  moduleChoiceTextActive: { color: colors.tealDark, fontWeight: '900' },
  preferenceRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  preferenceLabel: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  notificationWarning: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#f6b7b1',
    borderRadius: radius.md,
    backgroundColor: '#fff4f2',
  },
  notificationWarningText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  notificationSettingsButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.danger,
  },
  notificationSettingsButtonText: { color: colors.surface, fontSize: 13, fontWeight: '900' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  otpInput: { fontSize: 22, fontWeight: '900', letterSpacing: 8, textAlign: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  consentCopy: { flex: 1 },
  consentText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  legalLink: { color: colors.tealDark, fontSize: 12, fontWeight: '900', textDecorationLine: 'underline' },
  buttonRow: { gap: spacing.sm, marginTop: spacing.lg },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: { color: colors.tealDark, fontSize: 15, fontWeight: '900' },
  dangerButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  dangerButtonText: { color: colors.surface, fontSize: 15, fontWeight: '900' },
  linkButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.tealDark, fontSize: 13, fontWeight: '800' },
  inlineAction: {
    minHeight: 42,
    minWidth: 72,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
  },
  inlineActionPrimary: {
    backgroundColor: colors.teal,
  },
  inlineActionText: { color: colors.tealDark, fontSize: 14, fontWeight: '900' },
  inlineActionTextPrimary: { color: colors.surface },
  editActions: { marginTop: spacing.md },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  row: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  rowValue: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: spacing.xs },
  rowValueSubtle: { color: colors.muted },
  policyLink: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  policyText: { color: colors.tealDark, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  diagnosticCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  diagnosticCopy: { flex: 1 },
  diagnosticLabel: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  diagnosticValue: { marginTop: 3, color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  copyButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 10, backgroundColor: colors.surface },
  copyButtonText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  deleteWrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  deleteHeading: { color: colors.navy, fontSize: 17, fontWeight: '900' },
  deletePanel: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#fff8f7',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deleteTitle: { color: colors.navy, fontSize: 15, fontWeight: '900' },
  deleteBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  aboutBrand: { color: colors.tealDark, fontSize: 13, fontWeight: '900', marginTop: spacing.sm },
  sizaLogo: { width: '100%', height: 110, marginTop: spacing.md, borderRadius: radius.md },
  aboutTagline: { color: colors.muted, fontSize: 12, fontWeight: '900', marginTop: 4 },
  aboutTitle: { color: colors.navy, fontSize: 22, fontWeight: '900', marginTop: spacing.md },
  aboutBody: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  buildText: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.md },
  inlineError: { color: colors.danger, fontSize: 13, fontWeight: '800', marginTop: spacing.md },
  error: { width: '100%', maxWidth: 620, alignSelf: 'center', color: colors.danger, fontSize: 13, fontWeight: '800' },
  success: { width: '100%', maxWidth: 620, alignSelf: 'center', color: colors.tealDark, fontSize: 13, fontWeight: '800' },
});
