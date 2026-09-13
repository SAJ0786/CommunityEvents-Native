import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NativeBackButton from './NativeBackButton';
import { colors, radius, spacing } from '../theme';

// One header language for all admin subpages, beneath the shared app header.
export default function AdminPageHeader({ title, subtitle, onBack, children }) {
  return <View style={styles.header}>
    <View style={styles.row}>
      <NativeBackButton onPress={onBack} accessibilityLabel="Back to admin dashboard" />
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>ADMIN DASHBOARD</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  header: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.tealSoft, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  copy: { flex: 1, minWidth: 0 }, actions: { flexDirection: 'row', alignItems: 'center' },
  eyebrow: { color: colors.tealDark, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  title: { color: colors.navy, fontSize: 18, lineHeight: 23, fontWeight: '700', marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
});
