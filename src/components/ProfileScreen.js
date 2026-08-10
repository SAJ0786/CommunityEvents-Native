import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';
import { cityLabel } from '../utils/cities';

function ProfileRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text maxFontSizeMultiplier={1.2} style={styles.rowLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

export default function ProfileScreen({ user, profile, loading, error }) {
  const isGuest = !user || user.isAnonymous;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text maxFontSizeMultiplier={1.2} style={styles.title}>Profile</Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.subtitle}>
        Your account and app preferences
      </Text>

      {loading ? (
        <View style={styles.card}>
          <ActivityIndicator color={colors.teal} size="large" />
          <Text maxFontSizeMultiplier={1.2} style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : null}

      {!loading && isGuest ? (
        <View style={styles.card}>
          <View style={styles.statusPill}>
            <Text maxFontSizeMultiplier={1.2} style={styles.statusText}>GUEST MODE</Text>
          </View>
          <Text maxFontSizeMultiplier={1.2} style={styles.cardTitle}>Browsing as a guest</Text>
          <Text maxFontSizeMultiplier={1.2} style={styles.body}>
            You can browse public community events. Signing in will unlock favourites,
            event creation, reminders, and saved profile preferences.
          </Text>

          <View style={styles.phaseNotice}>
            <Text maxFontSizeMultiplier={1.2} style={styles.noticeTitle}>Phone sign-in is next</Text>
            <Text maxFontSizeMultiplier={1.2} style={styles.noticeText}>
              Native SMS verification requires an Expo development build with the Firebase
              iOS and Android app configuration. Expo Go cannot provide that native verifier.
            </Text>
          </View>
        </View>
      ) : null}

      {!loading && !isGuest ? (
        <View style={styles.card}>
          <View style={styles.statusPill}>
            <Text maxFontSizeMultiplier={1.2} style={styles.statusText}>SIGNED IN</Text>
          </View>
          <Text maxFontSizeMultiplier={1.2} style={styles.cardTitle}>
            {profile?.fullName || user.displayName || 'Community member'}
          </Text>
          <ProfileRow label="Email" value={profile?.email || user.email} />
          <ProfileRow label="Phone" value={profile?.phone || user.phoneNumber} />
          <ProfileRow label="Role" value={profile?.role || 'user'} />
          <ProfileRow
            label="Default city"
            value={profile?.defaultCity ? cityLabel(profile.defaultCity) : ''}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.navy,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
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
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.tealSoft,
  },
  statusText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },
  cardTitle: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  body: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  phaseNotice: {
    padding: spacing.md,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
  },
  noticeTitle: {
    color: colors.tealDark,
    fontSize: 15,
    fontWeight: '900',
  },
  noticeText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  row: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rowValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
