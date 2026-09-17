import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NativeBackButton from './NativeBackButton';
import { colors, radius, spacing } from '../theme';

export default function PageHeader({
  title,
  subtitle,
  eyebrow = 'COMMUNITY EVENTS',
  onBack,
  backAccessibilityLabel = 'Back',
  children,
  footer,
  style,
}) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.row}>
        {onBack ? <NativeBackButton onPress={onBack} accessibilityLabel={backAccessibilityLabel} /> : null}
        <View style={styles.copy}>
          {eyebrow ? <Text maxFontSizeMultiplier={1.2} style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>{title}</Text>
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
      {subtitle ? <Text maxFontSizeMultiplier={1.2} style={styles.subtitle}>{subtitle}</Text> : null}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.tealSoft,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  copy: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  footer: { marginTop: spacing.sm },
  eyebrow: { color: colors.tealDark, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  title: { color: colors.navy, fontSize: 18, lineHeight: 23, fontWeight: '700', marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },
});
